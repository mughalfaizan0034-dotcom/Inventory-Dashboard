/* ============================================================
   api.js — Cloud Run API client. All requests go to Cloud Run.
   Apps Script transport has been fully removed.

   Transport functions:
     _crGet(path, params)  — GET  with Bearer token + 401 auto-refresh
     _crPost(path, body)   — POST with Bearer token + 401 auto-refresh
     _crPostRaw(path,body) — POST without 401 interception (auth endpoints)

   Auth endpoints use Raw transport to break the refresh retry loop.
   All other endpoints use the intercepted transport.
   ============================================================ */

const API = (() => {

  function getToken() {
    return sessionStorage.getItem(CONFIG.SESSION_KEY) || null;
  }

  /* ── 401 interceptor — auto-refresh + forced logout ──────── */
  let _refreshPromise = null;

  function _forceLogout() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.USER_KEY);
    sessionStorage.removeItem('patman_refresh_token');
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  function _attemptRefresh() {
    if (_refreshPromise) return _refreshPromise;
    const storedRefresh = sessionStorage.getItem('patman_refresh_token');
    if (!storedRefresh) {
      _forceLogout();
      return Promise.reject(new Error('Session expired'));
    }
    _refreshPromise = _crPostRaw('/auth/refresh', { refresh_token: storedRefresh }, 0)
      .then(data => {
        sessionStorage.setItem(CONFIG.SESSION_KEY, data.access_token);
        if (data.refresh_token) sessionStorage.setItem('patman_refresh_token', data.refresh_token);
      })
      .catch(err => { _forceLogout(); throw err; })
      .finally(() => { _refreshPromise = null; });
    return _refreshPromise;
  }

  /* ── Cloud Run GET — raw, no 401 interception ───────────── */
  async function _crGetRaw(path, params = {}, retries = 0) {
    const tok = getToken();
    const url = new URL(CONFIG.CLOUD_RUN_URL + path);
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;
      url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const options = {
      method:  'GET',
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    };

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await _fetchWithTimeout(url.toString(), options, CONFIG.TIMEOUT_MS);
        return await _parseResponse(res);
      } catch (err) {
        lastErr = err;
        if (err.serverError || err.status === 401) throw err;
        if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /* ── Cloud Run GET — with 401 auto-refresh ──────────────── */
  async function _crGet(path, params = {}, retries = 1) {
    try {
      return await _crGetRaw(path, params, retries);
    } catch (err) {
      if (err.status !== 401) throw err;
      await _attemptRefresh();
      return _crGetRaw(path, params, 0);
    }
  }

  /* ── Cloud Run POST — raw, no 401 interception ──────────── */
  async function _crPostRaw(path, body, retries = 0) {
    const tok = getToken();
    const options = {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
    };

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await _fetchWithTimeout(CONFIG.CLOUD_RUN_URL + path, options, CONFIG.TIMEOUT_MS);
        return await _parseResponse(res);
      } catch (err) {
        lastErr = err;
        if (err.serverError || err.status === 401) throw err;
        if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /* ── Cloud Run POST — with 401 auto-refresh ─────────────── */
  async function _crPost(path, body, retries = 0) {
    try {
      return await _crPostRaw(path, body, retries);
    } catch (err) {
      if (err.status !== 401) throw err;
      await _attemptRefresh();
      return _crPostRaw(path, body, 0);
    }
  }

  /* ── Cloud Run PATCH — raw, no 401 interception ─────────── */
  async function _crPatchRaw(path, body, retries = 0) {
    const tok = getToken();
    const options = {
      method:  'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify(body),
    };

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await _fetchWithTimeout(CONFIG.CLOUD_RUN_URL + path, options, CONFIG.TIMEOUT_MS);
        return await _parseResponse(res);
      } catch (err) {
        lastErr = err;
        if (err.serverError || err.status === 401) throw err;
        if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /* ── Cloud Run PATCH — with 401 auto-refresh ────────────── */
  async function _crPatch(path, body, retries = 0) {
    try {
      return await _crPatchRaw(path, body, retries);
    } catch (err) {
      if (err.status !== 401) throw err;
      await _attemptRefresh();
      return _crPatchRaw(path, body, 0);
    }
  }

  /* ── Cloud Run DELETE — raw, no 401 interception ────────── */
  async function _crDeleteRaw(path, retries = 0) {
    const tok = getToken();
    const options = {
      method:  'DELETE',
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    };

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await _fetchWithTimeout(CONFIG.CLOUD_RUN_URL + path, options, CONFIG.TIMEOUT_MS);
        return await _parseResponse(res);
      } catch (err) {
        lastErr = err;
        if (err.serverError || err.status === 401) throw err;
        if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /* ── Cloud Run DELETE — with 401 auto-refresh ───────────── */
  async function _crDelete(path, retries = 0) {
    try {
      return await _crDeleteRaw(path, retries);
    } catch (err) {
      if (err.status !== 401) throw err;
      await _attemptRefresh();
      return _crDeleteRaw(path, 0);
    }
  }

  /* ── Abort-controller timeout wrapper ────────────────────── */
  async function _fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
      throw err;
    }
  }

  /* ── Shared response parser ──────────────────────────────── */
  async function _parseResponse(res) {
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { /* non-JSON — fall through */ }

    if (!res.ok) {
      const message = parsed?.error || `HTTP ${res.status}: ${res.statusText}`;
      const err = new Error(message);
      err.status = res.status;
      if (parsed?.success === false) err.serverError = true;
      throw err;
    }

    if (parsed?.success === false) {
      const err = new Error(parsed.error || 'Server returned an error.');
      err.serverError = true;
      throw err;
    }
    return parsed?.data !== undefined ? parsed.data : parsed;
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {

    /* Auth — raw transport: never trigger 401 refresh on auth endpoints */
    async login(username, password) {
      const data = await _crPostRaw('/auth/login', { username, password }, 0);
      return { token: data.access_token, refresh_token: data.refresh_token, user: data.user };
    },

    async logout() {
      // JWT is stateless — no server call needed; just clear local storage.
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem(CONFIG.USER_KEY);
      sessionStorage.removeItem('patman_refresh_token');
    },

    async refreshToken(refreshToken) {
      return _crPostRaw('/auth/refresh', { refresh_token: refreshToken }, 0);
    },

    async verifySession() {
      const user = JSON.parse(sessionStorage.getItem(CONFIG.USER_KEY) || 'null');
      if (user) return { user };
      throw new Error('No session');
    },

    /* Dashboard */
    async getDashboardKPIs() {
      return _crGet('/dashboard/kpis');
    },

    async getPerformanceData(weeks = 12) {
      return _crGet('/dashboard/performance', { weeks });
    },

    /* Inventory */
    async searchBox(query) {
      return _crGet('/inventory', { search: query, pageSize: 10, page: 1 });
    },

    async getInventoryList(page = 1, pageSize = CONFIG.PAGE_SIZE, search = '') {
      return _crGet('/inventory', { page, pageSize, search });
    },

    /* Orders */
    async getOrders(page = 1, pageSize = CONFIG.PAGE_SIZE, filters = {}) {
      return _crGet('/orders', { page, pageSize, ...filters });
    },

    async getPlatforms() {
      return _crGet('/orders/platforms');
    },

    /* Uploads */
    async uploadInventory(csvText, filename) {
      return _crPost('/uploads/inventory', { csvText, filename }, 0);
    },

    async uploadOrders(csvText, filename) {
      return _crPost('/uploads/orders', { csvText, filename }, 0);
    },

    async getUploadHistory(type = '') {
      return _crGet('/uploads/history', { type });
    },

    /* Users */
    async getUsers() {
      return _crGet('/users');
    },

    async createUser(userData) {
      return _crPost('/users', userData, 0);
    },

    async updateUser(userId, updates) {
      return _crPatch(`/users/${userId}`, updates, 0);
    },

    async deleteUser(userId) {
      return _crDelete(`/users/${userId}`, 0);
    },

    /* System */
    async ping() {
      return _crGet('/health');
    },

    async getSystemStatus() {
      return _crGet('/health');
    },

    async getLogs() {
      return { entries: [] }; // Logs are server-side via Cloud Logging
    },
  };
})();
