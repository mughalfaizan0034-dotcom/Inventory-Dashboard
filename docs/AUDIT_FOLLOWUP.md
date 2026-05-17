# Audit Follow-Up Plan

This document captures the four heavier items deferred from the
enterprise-grade security/performance/architecture audit. Each section
contains the problem, the file:line evidence, and a step-by-step
implementation plan.

Issued: 2026-05-17
Source: full-stack audit (see chat transcript / FINDINGS report)
Session-1 fixes that already landed (do NOT re-do):
- M1: `/auth/switch-org` `is_active` check
- M2: frontend `switchOrg` writes new refresh token
- M5: deleted dead BQ-v2 fallback proxy
- L2: deleted dead `notIgnored` SQL fragment
- M9: deleted dead `ALLOWED_MIME` constant
- M10: deleted orphan `.tmp` file + added `*.tmp.*` to `.gitignore`
- M6: deleted orphan API methods + `GET /inventory/` + `GET /inventory/export`
       + `inventoryService.list/exportAll` + `inventoryRepository.findAll/exportAll`
- M7: deleted `backend/*.gs` legacy Apps Script
- M8: archived legacy migration JSONs under `server/migrations/_archive/`
- H1: introduced backend KPI cache (per-org, 60s TTL, real `invalidateKPICache`)

---

## C1 — BigQuery partition/cluster migration (highest cost-impact)

### Problem
The two largest BigQuery tables have no partitioning or clustering:
- [server/sql/schema/04_inventory.sql](../server/sql/schema/04_inventory.sql)
- [server/sql/schema/05_orders.sql](../server/sql/schema/05_orders.sql)

Every query (`WHERE organization_id = @x` and `WHERE order_date >= @date`)
scans the entire physical table. Cost grows multiplicatively with orgs ×
active users × page loads.

The older migration `002_inventory_schema.sql` had `CLUSTER BY
organization_id, sku` and `CLUSTER BY organization_id, order_date` — that
was lost when the canonical DDL was rewritten.

### Target schema
```sql
-- inventory
CREATE TABLE patman-inventory.patman_inventory.inventory_new (
  ... same columns ...
)
CLUSTER BY organization_id, sku;

-- orders
CREATE TABLE patman-inventory.patman_inventory.orders_new (
  ... same columns ...
)
PARTITION BY DATE(SAFE_CAST(order_date AS DATE))
CLUSTER BY organization_id, sku;
```

Why partition `orders` by `order_date` and not `created_at`:
- All filtering in `dashboardRepository.getPerformance` already uses
  `SAFE_CAST(order_date AS DATE)` predicates. Partition pruning will kick
  in automatically.
- `created_at` is upload-time which has near-flat distribution and doesn't
  help pruning.

Why cluster `inventory` only (no partition):
- No timestamp-shaped predicate in the inventory hot path.
- Clustering by `(organization_id, sku)` is exactly aligned with every
  `WHERE organization_id = @x [AND sku = @y]` access pattern.

### Migration plan (zero-downtime)
1. **Create new tables** with partition + cluster:
   ```sql
   CREATE TABLE patman-inventory.patman_inventory.inventory_new
   PARTITION BY ...
   CLUSTER BY organization_id, sku
   AS SELECT * FROM patman-inventory.patman_inventory.inventory;
   ```
2. **Verify row counts match**:
   ```sql
   SELECT COUNT(*) FROM inventory;
   SELECT COUNT(*) FROM inventory_new;
   ```
3. **Atomic rename**:
   ```sql
   ALTER TABLE inventory RENAME TO inventory_old;
   ALTER TABLE inventory_new RENAME TO inventory;
   ```
4. **Smoke-test the app** against the renamed table (read paths).
5. **Drop the old table** after a 24-hour grace period.
6. Repeat for `orders`.

### Pitfalls to avoid
- BigQuery's `CREATE TABLE ... AS SELECT` doesn't carry partitioning;
  must be declared explicitly in the new DDL.
- Streaming inserts to a recently-created table can have a buffer delay;
  pause uploads during the swap window (~5 minutes).
- Run during low-traffic window; the verification COUNT pair can be
  ~30 seconds for very large tables.

