'use strict';

// ── HTTP entry points ─────────────────────────────────────────────────────────

function doGet(e) {
  // Template download shortcut: ?action=downloadTemplate&type=inventory|orders
  if (e && e.parameter && e.parameter.action === 'downloadTemplate') {
    var type = e.parameter.type || 'inventory';
    var csv  = Uploads.getTemplateCSV(type);
    return ContentService
      .createTextOutput(csv)
      .setMimeType(ContentService.MimeType.CSV)
      .downloadAsFile(type + '_template.csv');
  }

  // Serve the frontend SPA
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Patman Inventory Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

function doPost(e) {
  try {
    var payload  = JSON.parse(e.postData.contents);
    var response = callAPI(payload.action, payload.data || {}, payload.token || '');
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify(Util.error('Request failed: ' + err.message)))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Main API dispatcher (also called directly via google.script.run) ──────────

function callAPI(action, data, token) {
  data  = data  || {};
  token = token || '';

  // ── Public routes (no auth) ──────────────────────────────────────────────
  if (action === 'login') return Auth.login(data.email, data.password);
  if (action === 'ping')  return Util.success({ status: 'ok', version: CONFIG.APP.VERSION });

  // ── All other routes require a valid session ─────────────────────────────
  var session;
  try {
    session = Auth.requireAuth(token);
  } catch (_) {
    return { success: false, error: 'UNAUTHORIZED', message: 'Session expired or invalid. Please log in again.' };
  }

  try {
    switch (action) {

      // Auth
      case 'logout':
        return Auth.logout(token);

      // Dashboard
      case 'getDashboardKPIs':
        return Util.success(Inventory.getDashboardKPIs());

      // Inventory
      case 'getInventory':
        return Util.success(Inventory.getInventoryList(data.page, data.pageSize, data.search));

      case 'searchBox':
        return Util.success(Inventory.searchBox(data.query));

      // Orders
      case 'getOrders':
        return Util.success(Orders.getOrders(data.page, data.pageSize, data.filters));

      case 'getOrderStats':
        return Util.success(Orders.getOrderStats());

      case 'getPlatforms':
        return Util.success({ platforms: Orders.getPlatforms() });

      case 'getPerformance':
        return Util.success(Orders.getPerformanceData(data.weeks));

      // Uploads — manager or above
      case 'uploadInventory':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.MANAGER);
        return Uploads.processInventoryUpload(data.csvText, data.filename, session.email);

      case 'uploadOrders':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.MANAGER);
        return Uploads.processOrdersUpload(data.csvText, data.filename, session.email);

      case 'getUploadHistory':
        return Util.success({ history: Uploads.getUploadHistory(data.type) });

      case 'getValidationErrors':
        return Util.success({ errors: Uploads.getValidationErrors(data.uploadId) });

      // User management — admin only
      case 'getUsers':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Util.success({ users: Users.getUsers() });

      case 'createUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.createUser(data.email, data.displayName, data.role, data.password);

      case 'updateUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.updateUser(data.userId, data.updates);

      case 'deleteUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.deleteUser(data.userId);

      // Debug — admin only
      case 'getDebugLogs':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Util.success({ logs: Debug.getLogs(data.limit, data.module, data.status) });

      case 'getSystemStatus':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Util.success(Debug.getSystemStatus());

      default:
        return Util.error('Unknown action: ' + action);
    }

  } catch (routeErr) {
    var msg = routeErr.message || 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return { success: false, error: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' };
    }
    if (msg === 'FORBIDDEN') {
      return { success: false, error: 'FORBIDDEN', message: 'You do not have permission for this action.' };
    }
    Debug.logWithUser('Routes', action, 'error', { error: msg }, session ? session.email : '');
    return Util.error(msg);
  }
}
