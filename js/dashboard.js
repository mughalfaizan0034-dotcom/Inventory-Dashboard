/* ============================================================
   dashboard.js — KPI tiles, dashboard page, performance charts
   ============================================================ */

/* ── Dashboard (Overview page) ──────────────────────────────── */
const Dashboard = (() => {

  const INVENTORY_METRICS = [
    {
      rows: [
        { id: 'dm-total-skus',    label: 'Total SKUs',         field: 'totalSkus',              navigate: 'inventory' },
        { id: 'dm-total-units',   label: 'Total Units',        field: 'totalUnits',             navigate: 'inventory' },
        { id: 'dm-remaining',     label: 'Actual Remaining',   field: 'physicalRemainingUnits', navigate: 'inventory', accent: 'green' },
        { id: 'dm-phantom-units', label: 'Phantom Units',      field: 'phantomUnits',           navigate: 'inventory', action: 'phantom', warnIfPositive: true },
        { id: 'dm-undef-inv',     label: 'Undefined SKUs',     field: 'undefinedSkus',          navigate: 'inventory', action: 'undefined', warnIfPositive: true },
      ],
    },
    {
      divided: true,
      rows: [
        { id: 'dm-instock-skus',  label: 'In Stock SKUs',      field: 'inStockSkus',            accent: 'green' },
        { id: 'dm-oos-skus',      label: 'OOS SKUs',           field: 'oosSkus',                accent: 'orange' },
      ],
    },
  ];

  const SALES_METRICS = [
    {
      rows: [
        { id: 'dm-total-orders',  label: 'Total Orders',        field: 'totalOrders',            navigate: 'orders' },
        { id: 'dm-units-sold',    label: 'Units Sold',          field: 'unitsSold',              navigate: 'orders' },
        { id: 'dm-actual-sold',   label: 'Actual Units Sold',   field: 'actualUnitsSold',        accent: 'teal', sub: 'Total sold minus phantom demand' },
        { id: 'dm-phantom-u-s',   label: 'Phantom Units',       field: 'phantomUnits',           warnIfPositive: true },
        { id: 'dm-ignored-ord',   label: 'Ignored Orders',      field: 'ignoredOrders' },
      ],
    },
    {
      divided: true,
      rows: [
        { id: 'dm-undef-orders',  label: 'Undefined SKU Orders', field: 'undefinedSkuOrders',    navigate: 'orders', action: 'unknown_orders', warnIfPositive: true },
      ],
    },
  ];

  function _valueColor(def, val) {
    if (def.warnIfPositive && val > 0) return 'var(--error)';
    if (def.accent === 'green')  return '#16a34a';
    if (def.accent === 'orange') return '#c2410c';
    if (def.accent === 'teal')   return '#0d9488';
    return 'var(--txt-1)';
  }

  function _metricRow(def, data) {
    const val     = data[def.field] ?? null;
    const display = val != null ? Utils.formatNumber(val) : '—';
    const color   = _valueColor(def, val ?? 0);
    const nav     = def.navigate
      ? `data-navigate="${def.navigate}"${def.action ? ` data-action="${def.action}"` : ''}`
      : '';
    return `
      <div class="dash-metric-row${def.navigate ? ' clickable' : ''}" ${nav}>
        <div>
          <span class="dash-metric-label">${Utils.escapeHtml(def.label)}</span>
          ${def.sub ? `<span class="dash-metric-sub">${Utils.escapeHtml(def.sub)}</span>` : ''}
        </div>
        <span class="dash-metric-value" id="${def.id}" style="color:${color}">${Utils.escapeHtml(String(display))}</span>
      </div>`;
  }

  function _skeletonRow() {
    return `
      <div class="dash-metric-row">
        <div class="skel skel-line" style="width:130px;height:13px"></div>
        <div class="skel skel-line" style="width:52px;height:18px"></div>
      </div>`;
  }

  function _renderPanel(containerId, icon, title, metricGroups, data) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const isLoading = !data;
    const groupsHtml = metricGroups.map(group => {
      const rowsHtml = isLoading
        ? group.rows.map(_skeletonRow).join('')
        : group.rows.map(def => _metricRow(def, data)).join('');
      return `<div class="dash-metric-group${group.divided ? ' dash-metric-group--divided' : ''}">${rowsHtml}</div>`;
    }).join('');

    el.innerHTML = `
      <div class="dash-panel-header">
        <span style="font-size:15px;line-height:1">${icon}</span>
        <span class="dash-panel-title">${Utils.escapeHtml(title)}</span>
      </div>
      <div>${groupsHtml}</div>`;

    if (data) {
      el.querySelectorAll('.dash-metric-row[data-navigate]').forEach(row => {
        row.addEventListener('click', () => {
          App.navigate(row.dataset.navigate);
          const action = row.dataset.action;
          if (action === 'phantom')        setTimeout(() => InventoryList.setStatusFilter?.('phantom'), 60);
          else if (action === 'undefined') setTimeout(() => InventoryList.setStatusFilter?.('undefined'), 60);
          else if (action === 'unknown_orders') setTimeout(() => Orders.setStatusFilter?.('unknown'), 60);
        });
      });
    }
  }

  function _renderSkeletons() {
    _renderPanel('panel-inventory-intel', '📦', 'Inventory Intelligence', INVENTORY_METRICS, null);
    _renderPanel('panel-sales-intel',     '📈', 'Sales Intelligence',     SALES_METRICS,     null);
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
        MetricsEngine.load(),
        API.getActivity().catch(() => []),
      ]);
      _renderPanel('panel-inventory-intel', '📦', 'Inventory Intelligence', INVENTORY_METRICS, kpiData);
      _renderPanel('panel-sales-intel',     '📈', 'Sales Intelligence',     SALES_METRICS,     kpiData);
      _renderRecentActivity(activityData);

      const lastSyncEl = document.getElementById('last-sync-time');
      if (lastSyncEl) lastSyncEl.textContent = 'Updated ' + Utils.timeAgo(new Date().toISOString());
    } catch (err) {
      const inv = document.getElementById('panel-inventory-intel');
      if (inv) inv.innerHTML = Loading.error('Failed to load dashboard data', load);
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
  let _platform      = '';

  const PLATFORM_COLORS = ['#2563eb','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#db2777','#64748b'];

  const STATUS_COLORS = {
    'In Stock':  '#16a34a',
    'OOS':       '#ea580c',
    'Phantom':   '#dc2626',
    'Undefined': '#94a3b8',
  };
  const STATUS_ORDER = ['In Stock', 'OOS', 'Phantom', 'Undefined'];

  async function load() {
    const container = document.getElementById('perf-container');
    if (container) Loading.section(container, true);

    try {
      const [data, platforms] = await Promise.all([
        API.getPerformanceData(_weeks, _platform),
        API.getPlatforms().catch(() => []),
      ]);

      _populatePlatformSelect(platforms);
      _renderWeeklyChart(data.weekly   || []);
      _renderPlatformChart(data.platforms || []);
      _renderMonthlyTable(data.monthly || []);
    } catch (err) {
      Notify.apiError(err);
    } finally {
      if (container) Loading.section(container, false);
    }
  }

  function _populatePlatformSelect(platforms) {
    const sel = document.getElementById('perf-platform-select');
    if (!sel || sel.options.length > 1) return; // already populated
    platforms.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
    sel.value = _platform;
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
    const canvas   = document.getElementById('chart-platform');
    const legendEl = document.getElementById('platform-legend');
    if (!canvas) return;

    if (_platformChart) _platformChart.destroy();

    if (!platforms.length) {
      if (legendEl) legendEl.innerHTML = `<div style="color:var(--txt-4);font-size:13px;padding:12px 0">No platform data</div>`;
      return;
    }

    const total = platforms.reduce((s, p) => s + p.units_sold, 0);

    _platformChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels:   platforms.map(p => p.platform),
        datasets: [{
          data:            platforms.map(p => p.units_sold),
          backgroundColor: platforms.map((_, i) => PLATFORM_COLORS[i % PLATFORM_COLORS.length]),
          borderWidth:     3,
          borderColor:     '#fff',
          hoverOffset:     10,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pct = total > 0 ? Math.round(ctx.parsed / total * 100) : 0;
                return ` ${Utils.formatNumber(ctx.parsed)} units (${pct}%)`;
              },
            },
          },
        },
        cutout: '68%',
      },
    });

    if (legendEl) {
      legendEl.innerHTML = platforms.map((p, i) => {
        const pct   = total > 0 ? Math.round(p.units_sold / total * 100) : 0;
        const color = PLATFORM_COLORS[i % PLATFORM_COLORS.length];
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border)">
            <span style="display:flex;align-items:center;gap:10px">
              <span style="width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0"></span>
              <span style="font-size:14px;font-weight:500;color:var(--txt-2)">${Utils.escapeHtml(p.platform)}</span>
            </span>
            <span style="display:flex;align-items:center;gap:14px">
              <span style="font-size:12px;color:var(--txt-4);min-width:32px;text-align:right">${pct}%</span>
              <span style="font-size:15px;font-weight:700;color:var(--txt-1);min-width:64px;text-align:right">${Utils.formatNumber(p.units_sold)}</span>
            </span>
          </div>`;
      }).join('');
    }
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

  function setPlatform(p) {
    _platform = p || '';
    load();
  }

  function init() {
    const sel     = document.getElementById('perf-weeks-select');
    const platSel = document.getElementById('perf-platform-select');
    if (sel)     sel.addEventListener('change', e => setWeeks(e.target.value));
    if (platSel) platSel.addEventListener('change', e => setPlatform(e.target.value));
  }

  return { load, init };
})();
