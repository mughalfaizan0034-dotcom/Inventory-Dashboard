/* ============================================================
   inventory.js — Box Lookup page + Inventory List page
   ============================================================ */

const BoxLookup = (() => {
  let _debounced = null;

  function _renderResult(data) {
    const el = document.getElementById('box-result');
    if (!el) return;

    if (!data || (!data.boxes && !data.items)) {
      el.innerHTML = Loading.empty('🔍', 'No results found', 'Try a different SKU, UPC, or box number');
      return;
    }

    const items = data.items || data.boxes || [];
    if (!items.length) {
      el.innerHTML = Loading.empty('🔍', 'No results found', 'Try a different SKU, UPC, or box number');
      return;
    }

    el.innerHTML = items.map(item => {
      const remaining = Number(item.remaining_stock ?? item.quantity ?? 0);
      const sold      = Number(item.units_sold ?? 0);
      const phantom   = Number(item.phantom_units ?? 0);

      return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--txt-1);margin-bottom:4px">${Utils.escapeHtml(item.sku || '—')}</div>
              <div style="font-size:12px;color:var(--txt-4)">Box ${Utils.escapeHtml(item.box_number || '—')} · UPC ${Utils.escapeHtml(item.upc || '—')} · Part ${Utils.escapeHtml(item.part_number || '—')}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${phantom > 0  ? Utils.badgeHtml('error',   'Phantom: '   + Utils.formatNumber(phantom)) : ''}
              ${remaining === 0 ? Utils.badgeHtml('error', 'Out of Stock') : ''}
              ${remaining > 0 && remaining <= 10 ? Utils.badgeHtml('warning', 'Low Stock') : ''}
              ${remaining > 10 ? Utils.badgeHtml('success', 'In Stock') : ''}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:16px">
            ${_statBox('Initial Stock', Utils.formatNumber(item.initial_stock ?? item.quantity))}
            ${_statBox('Units Sold',    Utils.formatNumber(sold))}
            ${_statBox('Remaining',     Utils.formatNumber(remaining), remaining === 0 ? 'var(--error)' : remaining <= 10 ? 'var(--warning)' : 'var(--success)')}
            ${phantom > 0 ? _statBox('Phantom Units', Utils.formatNumber(phantom), 'var(--error)') : ''}
          </div>

          <div style="margin-top:12px;font-size:11.5px;color:var(--txt-4)">
            Added ${Utils.formatDate(item.date_added)}
            ${item.notes ? ` · ${Utils.escapeHtml(item.notes)}` : ''}
          </div>
        </div>`;
    }).join('');
  }

  function _statBox(label, value, color = 'var(--txt-1)') {
    return `
      <div style="background:var(--surface-2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:11px;color:var(--txt-4);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${Utils.escapeHtml(label)}</div>
        <div style="font-size:20px;font-weight:700;color:${color}">${Utils.escapeHtml(String(value))}</div>
      </div>`;
  }

  async function search(query) {
    const el = document.getElementById('box-result');
    if (!el) return;

    query = (query || '').trim();
    if (!query) { el.innerHTML = ''; return; }

    el.innerHTML = `<div style="display:flex;justify-content:center;padding:32px">${Loading.spinnerHtml()}</div>`;

    try {
      const data = await API.searchBox(query);
      _renderResult(data);
    } catch (err) {
      el.innerHTML = Loading.error('Search failed. Please try again.');
      Notify.apiError(err);
    }
  }

  function init() {
    const input  = document.getElementById('box-search-input');
    const btn    = document.getElementById('box-search-btn');
    const result = document.getElementById('box-result');

    if (!input) return;

    _debounced = Utils.debounce(val => search(val), 500);

    input.addEventListener('input', e => _debounced(e.target.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(input.value); } });
    if (btn) btn.addEventListener('click', () => search(input.value));
  }

  return { init, search };
})();

/* ── Inventory List page ────────────────────────────────────── */
const InventoryList = (() => {
  let _page    = 1;
  let _search  = '';
  let _total   = 0;
  let _loading = false;

  const COLS = ['SKU', 'Box #', 'Part #', 'UPC', 'Initial Stock', 'Units Sold', 'Remaining', 'Date Added'];

  function _renderTable(items, total) {
    _total = total || 0;
    const tbody = document.getElementById('inventory-tbody');
    const info  = document.getElementById('inventory-info');
    if (!tbody) return;

    if (!items || !items.length) {
      tbody.innerHTML = `<tr><td colspan="${COLS.length}" style="padding:0">${Loading.empty('📦', 'No inventory records', 'Upload inventory data to get started')}</td></tr>`;
      if (info) info.textContent = '';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const remaining = Number(item.remaining_stock ?? item.quantity ?? 0);
      const phantom   = Number(item.phantom_units ?? 0);
      return `<tr class="${phantom > 0 ? 'row-error' : ''}">
        <td style="font-weight:600;color:var(--txt-1)">${Utils.escapeHtml(item.sku || '—')}</td>
        <td>${Utils.escapeHtml(item.box_number || '—')}</td>
        <td>${Utils.escapeHtml(item.part_number || '—')}</td>
        <td>${Utils.escapeHtml(item.upc || '—')}</td>
        <td class="num">${Utils.formatNumber(item.initial_stock ?? item.quantity)}</td>
        <td class="num">${Utils.formatNumber(item.units_sold)}</td>
        <td class="num">${Utils.stockBadge(remaining)}</td>
        <td>${Utils.formatDate(item.date_added)}</td>
      </tr>`;
    }).join('');

    if (info) {
      const ps = CONFIG.PAGE_SIZE;
      const start = ((_page - 1) * ps) + 1;
      const end   = Math.min(_page * ps, _total);
      info.textContent = `Showing ${start}–${end} of ${Utils.formatNumber(_total)}`;
    }

    Pagination.render('inventory-pagination', _page, Math.ceil(_total / CONFIG.PAGE_SIZE), p => { _page = p; load(); });
  }

  async function load() {
    if (_loading) return;
    _loading = true;

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) {
      tbody.innerHTML = Loading.tableRows(COLS.length, 6);
    }

    try {
      const data = await API.getInventoryList(_page, CONFIG.PAGE_SIZE, _search);
      _renderTable(data.items || data.rows || [], data.total || 0);
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="${COLS.length}">${Loading.error('Failed to load inventory')}</td></tr>`;
      Notify.apiError(err);
    } finally {
      _loading = false;
    }
  }

  function init() {
    const searchInput = document.getElementById('inventory-search');
    const searchBtn   = document.getElementById('inventory-search-btn');

    if (searchInput) {
      const debouncedSearch = Utils.debounce(val => { _search = val; _page = 1; load(); }, 500);
      searchInput.addEventListener('input', e => debouncedSearch(e.target.value));
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { _search = e.target.value; _page = 1; load(); } });
    }
    if (searchBtn) searchBtn.addEventListener('click', () => { _search = searchInput?.value || ''; _page = 1; load(); });
  }

  return { init, load };
})();

/* ── Pagination helper ──────────────────────────────────────── */
const Pagination = {
  render(containerId, currentPage, totalPages, onPageChange) {
    const el = document.getElementById(containerId);
    if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }

    const MAX_VISIBLE = 5;
    const pages = [];

    if (totalPages <= MAX_VISIBLE + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end   = Math.min(totalPages - 1, currentPage + 1);

      if (start > 2)           pages.push('...');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    el.innerHTML = `
      <div class="page-controls">
        <button class="page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
        ${pages.map(p =>
          p === '...'
            ? `<span class="page-sep">…</span>`
            : `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
      </div>`;

    el.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages && p !== currentPage) onPageChange(p);
      });
    });
  },
};