### Expected impact
- 5-10× scan reduction on dashboard queries (only the org's slice).
- Partition pruning on date-range queries: `Last 12 weeks` reads
  ~12 partitions instead of full history.
- No application code change required.

---

## C2 — Refresh-token revocation table (highest security-impact)

### Problem
[server/src/repositories/refreshTokensRepository.js](../server/src/repositories/refreshTokensRepository.js)
is a fully-stubbed module. `isRevoked()` returns `false`. No `save()` is
ever called. A leaked refresh token works for the full
`JWT_REFRESH_EXPIRES` (7 days) regardless of password change, logout, or
user deactivation.

### Target table
```sql
CREATE TABLE patman-inventory.patman_inventory.refresh_tokens (
  jti              STRING    NOT NULL,
  user_id          STRING    NOT NULL,
  organization_id  STRING,
  created_at       TIMESTAMP NOT NULL,
  expires_at       TIMESTAMP NOT NULL,
  revoked          BOOL      NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMP,
  revoked_reason   STRING               -- 'logout' | 'password_change' | 'user_deactivated' | 'admin'
)
PARTITION BY DATE(expires_at)
CLUSTER BY user_id, jti;
```

### Implementation steps
1. **Migration file** `server/sql/migrations/20260517_001_create_refresh_tokens.sql`
   with the DDL above.
2. **Implement the repo methods** in `refreshTokensRepository.js`:
   - `save(jti, userId, organizationId, expiresAt)` — DML INSERT
   - `isRevoked(jti)` — SELECT revoked WHERE jti; unknown jti = treat as revoked
   - `revoke(jti, reason)` — UPDATE SET revoked = TRUE
   - `revokeAllForUser(userId, reason)` — UPDATE all user's tokens
3. **Wire into the auth flow** (`server/src/routes/auth.js`):
   - After every `tokenFactory.signRefreshToken()`, call `save()`.
   - At the top of `/auth/refresh`, after JWT verify, decode the `jti`
     and call `isRevoked()` — reject with 401 if revoked.
4. **Add `/auth/logout`** endpoint that calls `revoke(jti, 'logout')`.
   Frontend should call this before clearing local session.
5. **Wire `revokeAllForUser`** into:
   - `usersService.updateGlobalUser` when `is_active` becomes false
   - `usersService.updateGlobalUser` when password changes
6. **Inject `refreshTokensRepo`** into the auth route module in `server.js`.

### Frontend changes
- [js/auth.js](../js/auth.js) `logout()` — POST `/auth/logout` with the
  refresh token in the body before clearing local storage.

### Pitfalls to avoid
- Don't `revoke()` synchronously on every refresh — keep refresh-token
  rotation: revoke the old `jti` and save the new one in the SAME flow.
  Otherwise an interrupted refresh leaves the user with no usable token.
- `revoke` failures must not fail the login/logout endpoint — wrap in
  try/catch and log; security degrades to "as before" but the user
  isn't locked out.

### Expected impact
- Logout actually invalidates the refresh token immediately.
- Password change immediately invalidates all sessions for that user.
- User deactivation immediately invalidates all sessions.
- Auditable revocation trail.

---

## Materialized summary tables (architecturally cleanest performance win)

### Problem
H1 (KPI cache) shipped a 60s in-memory cache, which fixes the common
read pattern (dashboard load → tab focus → idle). It does NOT eliminate
the underlying BigQuery scans — every cache miss still runs the full
`_ordersAggCTE` + `_invAggCTE` + `_perSkuCTE` pipeline against the raw
tables.

Architecture mandate (your direction): "ensure summaries rebuild ONLY
after uploads / deletes / shipped SKU reassignment / inventory mutations
/ validation structure changes."

### Target tables
```sql
-- dashboard-level summary: one row per org, refreshed on upload/edit/delete
CREATE TABLE patman-inventory.patman_inventory.dashboard_summary (
  organization_id          STRING    NOT NULL,
  total_skus               INT64,
  total_units              INT64,
  fulfilled_units          INT64,
  phantom_units            INT64,
  physical_remaining_units INT64,
  in_stock_skus            INT64,
  oos_skus                 INT64,
  phantom_skus             INT64,
  undefined_skus           INT64,
  units_sold_raw           INT64,
  unknown_units_sold       INT64,
  unknown_orders           INT64,
  wrong_part_units         INT64,
  total_orders             INT64,
  active_platforms         INT64,
  refreshed_at             TIMESTAMP NOT NULL
)
CLUSTER BY organization_id;

-- per-SKU summary: powers SKU View directly
CREATE TABLE patman-inventory.patman_inventory.inventory_summary (
  organization_id   STRING    NOT NULL,
  sku               STRING    NOT NULL,
  total_stock       INT64,
  sold_units        INT64,
  fulfilled_units   INT64,
  phantom_units     INT64,
  remaining_units   INT64,
  boxes_count       INT64,
  last_added_at     STRING,
  part_number       STRING,
  upc               STRING,
  is_undefined      BOOL,
  refreshed_at      TIMESTAMP NOT NULL
)
CLUSTER BY organization_id, sku;

-- box-level summary: powers Box Lookup
CREATE TABLE patman-inventory.patman_inventory.box_summary (
  organization_id   STRING    NOT NULL,
  upc               STRING    NOT NULL,
  part_number       STRING    NOT NULL,
  box_number        STRING    NOT NULL,
  initial_stock     INT64,
  fulfilled_units   INT64,
  phantom_units     INT64,
  remaining_stock   INT64,
  refreshed_at      TIMESTAMP NOT NULL
)
CLUSTER BY organization_id, upc;
```

### Refresh strategy
Create `summaryRefreshService.refresh(orgId)` that runs three DML
INSERT...SELECT statements (using the existing CTE templates from
`inventoryMetricsService`) into the summary tables, scoped to a single
org. Total runtime per org: 2-5 seconds.

Trigger points:
- `uploadsService.processInventoryUpload` — after the upload commits
- `uploadsService.processOrdersUpload` — after the upload commits
- `inventoryService.updateRow` — after any inventory edit
- `inventoryService.deleteRows` — after any inventory delete
- `ordersService.updateRow` — after any shipped-SKU reassignment
- `ordersService.deleteRows` — after any order delete
- `organizationsRepo.update` — when `sku_structure` changes (affects
  `is_undefined` classification)

### Read-path changes
- `dashboardService.getKPIs(orgId)` → single `SELECT * FROM dashboard_summary
  WHERE organization_id = @orgId LIMIT 1`. No CTEs.
- `inventoryMetricsService.getSkuSummary(orgId, opts)` → `SELECT ... FROM
  inventory_summary WHERE organization_id = @orgId AND <filters>
  ORDER BY ... LIMIT N OFFSET M`. No CTEs.
- `lookupRepository.search(orgId, q)` → `SELECT ... FROM box_summary
  WHERE organization_id = @orgId AND (upc = @q OR part_number = @q)`.
- The in-memory KPI cache (H1) can be REMOVED after this lands — the
  read is already cheap.

### Pitfalls to avoid
- Refresh failures must not fail the originating upload/edit. Wrap in
  try/catch + log; stale-by-1-upload is acceptable, broken upload is not.
- The `refreshed_at` column lets the UI show a "Updated X seconds ago"
  marker if needed.
- During the transition, run BOTH the live CTE and the summary read in
  parallel for a week and diff the results in logs. Cut over when zero
  diffs.

### Expected impact
- Dashboard load: 2 BQ queries (~1.5s) → 1 BQ query (~50ms) → with cache:
  ~5ms.
- SKU View load: 1 large BQ query (~1s) → 1 small index seek (~100ms).
- Box Lookup: similar 10× improvement.
- Multi-org cost scales linearly with org count, not with org × user
  × page-view.

---

## M3 — Merge dashboard's two BQ queries into one + M4 — Activity log to DML INSERT + partitioning

### M3: dashboard query consolidation
[server/src/services/inventoryMetricsService.js:162-165](../server/src/services/inventoryMetricsService.js#L162-L165)

`summaryQuery` (per-SKU pivot) and `ordersQuery` (raw totals + unknown counts
via LEFT JOIN to inv_skus) currently run as `Promise.all`. They share the
`inv_skus` CTE conceptually.

Fix: rewrite as one query returning two row groups (UNION ALL with a `kind`
column, or use a single `WITH ...` that returns a struct).

Halves BQ requests on the hot path. This becomes moot once materialized
summaries land — leave M3 until after that decision is made.

### M4: activity log
[server/src/repositories/activityRepository.js:28](../server/src/repositories/activityRepository.js#L28)

Currently uses `dataset.table('activity_log').insert([row])` — streaming
inserts API. Costs more per row than DML and has a 90-min buffer that
delays UPDATEs/DELETEs against recent rows.

Fix:
1. Migration: rebuild `activity_log` with
   `PARTITION BY DATE(created_at) CLUSTER BY organization_id, action_type`.
2. Switch `activityRepository.log` to DML INSERT (mirror
   `uploadsRepository.insertOrdersBatch` pattern).
3. Verify cost dashboard shows the drop (typically ~70%).
