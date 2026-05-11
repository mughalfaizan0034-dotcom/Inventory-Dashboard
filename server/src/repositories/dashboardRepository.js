import { TABLES } from '../config/tables.js';

export function createDashboardRepository({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  async function getKPIs(organizationId) {
    const query = `
      SELECT
        COUNT(*)                                                         AS total_skus,
        COUNTIF((initial_stock - units_sold + units_returned) <= 0)     AS out_of_stock,
        COUNTIF((initial_stock - units_sold + units_returned) BETWEEN 1 AND 10) AS low_stock,
        SUM(initial_stock - units_sold + units_returned)                AS total_units,
        COUNT(DISTINCT platform)                                        AS platforms
      FROM ${invTable}
      WHERE organization_id = @organizationId
        AND is_active = TRUE
    `;
    const [rows] = await bq.query({ query, params: { organizationId } });
    const r = rows[0] ?? {};
    return {
      total_skus:    Number(r.total_skus   ?? 0),
      out_of_stock:  Number(r.out_of_stock ?? 0),
      low_stock:     Number(r.low_stock    ?? 0),
      total_units:   Number(r.total_units  ?? 0),
      platforms:     Number(r.platforms    ?? 0),
    };
  }

  async function getPerformance(organizationId, weeks = 12) {
    const safeWeeks = Math.min(Math.max(parseInt(weeks, 10) || 12, 1), 52);
    const query = `
      SELECT
        DATE_TRUNC(order_date, WEEK)  AS week_start,
        SUM(revenue)                  AS revenue,
        SUM(quantity)                 AS units_sold,
        COUNT(DISTINCT order_id)      AS orders
      FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
      GROUP BY week_start
      ORDER BY week_start ASC
    `;
    const [rows] = await bq.query({ query, params: { organizationId } });
    return rows;
  }

  return { getKPIs, getPerformance };
}
