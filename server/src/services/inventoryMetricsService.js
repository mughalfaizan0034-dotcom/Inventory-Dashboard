import { TABLES } from '../config/tables.js';
import { isUndefinedSql, isUndefinedRowSql } from '../utils/inventoryPatterns.js';
import { effectiveSkuSql } from '../utils/skuPatterns.js';

/**
 * inventoryMetricsService — single source of truth for all dashboard KPI math.
 *
 * MUST match the per-row math used by the Inventory List page (otherwise the
 * dashboard tells a different story than the page users export from). The
 * Inventory List query in inventoryRepository.findAll is the canonical
 * reference — it joins each inventory ROW to that SKU's aggregated order
 * count, then computes:
 *
 *   per-row fulfilled = LEAST(ordered_for_sku, row.quantity)
 *   per-row phantom   = GREATEST(ordered_for_sku - row.quantity, 0)
 *   per-row remaining = GREATEST(row.quantity - ordered_for_sku, 0)
 *
 * KPI counts use ROW counts (not distinct-SKU counts) so totals add up the
 * way the user sees them in the Inventory List:
 *   total       = COUNT(*) of inventory rows
 *   in_stock    = COUNTIF(remaining > 0)
 *   oos         = COUNTIF(remaining = 0)         ← phantom rows are a SUBSET of OOS
 *   phantom_rows = COUNTIF(phantom > 0)
 *
 *   in_stock + oos = total   (mutually exclusive by sign of remaining)
 *   phantom_rows ⊆ oos       (phantom always implies remaining=0)
 */
