import { TABLES } from '../config/tables.js';

export function createDashboardRepository({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  async function getKPIs(organizationId) {
    const query = `
      SELECT
        COUNT(*)                           AS total_skus,
        COUNTIF(quantity = 0)              AS out_of_stock,
        COUNTIF(quantity BETWEEN 1 AND 10) AS low_stock,
        SUM(quantity)                      AS total_units
      FROM ${invTable}
      WHERE organization_id = @organizationId
    `;
    try {
      const [rows] = await bq.query({ query, params: { organizationId } });
      const r = rows[0] ?? {};
      return {
        total_skus:   Number(r.total_skus   ?? 0),
        out_of_stock: Number(r.out_of_stock ?? 0),
        low_stock:    Number(r.low_stock    ?? 0),
        total_units:  Number(r.total_units  ?? 0),
      };
    } catch {
      return { total_skus: 0, out_of_stock: 0, low_stock: 0, total_units: 0 };
    }
  }

  async function getPerformance(organizationId, weeks = 12) {
    const safeWeeks = Math.min(Math.max(parseInt(weeks, 10) || 12, 1), 52);
    const query = `
      SELECT
        DATE_TRUNC(order_date, WEEK)  AS week_start,
        SUM(quantity_sold)            AS units_sold,
        COUNT(DISTINCT order_id)      AS orders
      FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
      GROUP BY week_start
      ORDER BY week_start ASC
    `;
    try {
      const [rows] = await bq.query({ query, params: { organizationId } });
      return rows;
    } catch {
      return [];
    }
  }

  return { getKPIs, getPerformance };
}
