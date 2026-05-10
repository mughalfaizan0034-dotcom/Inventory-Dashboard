/* ============================================================
   api.js — Centralized fetch layer to Apps Script Web App.
             All requests are POST with JSON body.
             Content-Type is text/plain to avoid CORS preflight.
             redirect: 'follow' handles Apps Script redirect.
   ============================================================ */

const API = (() => {

  function getToken() {
    return sessionStorage.getItem(CONFIG.SESSION_KEY) || null;
  }

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

  async function _post(action, data = {}, retries = CONFIG.MAX_RETRIES) {
    const body = JSON.stringify({ action, data, token: getToken() });
    const options = {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    };

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await _fetchWithTimeout(CONFIG.API_URL, options, CONFIG.TIMEOUT_MS);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Invalid response from server.');
        }

        if (parsed.success === false) {
          const err = new Error(parsed.error || 'Server returned an error.');
          err.serverError = true;
          err.code = parsed.code;
          throw err;
        }

        return parsed.data !== undefined ? parsed.data : parsed;
      } catch (err) {
        lastErr = err;
        if (err.serverError) throw err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  /* ── Public API methods ─────────────────────────────────── */
  return {
    /* Auth */
    async login(email, password) {
      return _post('login', { email, password }, 0);
    },

    async logout() {
      try { await _post('logout', {}, 0); } catch { /* best-effort */ }
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem(CONFIG.USER_KEY);
    },

    async verifySession() {
      return _post('verifySession', {}, 0);
    },

    /* Dashboard */
    async getDashboardKPIs() {
      return _post('getDashboardKPIs');
    },

    /* Performance */
    async getPerformanceData(weeks = 12) {
      return _post('getPerformanceData', { weeks });
    },

    /* Inventory / Box Lookup */
    async searchBox(query) {
      return _post('searchBox', { query });
    },

    async getInventoryList(page = 1, pageSize = CONFIG.PAGE_SIZE, search = '') {
      return _post('getInventoryList', { page, pageSize, search });
    },

    /* Orders */
    async getOrders(page = 1, pageSize = CONFIG.PAGE_SIZE, filters = {}) {
      return _post('getOrders', { page, pageSize, filters });
    },

    async getPlatforms() {
      return _post('getPlatforms');
    },

    /* Uploads */
    async uploadInventory(csvText, filename) {
      return _post('uploadInventory', { csvText, filename }, 0);
    },

    async uploadOrders(csvText, filename) {
      return _post('uploadOrders', { csvText, filename }, 0);
    },

    async getUploadHistory(type = '') {
      return _post('getUploadHistory', { type });
    },

    /* Users */
    async getUsers() {
      return _post('getUsers');
    },

    async createUser(userData) {
      return _post('createUser', userData, 0);
    },

    async updateUser(userId, updates) {
      return _post('updateUser', { userId, updates }, 0);
    },

    async deleteUser(userId) {
      return _post('deleteUser', { userId }, 0);
    },

    /* System */
    async ping() {
      return _post('ping', {}, 0);
    },

    async getSystemStatus() {
      return _post('getSystemStatus');
    },

    async getLogs() {
      return _post('getLogs');
    },

    async bootstrapAdmin() {
      return _post('bootstrapAdmin', {}, 0);
    },
  };
})();