export function createInventoryMetricsService({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  // ── Shared CTE: ARA-aware order aggregation by effective SKU ──────────────
  const _ordersAggCTE = () => `
    orders_agg AS (
      SELECT
        ${effectiveSkuSql()} AS effective_sku,
        SUM(quantity_sold) AS ordered
      FROM ${ordTable}
      WHERE organization_id = @organizationId
      GROUP BY effective_sku
    )`;

  // ── Per-ROW stock math (mirror of inventoryRepository.findAll) ────────────
  // One row per inventory row. orders_agg supplies the SKU-level ordered
  // count, which is then capped against this row's quantity.
  const _perRowCTE = () => `
    per_row AS (
      SELECT
        i.row_uid,
        i.sku,
        i.quantity                                              AS initial_qty,
        COALESCE(o.ordered, 0)                                  AS ordered,
        LEAST(COALESCE(o.ordered, 0), i.quantity)               AS fulfilled,
        GREATEST(COALESCE(o.ordered, 0) - i.quantity, 0)        AS phantom,
        GREATEST(i.quantity - COALESCE(o.ordered, 0), 0)        AS remaining,
        ${isUndefinedRowSql('i')}                               AS is_undefined
      FROM ${invTable} i
      LEFT JOIN orders_agg o ON i.sku = o.effective_sku
      WHERE i.organization_id = @organizationId
    )`;

  // ─────────────────────────────────────────────────────────────────────────
  // computeSummary — ALL dashboard KPIs in one query
  // ─────────────────────────────────────────────────────────────────────────
  async function computeSummary(organizationId) {
    const p = { organizationId };

    const summaryQuery = `
      WITH ${_ordersAggCTE()},
      ${_perRowCTE()}
      SELECT
        COUNT(*)                              AS total_rows,
        SUM(initial_qty)                      AS total_inventory_units,
        SUM(remaining)                        AS physical_remaining_units,
        SUM(fulfilled)                        AS fulfilled_units,
        SUM(phantom)                          AS phantom_units,
        COUNTIF(remaining > 0)                AS in_stock_rows,
        COUNTIF(remaining = 0)                AS oos_rows,
        COUNTIF(phantom > 0)                  AS phantom_rows,
        COUNTIF(is_undefined)                 AS undefined_inventory_rows
      FROM per_row
    `;

    // unknown_units = SUM(quantity_sold) for orders whose effective SKU is
    // not in inventory (mapped_inventory_sku rescues a few). These units
    // never deduct from any inventory row, so they must NOT be counted in
    // fulfilled — they appear under the dashboard's "Unknown" sub-value.
    const ordersQuery = `
      WITH eff AS (
        SELECT
          ${effectiveSkuSql()} AS effective_sku,
          mapped_inventory_sku,
          quantity_sold,
          platform
        FROM ${ordTable}
        WHERE organization_id = @organizationId
      ),
      inv_skus AS (
        SELECT DISTINCT sku FROM ${invTable} WHERE organization_id = @organizationId
      )
      SELECT
        COUNT(*)                                                       AS total_orders,
        SUM(quantity_sold)                                             AS units_sold_raw,
        COUNT(DISTINCT CASE WHEN platform IS NOT NULL THEN platform END) AS active_platforms,
        0                                                              AS ignored_orders,
        -- Unknown UNITS: sum of quantity_sold for orders whose resolved
        -- SKU (mapped override OR effective_sku) is not in inventory.
        SUM(IF(
          COALESCE(mapped_inventory_sku, effective_sku) NOT IN (SELECT sku FROM inv_skus),
          quantity_sold,
          0
        ))                                                             AS unknown_units_sold,
        -- Distinct count of unknown effective SKUs (informational).
        COUNT(DISTINCT IF(
          COALESCE(mapped_inventory_sku, effective_sku) NOT IN (SELECT sku FROM inv_skus),
          effective_sku,
          NULL
        ))                                                             AS undefined_sku_count
      FROM eff
    `;

    try {
      const [invRow, ordRow] = await Promise.all([
        bq.query({ query: summaryQuery, params: p }).then(r => r[0][0] ?? {}),
        bq.query({ query: ordersQuery,  params: p }).then(r => r[0][0] ?? {}),
      ]);

      const unitsSoldRaw           = Number(ordRow.units_sold_raw          ?? 0);
      const fulfilledUnits         = Number(invRow.fulfilled_units         ?? 0);
      const phantomUnits           = Number(invRow.phantom_units           ?? 0);
      const physicalRemainingUnits = Number(invRow.physical_remaining_units ?? 0);
      // Unknown UNITS come straight from SQL — orders whose resolved SKU
      // doesn't exist in inventory. Not derived from `unitsSoldRaw - fulfilled
      // - phantom` because per-row math can over-count when an SKU appears
      // in multiple inventory rows.
      const unknownUnitsSold       = Number(ordRow.unknown_units_sold      ?? 0);
      const actualUnitsSold        = fulfilledUnits;

      return {
        // Inventory KPIs — per-ROW counts (mirror of Inventory List page)
        totalSkus:              Number(invRow.total_rows                ?? 0),
        totalUnits:             Number(invRow.total_inventory_units     ?? 0),
        actualUnitsSold,
        fulfilledUnits,
        physicalRemainingUnits,
        phantomUnits,
        inStockSkus:            Number(invRow.in_stock_rows             ?? 0),
        // OOS includes phantom rows (remaining = 0 regardless of phantom),
        // matching the Inventory List's "OOS" classification.
        oosSkus:                Number(invRow.oos_rows                  ?? 0),
        phantomSkus:            Number(invRow.phantom_rows              ?? 0),
        undefinedSkus:          Number(invRow.undefined_inventory_rows  ?? 0),
        // Sales KPIs
        unitsSold:              unitsSoldRaw,
        unknownUnitsSold,
        totalOrders:            Number(ordRow.total_orders              ?? 0),
        activePlatforms:        Number(ordRow.active_platforms          ?? 0),
        ignoredOrders:          Number(ordRow.ignored_orders            ?? 0),
        undefinedSkuCount:      Number(ordRow.undefined_sku_count       ?? 0),
        // Aliases used by existing frontend field references
        remainingStock:         physicalRemainingUnits,
      };
    } catch (err) {
      console.error('[inventoryMetrics.computeSummary] failed:', err?.message ?? err);
      return {
        totalSkus: 0, totalUnits: 0, actualUnitsSold: 0, fulfilledUnits: 0, physicalRemainingUnits: 0,
        phantomUnits: 0, inStockSkus: 0, oosSkus: 0, phantomSkus: 0, undefinedSkus: 0,
        unitsSold: 0, unknownUnitsSold: 0,
        totalOrders: 0, activePlatforms: 0, ignoredOrders: 0, undefinedSkuCount: 0,
        remainingStock: 0,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getStockAnalytics — inventory intelligence charts and tables
  // All formulas use GREATEST/LEAST for correct physical stock math
  // ─────────────────────────────────────────────────────────────────────────
  async function getStockAnalytics(organizationId) {
    const p = { organizationId };

    // Per-ROW classification, identical to computeSummary above. We slice
    // OOS into phantom and non-phantom so the chart can show both.
    const stockStatusQuery = `
      WITH ${_ordersAggCTE()},
      per_row AS (
        SELECT
          GREATEST(i.quantity - COALESCE(o.ordered, 0), 0) AS remaining,
          GREATEST(COALESCE(o.ordered, 0) - i.quantity, 0) AS phantom,
          ${isUndefinedRowSql('i')} AS is_undefined
        FROM ${invTable} i
        LEFT JOIN orders_agg o ON i.sku = o.effective_sku
        WHERE i.organization_id = @organizationId
      )
      SELECT
        CASE
          WHEN is_undefined  THEN 'Undefined'
          WHEN phantom > 0   THEN 'Phantom'
          WHEN remaining = 0 THEN 'OOS'
          ELSE 'In Stock'
        END AS status,
        COUNT(*) AS count
      FROM per_row
      GROUP BY status
      ORDER BY count DESC
    `;

    const healthByMonthQuery = `
      WITH ${_ordersAggCTE()},
      per_row AS (
        SELECT
          LEFT(COALESCE(CAST(i.date_added AS STRING), ''), 7) AS month,
          GREATEST(i.quantity - COALESCE(o.ordered, 0), 0)    AS remaining,
          GREATEST(COALESCE(o.ordered, 0) - i.quantity, 0)    AS phantom
        FROM ${invTable} i
        LEFT JOIN orders_agg o ON i.sku = o.effective_sku
        WHERE i.organization_id = @organizationId
          AND i.date_added IS NOT NULL
          AND LENGTH(CAST(i.date_added AS STRING)) >= 7
      )
      SELECT
        month,
        COUNTIF(remaining > 0 AND phantom = 0) AS in_stock,
        COUNTIF(remaining = 0 AND phantom = 0) AS oos,
        COUNTIF(phantom > 0)                   AS phantom,
        COUNT(*)                               AS total
      FROM per_row
      WHERE month != '' AND month IS NOT NULL
      GROUP BY month
      ORDER BY month ASC
      LIMIT 24
    `;

    const run = (query, label) =>
      bq.query({ query, params: p })
        .then(r => r[0])
        .catch(err => {
          console.error(`[inventoryMetrics.getStockAnalytics] ${label} failed:`, err?.message ?? err);
          return [];
        });

    const [stockStatus, healthByMonth] = await Promise.all([
      run(stockStatusQuery,   'stockStatus'),
      run(healthByMonthQuery, 'healthByMonth'),
    ]);

    return { stockStatus, healthByMonth };
  }

  return { computeSummary, getStockAnalytics };
}
