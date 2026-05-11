import { TABLES } from '../config/tables.js';

export function createDashboardRepository({ bq, projectId }) {
  const invTable    = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable    = `\`${projectId}.${TABLES.ORDERS}\``;
  const invUplTable = `\`${projectId}.${TABLES.INVENTORY_UPLOADS}\``;
  const ordUplTable = `\`${projectId}.${TABLES.ORDER_UPLOADS}\``;

  async function getKPIs(organizationId) {
    const invQuery = `
      SELECT COUNT(*) AS total_skus, SUM(quantity) AS total_units
      FROM ${invTable}
      WHERE organization_id = @organizationId
    `;

    const ordQuery = `
      SELECT
        COUNT(*)                  AS total_orders,
        SUM(quantity_sold)        AS units_sold,
        COUNT(DISTINCT CASE WHEN platform IS NOT NULL THEN platform END) AS active_platforms
      FROM ${ordTable}
      WHERE organization_id = @organizationId
    `;

    const metricsQuery = `
      WITH inv AS (
        SELECT sku, quantity FROM ${invTable} WHERE organization_id = @organizationId
      ),
      ord AS (
        SELECT sku, SUM(quantity_sold) AS sold
        FROM ${ordTable} WHERE organization_id = @organizationId
        GROUP BY sku
      ),
      remaining AS (
        SELECT i.quantity - COALESCE(o.sold, 0) AS rem
        FROM inv i LEFT JOIN ord o USING(sku)
      )
      SELECT
        ABS(SUM(CASE WHEN rem < 0 THEN rem ELSE 0 END)) AS phantom_units,
        (
          SELECT COUNT(DISTINCT o2.sku)
          FROM ${ordTable} o2
          WHERE o2.organization_id = @organizationId
            AND o2.sku NOT IN (SELECT sku FROM inv)
        ) AS undefined_sku_orders
      FROM remaining
    `;

    const undefinedSkusQuery = `
      SELECT COUNT(*) AS undefined_skus
      FROM ${invTable}
      WHERE organization_id = @organizationId
        AND (
          UPPER(TRIM(COALESCE(sku, '')))         IN ('NA','N/A','')
          OR UPPER(TRIM(COALESCE(upc, '')))      IN ('NA','N/A','')
          OR UPPER(TRIM(COALESCE(part_number,''))) IN ('NA','N/A','')
        )
    `;

    try {
      const [invR, ordR, metR, undR] = await Promise.all([
        bq.query({ query: invQuery,            params: { organizationId } }).then(r => r[0][0] ?? {}),
        bq.query({ query: ordQuery,            params: { organizationId } }).then(r => r[0][0] ?? {}),
        bq.query({ query: metricsQuery,        params: { organizationId } }).then(r => r[0][0] ?? {}),
        bq.query({ query: undefinedSkusQuery,  params: { organizationId } }).then(r => r[0][0] ?? {}),
      ]);

      const totalUnits = Number(invR.total_units ?? 0);
      const unitsSold  = Number(ordR.units_sold  ?? 0);

      return {
        totalSkus:          Number(invR.total_skus           ?? 0),
        totalUnits,
        unitsSold,
        totalOrders:        Number(ordR.total_orders         ?? 0),
        remainingStock:     totalUnits - unitsSold,
        phantomUnits:       Number(metR.phantom_units        ?? 0),
        undefinedSkuOrders: Number(metR.undefined_sku_orders ?? 0),
        activePlatforms:    Number(ordR.active_platforms     ?? 0),
        undefinedSkus:      Number(undR.undefined_skus       ?? 0),
      };
    } catch {
      return {
        totalSkus: 0, totalUnits: 0, unitsSold: 0, totalOrders: 0,
        remainingStock: 0, phantomUnits: 0, undefinedSkuOrders: 0,
        activePlatforms: 0, undefinedSkus: 0,
      };
    }
  }

  async function getPerformance(organizationId, weeks = 12, platform = null) {
    const safeWeeks = Math.min(Math.max(parseInt(weeks, 10) || 12, 1), 52);
    const p = { organizationId, platform: platform ?? null };
    const pTypes = { platform: 'STRING' };
    const platCond = `AND (@platform IS NULL OR platform = @platform)`;

    const weeklyQuery = `
      SELECT
        DATE_TRUNC(SAFE.PARSE_DATE('%Y-%m-%d', order_date), WEEK) AS week_start,
        SUM(quantity_sold) AS units_sold,
        COUNT(*)           AS orders
      FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND SAFE.PARSE_DATE('%Y-%m-%d', order_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
        ${platCond}
      GROUP BY week_start
      ORDER BY week_start ASC
    `;

    const platformQuery = `
      SELECT platform, SUM(quantity_sold) AS units_sold, COUNT(*) AS order_count
      FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND SAFE.PARSE_DATE('%Y-%m-%d', order_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
        AND platform IS NOT NULL
        ${platCond}
      GROUP BY platform
      ORDER BY units_sold DESC
    `;

    const topSkuQuery = `
      SELECT sku, SUM(quantity_sold) AS units_sold
      FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND SAFE.PARSE_DATE('%Y-%m-%d', order_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${safeWeeks} WEEK)
        ${platCond}
      GROUP BY sku
      ORDER BY units_sold DESC
      LIMIT 10
    `;

    const monthlyQuery = `
      WITH base AS (
        SELECT *
        FROM ${ordTable}
        WHERE organization_id = @organizationId
          AND SAFE.PARSE_DATE('%Y-%m-%d', order_date) IS NOT NULL
          ${platCond}
      ),
      totals AS (
        SELECT
          FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%Y-%m-%d', order_date)) AS month,
          COUNT(*) AS order_count,
          SUM(quantity_sold) AS units_sold
        FROM base
        GROUP BY month
      ),
      top_platform AS (
        SELECT
          FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%Y-%m-%d', order_date)) AS month,
          platform,
          ROW_NUMBER() OVER (
            PARTITION BY FORMAT_DATE('%Y-%m', SAFE.PARSE_DATE('%Y-%m-%d', order_date))
            ORDER BY COUNT(*) DESC
          ) AS rn
        FROM base
        WHERE platform IS NOT NULL
        GROUP BY month, platform
      )
      SELECT t.month, t.order_count, t.units_sold, p.platform AS top_platform
      FROM totals t
      LEFT JOIN top_platform p ON p.month = t.month AND p.rn = 1
      ORDER BY t.month DESC
      LIMIT 12
    `;

    try {
      const [wR, pR, sR, mR] = await Promise.all([
        bq.query({ query: weeklyQuery,   params: p, types: pTypes }).then(r => r[0]),
        bq.query({ query: platformQuery, params: p, types: pTypes }).then(r => r[0]),
        bq.query({ query: topSkuQuery,   params: p, types: pTypes }).then(r => r[0]),
        bq.query({ query: monthlyQuery,  params: p, types: pTypes }).then(r => r[0]),
      ]);
      return { weekly: wR, platforms: pR, topSkus: sR, monthly: mR };
    } catch {
      return { weekly: [], platforms: [], topSkus: [], monthly: [] };
    }
  }

  return { getKPIs, getPerformance };
}
