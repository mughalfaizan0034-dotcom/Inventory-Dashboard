/* ============================================================
   uploads.js — File upload workflow: drag-and-drop, format
                conversion (xlsx→csv), upload history table
   ============================================================ */

const Uploads = (() => {

  /* ── Drop zone setup ────────────────────────────────────── */
  function _initDropZone(zoneId, inputId, fileType) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;

    const icon    = zone.querySelector('.drop-icon');
    const text    = zone.querySelector('.drop-text');
    const sub     = zone.querySelector('.drop-sub');
    const fileEl  = zone.querySelector('.drop-file');
    const btnId   = zoneId.replace('drop-zone-', 'upload-btn-');
    const btn     = document.getElementById(btnId);

    let selectedFile = null;

    function setFile(file) {
      const allowed = ['.csv', '.xlsx', '.xls'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext)) {
        Notify.error('Invalid file type', 'Only .csv, .xlsx, and .xls files are supported.');
        return;
      }
      selectedFile = file;
      zone.classList.add('has-file');
      if (icon)   icon.textContent = '✓';
      if (text)   text.textContent = file.name;
      if (sub)    sub.textContent  = Utils.formatFileSize(file.size);
      if (fileEl) { fileEl.textContent = 'File ready'; fileEl.style.display = 'block'; }
      if (btn)    btn.disabled = false;
    }

    function clearFile() {
      selectedFile = null;
      zone.classList.remove('has-file');
      if (icon)   icon.textContent = fileType === 'inventory' ? '📦' : '📋';
      if (text)   text.textContent = 'Drop file here or click to browse';
      if (sub)    sub.textContent  = 'CSV, XLSX, XLS · Max 10 MB';
      if (fileEl) fileEl.style.display = 'none';
      if (btn)    btn.disabled = true;
      input.value = '';
    }

    zone.addEventListener('click', e => { if (!e.target.closest('button')) input.click(); });
    input.addEventListener('change', e => { if (e.target.files[0]) setFile(e.target.files[0]); });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) setFile(file);
    });

    if (btn) {
      btn.disabled = true;
      btn.addEventListener('click', async () => {
        if (!selectedFile) return;
        await _doUpload(selectedFile, fileType, btn, zoneId);
        clearFile();
      });
    }

    const clearBtnId = zoneId.replace('drop-zone-', 'clear-btn-');
    const clearBtn = document.getElementById(clearBtnId);
    if (clearBtn) clearBtn.addEventListener('click', clearFile);

    return { setFile, clearFile, getFile: () => selectedFile };
  }

  /* ── Upload logic ───────────────────────────────────────── */
  async function _doUpload(file, fileType, btn, zoneId) {
    const progressWrapId = zoneId.replace('drop-zone-', 'progress-');
    const progressWrap   = document.getElementById(progressWrapId);
    const progressBar    = progressWrap?.querySelector('.progress-bar');
    const statusId       = zoneId.replace('drop-zone-', 'upload-status-');
    const statusEl       = document.getElementById(statusId);

    Loading.btn(btn, true);
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar)  { progressBar.style.width = '0%'; progressBar.className = 'progress-bar'; }
    if (statusEl)     statusEl.innerHTML = '';

    const _setProgress = pct => {
      if (progressBar) progressBar.style.width = pct + '%';
    };

    try {
      _setProgress(10);
      let csvText;
      try {
        csvText = await Utils.fileToCSV(file);
      } catch (convErr) {
        throw new Error('Could not convert file: ' + convErr.message);
      }
      _setProgress(30);

      const apiMethod = fileType === 'inventory' ? API.uploadInventory : API.uploadOrders;
      const result    = await apiMethod(csvText, file.name);
      _setProgress(100);

      if (progressBar) progressBar.classList.add('success');

      const inserted = result.inserted ?? result.rowsInserted ?? 0;
      const skipped  = result.skipped  ?? result.rowsSkipped  ?? 0;
      const errors   = result.errors?.length ?? 0;

      if (statusEl) {
        statusEl.innerHTML = `
          <div style="margin-top:10px;font-size:13px">
            ${Utils.badgeHtml('success', `✓ ${inserted} rows imported`)}
            ${skipped > 0 ? Utils.badgeHtml('warning', `${skipped} skipped`) : ''}
            ${errors  > 0 ? Utils.badgeHtml('error',   `${errors} errors`)   : ''}
          </div>
          ${errors > 0 ? _renderErrors(result.errors) : ''}`;
      }

      Notify.success('Upload complete', `${inserted} rows imported successfully.`);
      loadHistory();
    } catch (err) {
      if (progressBar) progressBar.classList.add('error');
      if (statusEl) statusEl.innerHTML = `<div class="form-error" style="margin-top:8px">✕ ${Utils.escapeHtml(err.message)}</div>`;
      Notify.apiError(err);
    } finally {
      Loading.btn(btn, false);
      setTimeout(() => { if (progressWrap) progressWrap.style.display = 'none'; }, 3000);
    }
  }

  function _renderErrors(errors) {
    if (!errors || !errors.length) return '';
    const shown = errors.slice(0, 5);
    return `
      <div style="margin-top:8px;background:var(--error-bg);border:1px solid var(--error-bd);border-radius:var(--r-sm);padding:10px;font-size:12px;color:var(--error)">
        <strong>Validation issues:</strong>
        <ul style="margin:4px 0 0 16px;padding:0">
          ${shown.map(e => `<li>Row ${e.row}: ${Utils.escapeHtml(e.issue)}</li>`).join('')}
          ${errors.length > 5 ? `<li>…and ${errors.length - 5} more</li>` : ''}
        </ul>
      </div>`;
  }

  /* ── Upload history ─────────────────────────────────────── */
  async function loadHistory(type = '') {
    const tbody  = document.getElementById('upload-history-tbody');
    const filter = document.getElementById('history-type-filter')?.value || type;
    if (!tbody) return;

    tbody.innerHTML = Loading.tableRows(6, 5);

    try {
      const data = await API.getUploadHistory(filter);
      const rows = data.rows || data || [];
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:0">${Loading.empty('📤', 'No uploads yet')}</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(row => {
        const statusVariant = {
          success:    'success',
          completed:  'success',
          failed:     'error',
          error:      'error',
          processing: 'warning',
        }[row.status?.toLowerCase()] || 'gray';

        return `<tr>
          <td>${Utils.formatDatetime(row.uploaded_at)}</td>
          <td>${Utils.badgeHtml(row.upload_type === 'inventory' ? 'info' : 'warning', row.upload_type || '—')}</td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(row.filename || '—')}</td>
          <td class="num">${Utils.formatNumber(row.rows_inserted)}</td>
          <td class="num">${Utils.formatNumber(row.rows_skipped)}</td>
          <td>${Utils.badgeHtml(statusVariant, row.status || '—')}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6">${Loading.error('Failed to load history')}</td></tr>`;
    }
  }

  /* ── Template downloads ─────────────────────────────────── */
  function _bindTemplateLinks() {
    document.querySelectorAll('[data-download-template]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const type = link.dataset.downloadTemplate;
        const url  = `assets/templates/${type}_template.csv`;
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${type}_template.csv`;
        a.click();
      });
    });
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    _initDropZone('drop-zone-inventory', 'file-input-inventory', 'inventory');
    _initDropZone('drop-zone-orders',    'file-input-orders',    'orders');
    _bindTemplateLinks();

    const historyFilter = document.getElementById('history-type-filter');
    if (historyFilter) historyFilter.addEventListener('change', () => loadHistory(historyFilter.value));

    const refreshBtn = document.getElementById('history-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadHistory());
  }

  return { init, loadHistory };
})();
