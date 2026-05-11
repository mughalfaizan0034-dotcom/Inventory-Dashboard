import { TABLES } from '../config/tables.js';

export function createLookupRepository({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  async function search(organizationId, query) {
    const q = (query || '').trim();
    if (!q) return [];

    // Aggregate inventory by SKU first so that multiple rows for the same SKU
    // (valid when 1 physical unit = 1 row) are summed before joining with orders.
    // Without this, a SKU with N rows joins once per row to the same ord_summary
    // entry, multiplying units_sold by N and producing wrong remaining counts.
    const sql = `
      WITH inv_grouped AS (
        SELECT
          sku,
          COALESCE(upc, '')         AS upc,
          COALESCE(part_number, '') AS part_number,
          COALESCE(box_number, '')  AS box_number,
          SUM(quantity)             AS initial_stock
        FROM ${invTable}
        WHERE organization_id = @organizationId
          AND (
            LOWER(TRIM(COALESCE(upc, '')))         = LOWER(TRIM(@query))
            OR LOWER(TRIM(COALESCE(part_number, ''))) = LOWER(TRIM(@query))
          )
        GROUP BY sku, upc, part_number, box_number
      ),
      ord_summary AS (
        SELECT
          CASE
            WHEN shipped_from_box IS NOT NULL
                 AND TRIM(CAST(shipped_from_box AS STRING)) != ''
                 AND REGEXP_CONTAINS(sku, r'^ARA[0-9]+-.+$')
            THEN CONCAT('ARA', TRIM(CAST(shipped_from_box AS STRING)), REGEXP_EXTRACT(sku, r'^ARA[0-9]+(.+)$'))
            ELSE sku
          END AS effective_sku,
          SUM(quantity_sold) AS units_sold
        FROM ${ordTable}
        WHERE organization_id = @organizationId
        GROUP BY effective_sku
      )
      SELECT
        ig.sku,
        ig.upc,
        ig.part_number,
        ig.box_number,
        ig.initial_stock,
        COALESCE(o.units_sold, 0)                AS units_sold,
        ig.initial_stock - COALESCE(o.units_sold, 0) AS remaining_stock
      FROM inv_grouped ig
      LEFT JOIN ord_summary o ON ig.sku = o.effective_sku
      ORDER BY ig.part_number, ig.upc, remaining_stock DESC
    `;

    const [rows] = await bq.query({
      query: sql,
      params: { organizationId, query: q },
    });
    return rows.map(r => ({
      ...r,
      initial_stock:   Number(r.initial_stock   ?? 0),
      units_sold:      Number(r.units_sold       ?? 0),
      remaining_stock: Number(r.remaining_stock  ?? 0),
    }));
  }

  return { search };
}
