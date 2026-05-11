const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthLabel(ym) {
  // ym = '2026-05'
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function weekLabel(dateVal) {
  if (!dateVal) return '?';
  const d = new Date(dateVal?.value ?? dateVal);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function createDashboardService({ dashboardRepo }) {
  async function getKPIs(organizationId) {
    return dashboardRepo.getKPIs(organizationId);
  }

  async function getPerformance(organizationId, weeks, platform = null) {
    const { weekly, platforms, topSkus, monthly } = await dashboardRepo.getPerformance(organizationId, weeks, platform);

    return {
      weekly: weekly.map(r => ({
        week_start:  r.week_start?.value ?? r.week_start,
        week_label:  weekLabel(r.week_start),
        units_sold:  Number(r.units_sold ?? 0),
        order_count: Number(r.orders     ?? 0),
      })),
      platforms: platforms.map(r => ({
        platform:    r.platform,
        units_sold:  Number(r.units_sold  ?? 0),
        order_count: Number(r.order_count ?? 0),
      })),
      topSkus: topSkus.map(r => ({
        sku:        r.sku,
        units_sold: Number(r.units_sold ?? 0),
      })),
      monthly: monthly.map(r => ({
        month:       r.month,
        month_label: monthLabel(r.month),
        order_count: Number(r.order_count ?? 0),
        units_sold:  Number(r.units_sold  ?? 0),
        top_platform: r.top_platform ?? '—',
      })),
    };
  }

  return { getKPIs, getPerformance };
}
