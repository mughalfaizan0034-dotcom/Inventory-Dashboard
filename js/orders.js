/* ============================================================
   orders.js — Orders page: filter bar, table, pagination, bulk delete, inline edit
   ============================================================ */

const Orders = (() => {
  let _page        = 1;
  let _filters     = {};
  let _total       = 0;
  let _loading     = false;
  let _platforms   = [];
  let _selectedIds = new Set();

  const DATA_COLS = ['Order Date', 'SKU', 'Qty Sold', 'Shipped From Box', 'Platform'];
  const ALL_COLS  = ['', ...DATA_COLS, ''];

  /* ── SKU parser for alternative box detection ────────────── */
  function _parseSku(sku) {
    const m = (sku || '').match(/^ARA(\d+)-(.+)-(.+)$/);
    if (!m) return null;
    return { box: m[1], partNumber: m[2], upc: m[3] };
  }

  /* ── Render table ────────────────────────────────────────── */
  function _renderTable(rows, total) {
    _total = total || 0;
    const tbody = document.getElementById('orders-tbody');
    const info  = document.getElementById('orders-info');
    if (!tbody) return;

    if (!rows || !rows.length) {
      _selectedIds.clear();
      _updateDeleteBar();
      tbody.innerHTML = `<tr><td colspan="${ALL_COLS.length}" style="padding:0">${Loading.empty('🛒', 'No orders found', 'Adjust your filters or upload order data')}</td></tr>`;
      if (info) info.textContent = '';
      Pagination.render('orders-pagination', 1, 0, () => {});
      return;
    }

    tbody.innerHTML = rows.map(row => {
      const id      = row.order_row_id || '';
      const checked = _selectedIds.has(id) ? ' checked' : '';
      return `<tr data-row-id="${Utils.escapeHtml(id)}"
                  data-order-date="${Utils.escapeHtml(row.order_date || '')}"
                  data-sku="${Utils.escapeHtml(row.sku || '')}"
                  data-qty="${Utils.escapeHtml(String(row.quantity_sold ?? ''))}"
                  data-shipped="${Utils.escapeHtml(row.shipped_from_box || '')}"
                  data-platform="${Utils.escapeHtml(row.platform || '')}">
        <td style="width:36px;text-align:center;padding:0 4px">
          <input type="checkbox" class="order-row-cb" data-id="${Utils.escapeHtml(id)}"${checked} style="cursor:pointer">
        </td>
        <td>${Utils.escapeHtml(row.order_date || '-')}</td>
        <td style="font-weight:500">${Utils.escapeHtml(row.sku || '-')}</td>
        <td class="num"><strong>${Utils.formatNumber(row.quantity_sold)}</strong></td>
        <td>${Utils.escapeHtml(row.shipped_from_box || '-')}</td>
        <td>${_platformBadge(row.platform)}</td>
        <td style="width:36px;text-align:center;padding:0 4px">
          <button class="btn btn-ghost btn-icon btn-sm order-edit-btn" data-id="${Utils.escapeHtml(id)}" title="Edit row" style="opacity:.6">✏️</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.order-row-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) _selectedIds.add(cb.dataset.id);
        else            _selectedIds.delete(cb.dataset.id);
        _syncSelectAll();
        _updateDeleteBar();
      });
    });

    tbody.querySelectorAll('.order-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        _openEditModal(tr);
      });
    });

    _syncSelectAll();
    _updateDeleteBar();

    if (info) {
      const ps    = CONFIG.PAGE_SIZE;
      const start = ((_page - 1) * ps) + 1;
      const end   = Math.min(_page * ps, _total);
      info.textContent = `Showing ${start}–${end} of ${Utils.formatNumber(_total)} orders`;
    }

    Pagination.render('orders-pagination', _page, Math.ceil(_total / CONFIG.PAGE_SIZE), p => { _page = p; load(); });
  }

  function _platformBadge(platform) {
    if (!platform) return '<span style="color:var(--txt-4)">-</span>';
    const colors = { amazon: 'info', ebay: 'warning', walmart: 'primary', shopify: 'success' };
    return Utils.badgeHtml(colors[platform.toLowerCase()] || 'gray', platform);
  }

  /* ── Selection helpers ───────────────────────────────────── */
  function _syncSelectAll() {
    const allCb = document.getElementById('orders-select-all');
    if (!allCb) return;
    const boxes = Array.from(document.querySelectorAll('.order-row-cb'));
    const allChk = boxes.length > 0 && boxes.every(b => b.checked);
    const anyChk = boxes.some(b => b.checked);
    allCb.checked       = allChk;
    allCb.indeterminate = !allChk && anyChk;
  }

  function _updateDeleteBar() {
    const bar = document.getElementById('orders-delete-bar');
    const cnt = document.getElementById('orders-selected-count');
    if (!bar) return;
    if (_selectedIds.size > 0) {
      bar.style.display = 'flex';
      if (cnt) cnt.textContent = `${_selectedIds.size} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  function clearSelection() {
    _selectedIds.clear();
    document.querySelectorAll('.order-row-cb').forEach(cb => { cb.checked = false; });
    const allCb = document.getElementById('orders-select-all');
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    _updateDeleteBar();
  }

  /* ── Inline edit modal ───────────────────────────────────── */
  async function _openEditModal(tr) {
    const rowId    = tr.dataset.rowId;
    const sku      = tr.dataset.sku;
    const parsed   = _parseSku(sku);

    let altBoxOptions = '';
    if (parsed) {
      try {
        const alts = await API.getInventoryAlternatives(sku);
        if (alts && alts.length) {
          const originalBox = tr.dataset.shipped;
          altBoxOptions = `<datalist id="alt-boxes-list">` +
            alts.map(a => {
              const isOrig = a.box_number === originalBox;
              return `<option value="${Utils.escapeHtml(a.box_number)}">${Utils.escapeHtml(a.box_number)}${isOrig ? ' ⭐ Original' : ''} (qty: ${a.quantity})</option>`;
            }).join('') +
          `</datalist>`;
        }
      } catch { /* ignore */ }
    }

    const hasAlt = altBoxOptions !== '';

    const bodyHtml = `
      <div style="display:grid;gap:14px">
        <div>
          <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">ORDER DATE</label>
          <input class="form-input" id="edit-order-date" type="date" value="${Utils.escapeHtml(tr.dataset.orderDate)}">
        </div>
        <div>
          <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">QTY SOLD</label>
          <input class="form-input" id="edit-qty-sold" type="number" min="1" value="${Utils.escapeHtml(tr.dataset.qty)}">
        </div>
        <div>
          <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">PLATFORM</label>
          <input class="form-input" id="edit-platform" value="${Utils.escapeHtml(tr.dataset.platform)}" list="platform-list">
          <datalist id="platform-list">
            ${_platforms.map(p => `<option value="${Utils.escapeHtml(p)}">`).join('')}
          </datalist>
        </div>
        <div>
          <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">
            SHIPPED FROM BOX${hasAlt ? ' <span style="color:var(--txt-4);font-weight:400">(alternatives available)</span>' : ''}
          </label>
          <input class="form-input" id="edit-shipped-box" value="${Utils.escapeHtml(tr.dataset.shipped)}"
            ${hasAlt ? 'list="alt-boxes-list"' : ''} placeholder="Optional">
          ${altBoxOptions}
        </div>
        <div style="font-size:12px;color:var(--txt-4)">SKU: ${Utils.escapeHtml(sku)}</div>
      </div>`;

    const m = new Modal({
      title: 'Edit Order',
      body:  bodyHtml,
      footer: `
        <button class="btn btn-secondary btn-sm" data-action="cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" data-action="save">Save Changes</button>`,
      maxWidth: '420px',
    });
    m.show();

    m.footerEl.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') { m.hide(); m.destroy(); return; }
      if (action === 'save') {
        const saveBtn = m.footerEl.querySelector('[data-action="save"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          const updates = {
            order_date:       document.getElementById('edit-order-date').value,
            quantity_sold:    parseInt(document.getElementById('edit-qty-sold').value, 10),
            platform:         document.getElementById('edit-platform').value.trim(),
            shipped_from_box: document.getElementById('edit-shipped-box').value.trim() || null,
          };
          if (!updates.order_date || !updates.quantity_sold || !updates.platform) {
            Notify.warning('Validation', 'Order date, qty sold, and platform are required.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
            return;
          }
          await API.updateOrder(rowId, updates);
          Notify.success('Saved', 'Order updated successfully');
          m.hide(); m.destroy();
          load();
        } catch (err) {
          Notify.apiError(err);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    });
  }

  /* ── Load ────────────────────────────────────────────────── */
  async function load() {
    if (_loading) return;
    _loading = true;

    if (_platforms.length === 0) await _loadPlatforms();

    const tbody = document.getElementById('orders-tbody');
    if (tbody) tbody.innerHTML = Loading.tableRows(ALL_COLS.length, 8);

    try {
      const data = await API.getOrders(_page, CONFIG.PAGE_SIZE, _filters);
      _renderTable(data.items || [], data.total || 0);
    } catch (err) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="${ALL_COLS.length}">${Loading.error('Failed to load orders')}</td></tr>`;
      Notify.apiError(err);
    } finally {
      _loading = false;
    }
  }

  /* ── Platform select ─────────────────────────────────────── */
  async function _loadPlatforms() {
    const sel = document.getElementById('filter-platform');
    if (!sel) return;
    try {
      _platforms = await API.getPlatforms();
      const opts = _platforms.map(p => `<option value="${Utils.escapeHtml(p)}">${Utils.escapeHtml(p)}</option>`).join('');
      sel.innerHTML = `<option value="">All Platforms</option>${opts}`;
    } catch { /* not critical */ }
  }

  /* ── Filter helpers ──────────────────────────────────────── */
  function _collectFilters() {
    _filters = {};
    const search   = document.getElementById('orders-search')?.value.trim();
    const platform = document.getElementById('filter-platform')?.value;
    const dateFrom = document.getElementById('filter-date-from')?.value;
    const dateTo   = document.getElementById('filter-date-to')?.value;

    if (search)   _filters.search     = search;
    if (platform) _filters.platform   = platform;
    if (dateFrom) _filters.start_date = dateFrom;
    if (dateTo)   _filters.end_date   = dateTo;
  }

  function _resetFilters() {
    ['orders-search', 'filter-platform', 'filter-date-from', 'filter-date-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    _filters = {};
    _page = 1;
    load();
  }

  /* ── Bulk delete ─────────────────────────────────────────── */
  function _confirmAndDelete({ label, payload }) {
    const modal    = document.getElementById('orders-delete-modal');
    const msg      = document.getElementById('orders-delete-modal-msg');
    const confirmB = document.getElementById('orders-delete-confirm');
    const cancelB  = document.getElementById('orders-delete-cancel');
    if (!modal) return;
    if (msg) msg.textContent = label;
    modal.style.display = 'flex';

    const cleanup = () => { modal.style.display = 'none'; };

    const onConfirm = async () => {
      confirmB.removeEventListener('click', onConfirm);
      cancelB.removeEventListener('click', onCancel);
      cleanup();
      try {
        confirmB.disabled = true;
        const result = await API.deleteOrders(payload);
        _selectedIds.clear();
        Notify.success('Deleted', `Removed ${result.deleted ?? '?'} order${result.deleted !== 1 ? 's' : ''}`);
        _page = 1;
        load();
      } catch (err) {
        Notify.apiError(err);
      } finally {
        confirmB.disabled = false;
      }
    };

    const onCancel = () => {
      confirmB.removeEventListener('click', onConfirm);
      cancelB.removeEventListener('click', onCancel);
      cleanup();
    };

    confirmB.addEventListener('click', onConfirm);
    cancelB.addEventListener('click',  onCancel);
  }

  function _deleteSelected() {
    if (_selectedIds.size === 0) return;
    const ids = Array.from(_selectedIds);
    _confirmAndDelete({
      label:   `Delete ${ids.length} selected order${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
      payload: { row_ids: ids },
    });
  }

  function _deleteOrders() {
    _collectFilters();
    const hasFilter = Object.keys(_filters).length > 0;
    if (!hasFilter) {
      Notify.warning('No filter applied', 'Apply at least one filter before using Delete Orders.');
      return;
    }
    const parts = [];
    if (_filters.platform)   parts.push(`platform: ${_filters.platform}`);
    if (_filters.start_date) parts.push(`from: ${_filters.start_date}`);
    if (_filters.end_date)   parts.push(`to: ${_filters.end_date}`);
    if (_filters.search)     parts.push(`SKU contains: "${_filters.search}"`);
    _confirmAndDelete({
      label:   `Delete ALL orders matching [${parts.join(', ')}]? This cannot be undone.`,
      payload: {
        filters: {
          platform:   _filters.platform   || undefined,
          start_date: _filters.start_date || undefined,
          end_date:   _filters.end_date   || undefined,
          search:     _filters.search     || undefined,
        },
      },
    });
  }

  /* ── Export modal ────────────────────────────────────────── */
  function _openExportModal() {
    const m = new Modal({
      title: 'Export Orders',
      body: `
        <div style="display:grid;gap:10px">
          <button class="btn btn-secondary btn-sm" data-export="current" style="text-align:left;justify-content:flex-start">
            📄 Current Page — export rows visible on screen
          </button>
          <button class="btn btn-secondary btn-sm" data-export="filtered" style="text-align:left;justify-content:flex-start">
            🔍 Current Filtered Results — re-fetch all matching rows
          </button>
        </div>`,
      footer: `<button class="btn btn-ghost btn-sm" data-action="cancel">Cancel</button>`,
      maxWidth: '380px',
    });
    m.show();

    m.bodyEl.addEventListener('click', async e => {
      const btn = e.target.closest('[data-export]');
      if (!btn) return;
      const mode = btn.dataset.export;
      m.hide(); m.destroy();
      await _doExport(mode);
    });
    m.footerEl.addEventListener('click', e => {
      if (e.target.closest('[data-action="cancel"]')) { m.hide(); m.destroy(); }
    });
  }

  async function _doExport(mode) {
    let rows;

    if (mode === 'current') {
      const tbody = document.getElementById('orders-tbody');
      if (!tbody) return;
      const trs = Array.from(tbody.querySelectorAll('tr[data-row-id]'));
      rows = trs.map(tr => ({
        order_date:       tr.dataset.orderDate,
        sku:              tr.dataset.sku,
        quantity_sold:    tr.dataset.qty,
        shipped_from_box: tr.dataset.shipped,
        platform:         tr.dataset.platform,
      }));
    } else {
      // Fetch all matching rows (up to 5000)
      try {
        const data = await API.getOrders(1, 5000, _filters);
        rows = data.items || [];
      } catch (err) {
        Notify.apiError(err);
        return;
      }
    }

    const header = DATA_COLS.join(',');
    const lines  = rows.map(r => [
      r.order_date       || '',
      r.sku              || '',
      r.quantity_sold    ?? '',
      r.shipped_from_box || '',
      r.platform         || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv  = [header, ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    const applyBtn     = document.getElementById('orders-apply-filters');
    const resetBtn     = document.getElementById('orders-reset-filters');
    const exportBtn    = document.getElementById('orders-export');
    const searchEl     = document.getElementById('orders-search');
    const selectAll    = document.getElementById('orders-select-all');
    const deleteSelBtn = document.getElementById('orders-delete-selected');
    const deleteOrdBtn = document.getElementById('orders-delete-filtered');

    if (applyBtn)     applyBtn.addEventListener('click',     () => { _collectFilters(); _page = 1; load(); });
    if (resetBtn)     resetBtn.addEventListener('click',     _resetFilters);
    if (exportBtn)    exportBtn.addEventListener('click',    _openExportModal);
    if (deleteSelBtn) deleteSelBtn.addEventListener('click', _deleteSelected);
    if (deleteOrdBtn) deleteOrdBtn.addEventListener('click', _deleteOrders);

    if (selectAll) {
      selectAll.addEventListener('change', () => {
        document.querySelectorAll('.order-row-cb').forEach(cb => {
          cb.checked = selectAll.checked;
          if (selectAll.checked) _selectedIds.add(cb.dataset.id);
          else                   _selectedIds.delete(cb.dataset.id);
        });
        _updateDeleteBar();
      });
    }

    if (searchEl) {
      searchEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { _collectFilters(); _page = 1; load(); }
      });
    }
  }

  return { init, load, clearSelection };
})();
