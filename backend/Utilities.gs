'use strict';

var Util = {

  generateId: function () {
    return Utilities.getUuid().replace(/-/g, '');
  },

  // --- Standard API response wrappers ---

  success: function (data) {
    return { success: true, data: data };
  },

  error: function (message, details) {
    return { success: false, error: message, details: details || null };
  },

  // --- SKU parsing ---
  // Format: ARA{boxNumber}-{partNumber}-{upc}
  // partNumber may itself contain dashes — UPC is always the final 12-13 digit segment.
  parseSKU: function (sku) {
    if (!sku || typeof sku !== 'string') return null;
    var m = sku.match(/^ARA(\d+)-(.+)-(\d{12,13})$/);
    if (!m) return null;
    return { sku: sku, boxNumber: m[1], partNumber: m[2], upc: m[3] };
  },

  // --- Date helpers ---

  isValidDate: function (str) {
    if (!str) return false;
    return !isNaN(new Date(str.toString().trim()).getTime());
  },

  // --- Type/value validators ---

  isValidUPC: function (val) {
    return /^\d{12,13}$/.test(String(val || '').trim());
  },

  isPositiveInt: function (val) {
    var n = parseInt(val);
    return !isNaN(n) && n > 0;
  },

  isNonNegativeInt: function (val) {
    var n = parseInt(val);
    return !isNaN(n) && n >= 0;
  },

  // --- Array chunking for batch inserts ---

  chunkArray: function (arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  },

  // --- CSV parser (handles quoted fields) ---

  parseCSVLine: function (line) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  },

  parseCSV: function (text) {
    if (!text) return { headers: [], rows: [] };
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { headers: [], rows: [] };

    var headers = Util.parseCSVLine(lines[0]).map(function (h) {
      return h.toLowerCase().replace(/\s+/g, '_');
    });

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var vals = Util.parseCSVLine(lines[i]);
      if (vals.every(function (v) { return !v; })) continue;
      var row = {};
      headers.forEach(function (h, idx) { row[h] = vals[idx] !== undefined ? vals[idx] : ''; });
      rows.push(row);
    }

    return { headers: headers, rows: rows };
  },

  // Build CSV template string from column list
  buildCSVTemplate: function (columns) {
    return columns.join(',') + '\n';
  },

  // Safely escape single-quotes for BigQuery SQL strings
  escapeSql: function (str) {
    return String(str || '').replace(/'/g, "''");
  }
};
