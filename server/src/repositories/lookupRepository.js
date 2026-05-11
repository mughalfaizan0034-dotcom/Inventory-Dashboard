import { TABLES } from '../config/tables.js';

export function createLookupRepository({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  async function search(organizationId, query) {
    const q = (query || '').trim();
    if (!q) return [];

    const sql = `
      WITH ord_summary AS (
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
        i.sku,
        COALESCE(i.upc, '')         AS upc,
        COALESCE(i.part_number, '') AS part_number,
        COALESCE(i.box_number, '')  AS box_number,
        i.quantity                  AS initial_stock,
        COALESCE(o.units_sold, 0)   AS units_sold,
        i.quantity - COALESCE(o.units_sold, 0) AS remaining_stock
      FROM ${invTable} i
      LEFT JOIN ord_summary o ON i.sku = o.effective_sku
      WHERE i.organization_id = @organizationId
        AND (
          LOWER(TRIM(i.upc))         = LOWER(TRIM(@query))
          OR LOWER(TRIM(i.part_number)) = LOWER(TRIM(@query))
        )
      ORDER BY i.part_number, i.upc, remaining_stock DESC
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
