/* ============================================================
   dashboard.js — KPI tiles, dashboard page, performance charts
   ============================================================ */

/* ── Dashboard (Overview page) ──────────────────────────────── */
const Dashboard = (() => {

  const KPI_DEFS = [
    { id: 'kpi-total-skus',        label: 'Total SKUs',           icon: '📦', color: 'blue',   field: 'totalSkus',          format: 'number' },
    { id: 'kpi-total-units',       label: 'Total Units',          icon: '🔢', color: 'purple', field: 'totalUnits',         format: 'number' },
    { id: 'kpi-units-sold',        label: 'Units Sold',           icon: '🛒', color: 'orange', field: 'unitsSold',          format: 'number' },
    { id: 'kpi-total-orders',      label: 'Total Orders',         icon: '📋', color: 'cyan',   field: 'totalOrders',        format: 'number' },
    { id: 'kpi-remaining-stock',   label: 'Remaining Stock',      icon: '🏭', color: 'green',  field: 'remainingStock',     format: 'number' },
    { id: 'kpi-phantom-units',     label: 'Phantom Units',        icon: '👻', color: 'red',    field: 'phantomUnits',       format: 'number' },
    { id: 'kpi-undefined-orders',  label: 'Undefined SKU Orders', icon: '❓', color: 'pink',   field: 'undefinedSkuOrders', format: 'number' },
    { id: 'kpi-last-upload',       label: 'Last Upload',          icon: '📤', color: 'gray',   field: 'lastUploadDate',     format: 'datetime' },
  ];

  function _renderSkeletons() {
    const grid = document.getElementById('kpi-grid');
    if (grid) grid.innerHTML = Loading.kpiGrid(8);
  }

  function _renderKPIs(data) {
    const grid = document.getElementById('kpi-grid');
    if (!grid) return;

    grid.innerHTML = KPI_DEFS.map(def => {
      let value = data[def.field];
      let display = '—';
      let sub = '';

      if (value != null) {
        if (def.format === 'number')   display = Utils.formatNumber(value);
        if (def.format === 'datetime') display = value ? Utils.timeAgo(value) : '—';
      }

      if (def.field === 'phantomUnits' && data.phantomUnits > 0) {
        sub = 'Units sold exceeding initial stock';
      }
      if (def.field === 'undefinedSkuOrders' && data.undefinedSkuOrders > 0) {
        sub = 'Orders with no inventory record';
      }
      if (def.field === 'remainingStock' && data.remainingStock < 0) {
        sub = 'Negative — oversold';
      }
      if (def.field === 'lastUploadDate' && value) {
        sub = Utils.formatDatetime(value);
      }

      return `
        <div class="kpi-card ${def.color}">
          <div class="kpi-label">${def.icon} ${Utils.escapeHtml(def.label)}</div>
          <div class="kpi-value" id="${def.id}">${Utils.escapeHtml(String(display))}</div>
          ${sub ? `<div class="kpi-sub">${Utils.escapeHtml(sub)}</div>` : ''}
        </div>`;
    }).join('');
  }

  function _renderRecentActivity(items) {
    const el = document.getElementById('recent-activity-list');
    if (!el) return;

    if (!items || !items.length) { el.innerHTML = Loading.empty('📋', 'No recent activity'); return; }

    el.innerHTML = items.map(item => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:18px">${Utils.escapeHtml(item.icon || '📄')}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--txt-1)">${Utils.escapeHtml(item.title)}</div>
          <div style="font-size:11.5px;color:var(--txt-4)">${Utils.timeAgo(item.date)}</div>
        </div>
      </div>`).join('');
  }

  async function load() {
    _renderSkeletons();
    try {
      const [kpiData, activityData] = await Promise.all([
        API.getDashboardKPIs(),
        API.getActivity().catch(() => []),
      ]);
      _renderKPIs(kpiData);
      _renderRecentActivity(activityData);

      const lastSyncEl = document.getElementById('last-sync-time');
      if (lastSyncEl) lastSyncEl.textContent = 'Updated ' + Utils.timeAgo(new Date().toISOString());
    } catch (err) {
      const grid = document.getElementById('kpi-grid');
      if (grid) grid.innerHTML = Loading.error('Failed to load dashboard data', load);
      Notify.apiError(err);
    }
  }

  return { load };
})();

/* ── Performance page ───────────────────────────────────────── */
const Perf = (() => {
  let _weeklyChart   = null;
  let _platformChart = null;
  let _weeks         = 12;

  async function load() {
    const container = document.getElementById('perf-container');
    if (container) Loading.section(container, true);

    try {
      const data = await API.getPerformanceData(_weeks);
      _renderWeeklyChart(data.weekly || []);
      _renderPlatformChart(data.platforms || []);
      _renderTopSkus(data.topSkus || []);
      _renderMonthlyTable(data.monthly || []);
    } catch (err) {
      Notify.apiError(err);
    } finally {
      if (container) Loading.section(container, false);
    }
  }

  function _renderWeeklyChart(weekly) {
    const canvas = document.getElementById('chart-weekly');
    if (!canvas) return;

    if (_weeklyChart) _weeklyChart.destroy();

    const labels = weekly.map(w => w.week_label || w.week_start || '');
    const sold   = weekly.map(w => w.units_sold  || 0);
    const orders = weekly.map(w => w.order_count || 0);

    _weeklyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Units Sold',
            data: sold,
            backgroundColor: 'rgba(37,99,235,0.15)',
            borderColor: '#2563eb',
            borderWidth: 2,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Order Count',
            data: orders,
            type: 'line',
            borderColor: '#16a34a',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#16a34a',
            tension: 0.3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true } },
        scales: {
          y:  { position: 'left',  beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' }, title: { display: true, text: 'Units Sold' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Orders' } },
        },
      },
    });
  }

  function _renderPlatformChart(platforms) {
    const canvas = document.getElementById('chart-platform');
    if (!canvas) return;

    if (_platformChart) _platformChart.destroy();

    if (!platforms.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const legendEl = document.getElementById('platform-legend');
      if (legendEl) legendEl.innerHTML = `<div style="color:var(--txt-4);font-size:13px;padding:12px 0">No platform data</div>`;
      return;
    }

    const COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#64748b'];

    _platformChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels:   platforms.map(p => p.platform),
        datasets: [{
          data:            platforms.map(p => p.units_sold),
          backgroundColor: platforms.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth:     2,
          borderColor:     '#fff',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } },
        },
        cutout: '65%',
      },
    });

    const legendEl = document.getElementById('platform-legend');
    if (legendEl) {
      legendEl.innerHTML = platforms.map((p, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
          <span style="display:flex;align-items:center;gap:6px;font-size:13px">
            <span style="width:10px;height:10px;border-radius:2px;background:${COLORS[i % COLORS.length]};flex-shrink:0"></span>
            ${Utils.escapeHtml(p.platform)}
          </span>
          <span style="font-size:13px;font-weight:600;color:var(--txt-1)">${Utils.formatNumber(p.units_sold)}</span>
        </div>`).join('');
    }
  }

  function _renderTopSkus(skus) {
    const el = document.getElementById('top-skus-list');
    if (!el) return;
    if (!skus.length) { el.innerHTML = Loading.empty('📦', 'No sales data'); return; }

    el.innerHTML = skus.slice(0, 10).map((s, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:11px;font-weight:700;color:var(--txt-4);width:16px;text-align:right">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:var(--txt-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Utils.escapeHtml(s.sku)}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--primary)">${Utils.formatNumber(s.units_sold)}</span>
      </div>`).join('');
  }

  function _renderMonthlyTable(monthly) {
    const tbody = document.getElementById('monthly-tbody');
    if (!tbody) return;
    if (!monthly.length) { tbody.innerHTML = `<tr><td colspan="4">${Loading.empty('📅', 'No data')}</td></tr>`; return; }

    tbody.innerHTML = monthly.map(m => `
      <tr>
        <td>${Utils.escapeHtml(m.month_label || m.month)}</td>
        <td class="num">${Utils.formatNumber(m.order_count)}</td>
        <td class="num">${Utils.formatNumber(m.units_sold)}</td>
        <td>${Utils.escapeHtml(m.top_platform || '—')}</td>
      </tr>`).join('');
  }

  function setWeeks(w) {
    _weeks = parseInt(w) || 12;
    load();
  }

  function init() {
    const sel = document.getElementById('perf-weeks-select');
    if (sel) sel.addEventListener('change', e => setWeeks(e.target.value));
  }

  return { load, init };
})();
