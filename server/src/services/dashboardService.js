export function createDashboardService({ dashboardRepo }) {
  async function getKPIs(organizationId) {
    return dashboardRepo.getKPIs(organizationId);
  }

  async function getPerformance(organizationId, weeks) {
    const rows = await dashboardRepo.getPerformance(organizationId, weeks);
    return rows.map(r => ({
      week_start:  r.week_start?.value ?? r.week_start,
      revenue:     Number(r.revenue   ?? 0),
      units_sold:  Number(r.units_sold ?? 0),
      orders:      Number(r.orders    ?? 0),
    }));
  }

  return { getKPIs, getPerformance };
}
