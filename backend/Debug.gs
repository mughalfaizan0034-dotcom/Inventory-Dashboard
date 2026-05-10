'use strict';

var Debug = {

  log: function (module, action, status, details) {
    Debug._write(module, action, status, details, '');
  },

  logWithUser: function (module, action, status, details, userEmail) {
    Debug._write(module, action, status, details, userEmail || '');
  },

  _write: function (module, action, status, details, userEmail) {
    try {
      var row = {
        log_id:     Util.generateId(),
        timestamp:  new Date().toISOString(),
        module:     String(module  || ''),
        action:     String(action  || ''),
        status:     String(status  || 'info'),
        details:    typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
        user_email: String(userEmail || '')
      };
      BQ.insertRows(CONFIG.BQ.TABLES.DEBUG_LOGS, [row]);
    } catch (e) {
      // Silently swallow — never let debug logging break the main flow
      console.error('[Debug._write] ' + e.message);
    }
  },

  getLogs: function (limit, module, status) {
    var conds = [];
    if (module) conds.push("module = '" + module.replace(/'/g, "''") + "'");
    if (status) conds.push("status = '" + status.replace(/'/g, "''") + "'");

    var where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    var lim   = 'LIMIT ' + (parseInt(limit) || 100);

    var sql = [
      'SELECT log_id, timestamp, module, action, status, details, user_email',
      'FROM `' + BQ.tableRef(CONFIG.BQ.TABLES.DEBUG_LOGS) + '`',
      where,
      'ORDER BY timestamp DESC',
      lim
    ].join('\n');

    return BQ.runQuery(sql);
  },

  getSystemStatus: function () {
    var result = {
      timestamp: new Date().toISOString(),
      version:   CONFIG.APP.VERSION,
      bigquery:  false,
      tables:    {}
    };

    try {
      BQ.runQuery('SELECT 1 AS test');
      result.bigquery = true;

      Object.keys(CONFIG.BQ.TABLES).forEach(function (key) {
        var tbl = CONFIG.BQ.TABLES[key];
        try {
          var res = BQ.runQuery(
            'SELECT COUNT(*) AS cnt FROM `' + BQ.tableRef(tbl) + '` LIMIT 1'
          );
          result.tables[tbl] = { accessible: true, rowCount: res && res[0] ? Number(res[0].cnt) : 0 };
        } catch (te) {
          result.tables[tbl] = { accessible: false, error: te.message };
        }
      });
    } catch (e) {
      result.bigquery = false;
      result.error    = e.message;
    }

    return result;
  }
};
