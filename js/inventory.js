/* ============================================================
   inventory.js — Box Lookup page + Inventory List page
   ============================================================ */

const BoxLookup = (() => {
  let _debounced = null;

  function _renderResult(data) {
    const el = document.getElementById('box-result');
    if (!el) return;

    const items = data?.items || data?.boxes || [];
    if (!items.length) {
      el.innerHTML = Loading.empty('🔍', 'No results found', 'Try a different SKU, UPC, or box number');
      return;
    }

    el.innerHTML = items.map(item => {
      const qty = Number(item.quantity ?? 0);
      return `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--txt-1);margin-bottom:4px">${Utils.escapeHtml(item.sku || '—')}</div>
              <div style="font-size:12px;color:var(--txt-4)">Box ${Utils.escapeHtml(item.box_number || '—')} · UPC ${Utils.escapeHtml(item.upc || '—')} · Part ${Utils.escapeHtml(item.part_number || '—')}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${qty === 0 ? Utils.badgeHtml('error', 'Out of Stock') : ''}
              ${qty > 0 && qty <= 10 ? Utils.badgeHtml('warning', 'Low Stock') : ''}
              ${qty > 10 ? Utils.badgeHtml('success', 'In Stock') : ''}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:16px">
            ${_statBox('Quantity', Utils.formatNumber(qty), qty === 0 ? 'var(--error)' : qty <= 10 ? 'var(--warning)' : 'var(--success)')}
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
  let _page        = 1;
  let _search      = '';
  let _total       = 0;
  let _loading     = false;
  let _selectedSkus = new Set();

  const COLS = ['', 'SKU', 'Box #', 'Part #', 'UPC', 'Qty', 'Sold', 'Remaining', 'Date Added', 'Notes', ''];

  /* ── Render ─────────────────────────────────────────────── */
  function _renderTable(items, total) {
    _total = total || 0;
    const tbody = document.getElementById('inventory-tbody');
    const info  = document.getElementById('inventory-info');
    if (!tbody) return;

    if (!items || !items.length) {
      _selectedSkus.clear();
      _updateDeleteBar();
      tbody.innerHTML = `<tr><td colspan="${COLS.length}" style="padding:0">${Loading.empty('📦', 'No inventory records', 'Upload inventory data to get started')}</td></tr>`;
      if (info) info.textContent = '';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const qty       = Number(item.quantity       ?? 0);
      const sold      = Number(item.units_sold     ?? 0);
      const remaining = Number(item.remaining_stock ?? qty - sold);
      const checked   = _selectedSkus.has(item.sku) ? ' checked' : '';
      const remColor  = remaining < 0 ? 'color:var(--error);font-weight:700' : remaining === 0 ? 'color:var(--txt-4)' : 'color:var(--success);font-weight:600';

      return `<tr data-sku="${Utils.escapeHtml(item.sku || '')}"
                  data-upc="${Utils.escapeHtml(item.upc || '')}"
                  data-qty="${Utils.escapeHtml(String(qty))}"
                  data-part="${Utils.escapeHtml(item.part_number || '')}"
                  data-box="${Utils.escapeHtml(item.box_number || '')}"
                  data-notes="${Utils.escapeHtml(item.notes || '')}"
                  data-date="${Utils.escapeHtml(item.date_added || '')}">
        <td style="width:36px;text-align:center;padding:0 4px">
          <input type="checkbox" class="inv-row-cb" data-sku="${Utils.escapeHtml(item.sku || '')}"${checked} style="cursor:pointer">
        </td>
        <td style="font-weight:600;color:var(--txt-1)">${Utils.escapeHtml(item.sku || '—')}</td>
        <td>${Utils.escapeHtml(item.box_number || '—')}</td>
        <td>${Utils.escapeHtml(item.part_number || '—')}</td>
        <td>${Utils.escapeHtml(item.upc || '—')}</td>
        <td class="num">${Utils.stockBadge(qty)}</td>
        <td class="num" style="color:var(--txt-3)">${Utils.formatNumber(sold)}</td>
        <td class="num" style="${remColor}">${Utils.formatNumber(remaining)}</td>
        <td>${Utils.formatDate(item.date_added)}</td>
        <td style="font-size:12px;color:var(--txt-4)">${Utils.escapeHtml(item.notes || '—')}</td>
        <td style="width:36px;text-align:center;padding:0 4px">
          <button class="btn btn-ghost btn-icon btn-sm inv-edit-btn" data-sku="${Utils.escapeHtml(item.sku || '')}" title="Edit" style="opacity:.6">✏️</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.inv-row-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) _selectedSkus.add(cb.dataset.sku);
        else            _selectedSkus.delete(cb.dataset.sku);
        _syncSelectAll();
        _updateDeleteBar();
      });
    });

    tbody.querySelectorAll('.inv-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => _openEditModal(btn.closest('tr')));
    });

    _syncSelectAll();
    _updateDeleteBar();

    if (info) {
      const ps    = CONFIG.PAGE_SIZE;
      const start = ((_page - 1) * ps) + 1;
      const end   = Math.min(_page * ps, _total);
      info.textContent = `Showing ${start}–${end} of ${Utils.formatNumber(_total)}`;
    }

    Pagination.render('inventory-pagination', _page, Math.ceil(_total / CONFIG.PAGE_SIZE), p => { _page = p; load(); });
  }

  /* ── Selection helpers ───────────────────────────────────── */
  function _syncSelectAll() {
    const allCb = document.getElementById('inv-select-all');
    if (!allCb) return;
    const boxes  = Array.from(document.querySelectorAll('.inv-row-cb'));
    const allChk = boxes.length > 0 && boxes.every(b => b.checked);
    const anyChk = boxes.some(b => b.checked);
    allCb.checked       = allChk;
    allCb.indeterminate = !allChk && anyChk;
  }

  function _updateDeleteBar() {
    const bar = document.getElementById('inv-delete-bar');
    const cnt = document.getElementById('inv-selected-count');
    if (!bar) return;
    if (_selectedSkus.size > 0) {
      bar.style.display = 'flex';
      if (cnt) cnt.textContent = `${_selectedSkus.size} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  /* ── Inline edit modal ───────────────────────────────────── */
  function _openEditModal(tr) {
    const bodyHtml = `
      <div style="display:grid;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">SKU</label>
            <input class="form-input" id="inv-edit-sku" value="${Utils.escapeHtml(tr.dataset.sku)}">
          </div>
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">UPC</label>
            <input class="form-input" id="inv-edit-upc" value="${Utils.escapeHtml(tr.dataset.upc)}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">QUANTITY</label>
            <input class="form-input" id="inv-edit-qty" type="number" value="${Utils.escapeHtml(tr.dataset.qty)}">
          </div>
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">DATE ADDED</label>
            <input class="form-input" id="inv-edit-date" type="date" value="${Utils.escapeHtml(tr.dataset.date)}">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">BOX #</label>
            <input class="form-input" id="inv-edit-box" value="${Utils.escapeHtml(tr.dataset.box)}">
          </div>
          <div>
            <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">PART #</label>
            <input class="form-input" id="inv-edit-part" value="${Utils.escapeHtml(tr.dataset.part)}">
          </div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--txt-3);font-weight:600;display:block;margin-bottom:4px">NOTES</label>
          <input class="form-input" id="inv-edit-notes" value="${Utils.escapeHtml(tr.dataset.notes)}" placeholder="Optional">
        </div>
      </div>`;

    const m = new Modal({
      title:    'Edit Inventory Row',
      body:     bodyHtml,
      footer:   `<button class="btn btn-secondary btn-sm" data-action="cancel">Cancel</button>
                 <button class="btn btn-primary btn-sm" data-action="save">Save Changes</button>`,
      maxWidth: '480px',
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
            sku:        document.getElementById('inv-edit-sku').value.trim(),
            upc:        document.getElementById('inv-edit-upc').value.trim(),
            quantity:   parseInt(document.getElementById('inv-edit-qty').value, 10),
            box_number: document.getElementById('inv-edit-box').value.trim(),
            part_number: document.getElementById('inv-edit-part').value.trim(),
            notes:      document.getElementById('inv-edit-notes').value.trim(),
            date_added: document.getElementById('inv-edit-date').value,
          };
          if (!updates.sku || !updates.upc || isNaN(updates.quantity)) {
            Notify.warning('Validation', 'SKU, UPC, and quantity are required.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
            return;
          }
          await API.updateInventory(tr.dataset.sku, updates);
          Notify.success('Saved', 'Inventory row updated');
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

  /* ── Bulk delete ─────────────────────────────────────────── */
  async function _deleteSelected() {
    if (_selectedSkus.size === 0) return;
    const skus = Array.from(_selectedSkus);
    const confirmed = await Modal.confirm({
      title:       'Delete Inventory Rows',
      message:     `Delete ${skus.length} selected inventory ${skus.length === 1 ? 'row' : 'rows'}? This cannot be undone.`,
      confirmText: 'Delete',
      danger:      true,
    });
    if (!confirmed) return;
    try {
      const result = await API.deleteInventoryRows(skus);
      _selectedSkus.clear();
      Notify.success('Deleted', `Removed ${result.deleted} inventory ${result.deleted === 1 ? 'row' : 'rows'}`);
      _page = 1;
      load();
    } catch (err) {
      Notify.apiError(err);
    }
  }

  /* ── Load ────────────────────────────────────────────────── */
  async function load() {
    if (_loading) return;
    _loading = true;

    const tbody = document.getElementById('inventory-tbody');
    if (tbody) tbody.innerHTML = Loading.tableRows(COLS.length, 6);

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
    const searchInput  = document.getElementById('inventory-search');
    const searchBtn    = document.getElementById('inventory-search-btn');
    const selectAll    = document.getElementById('inv-select-all');
    const deleteSelBtn = document.getElementById('inv-delete-selected');

    if (searchInput) {
      const debouncedSearch = Utils.debounce(val => { _search = val; _page = 1; load(); }, 500);
      searchInput.addEventListener('input', e => debouncedSearch(e.target.value));
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { _search = e.target.value; _page = 1; load(); } });
    }
    if (searchBtn) searchBtn.addEventListener('click', () => { _search = searchInput?.value || ''; _page = 1; load(); });

    if (selectAll) {
      selectAll.addEventListener('change', () => {
        document.querySelectorAll('.inv-row-cb').forEach(cb => {
          cb.checked = selectAll.checked;
          if (selectAll.checked) _selectedSkus.add(cb.dataset.sku);
          else                   _selectedSkus.delete(cb.dataset.sku);
        });
        _updateDeleteBar();
      });
    }

    if (deleteSelBtn) deleteSelBtn.addEventListener('click', _deleteSelected);
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
      const start = Math.max(2, currentPage - 1);
      const end   = Math.min(totalPages - 1, currentPage + 1);

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
