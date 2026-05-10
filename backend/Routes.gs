'use strict';

// ── HTTP entry points ─────────────────────────────────────────────────────────
// Frontend is hosted on GitHub Pages; this script only serves as an API.
// doGet() returns a JSON status ping (no HTML served here).

function doGet(e) {
  var response = ContentService
    .createTextOutput(JSON.stringify({ success: true, data: { status: 'ok', version: CONFIG.APP.VERSION, name: CONFIG.APP.NAME } }))
    .setMimeType(ContentService.MimeType.JSON);
  return response;
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

// ── Main API dispatcher ───────────────────────────────────────────────────────

function callAPI(action, data, token) {
  data  = data  || {};
  token = token || '';

  // ── Public routes (no auth required) ────────────────────────────────────
  if (action === 'ping') {
    return Util.success({ status: 'ok', version: CONFIG.APP.VERSION });
  }

  if (action === 'login') {
    return Auth.login(data.email, data.password);
  }

  if (action === 'bootstrapAdmin') {
    Auth.bootstrapAdminUser();
    return Util.success({ message: 'Admin bootstrap complete' });
  }

  // ── All other routes require a valid session ─────────────────────────────
  var session;
  try {
    session = Auth.requireAuth(token);
  } catch (_) {
    return { success: false, error: 'UNAUTHORIZED', message: 'Session expired or invalid. Please log in again.' };
  }

  try {
    switch (action) {

      // ── Auth ──────────────────────────────────────────────────────────── //
      case 'logout':
        return Auth.logout(token);

      case 'verifySession':
        return Util.success({ user: session });

      // ── Dashboard ─────────────────────────────────────────────────────── //
      case 'getDashboardKPIs':
        return Util.success(Inventory.getDashboardKPIs());

      // ── Inventory ─────────────────────────────────────────────────────── //
      case 'searchBox':
        return Util.success(Inventory.searchBox(data.query));

      case 'getInventoryList':  // frontend uses this name
      case 'getInventory':
        return Util.success(Inventory.getInventoryList(data.page, data.pageSize, data.search));

      // ── Orders ────────────────────────────────────────────────────────── //
      case 'getOrders':
        return Util.success(Orders.getOrders(data.page, data.pageSize, data.filters));

      case 'getPlatforms':
        var platforms = Orders.getPlatforms();
        return Util.success(Array.isArray(platforms) ? platforms : (platforms.platforms || []));

      case 'getPerformanceData':  // frontend uses this name
      case 'getPerformance':
        return Util.success(Orders.getPerformanceData(data.weeks));

      // ── Uploads ───────────────────────────────────────────────────────── //
      case 'uploadInventory':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.MANAGER);
        return Uploads.processInventoryUpload(data.csvText, data.filename, session.email);

      case 'uploadOrders':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.MANAGER);
        return Uploads.processOrdersUpload(data.csvText, data.filename, session.email);

      case 'getUploadHistory':
        var histResult = Uploads.getUploadHistory(data.type);
        return Util.success(Array.isArray(histResult) ? { rows: histResult } : histResult);

      // ── Users ─────────────────────────────────────────────────────────── //
      case 'getUsers':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        var usersResult = Users.getUsers();
        return Util.success(Array.isArray(usersResult) ? usersResult : (usersResult.users || []));

      case 'createUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.createUser(
          data.email,
          data.display_name || data.displayName,
          data.role,
          data.password
        );

      case 'updateUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.updateUser(data.userId, data.updates);

      case 'deleteUser':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Users.deleteUser(data.userId);

      // ── System / Debug ────────────────────────────────────────────────── //
      case 'getSystemStatus':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Util.success(Debug.getSystemStatus());

      case 'getLogs':           // frontend uses this name
      case 'getDebugLogs':
        Auth.requireRole(token, CONFIG.AUTH.ROLES.ADMIN);
        return Util.success({ entries: Debug.getLogs(data.limit, data.module, data.status) });

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
    Debug.logWithUser('Routes', action, 'error', { error: msg }, session ? session.email : 'unknown');
    return Util.error(msg);
  }
}
