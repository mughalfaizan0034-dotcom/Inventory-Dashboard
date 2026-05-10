'use strict';

var Inventory = {

  // Home-page KPIs — all calculated server-side in BigQuery.
  getDashboardKPIs: function () {
    var inv = BQ.tableRef(CONFIG.BQ.TABLES.INVENTORY);
    var ord = BQ.tableRef(CONFIG.BQ.TABLES.ORDERS);

    var sql = [
      'WITH sku_calc AS (',
      '  SELECT',
      '    i.sku,',
      '    CAST(i.quantity AS INT64)                                             AS initial_stock,',
      '    COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)                      AS units_sold,',
      '    GREATEST(0, COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)',
      '               - CAST(i.quantity AS INT64))                               AS phantom_units,',
      '    GREATEST(0, CAST(i.quantity AS INT64)',
      '               - COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0))        AS remaining_stock',
      '  FROM `' + inv + '` i',
      '  LEFT JOIN `' + ord + '` o ON i.sku = o.sku',
      '  GROUP BY i.sku, i.quantity',
      '),',
      'undef AS (',
      '  SELECT COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0) AS undefined_sku_sales',
      '  FROM `' + ord + '` o',
      '  LEFT JOIN `' + inv + '` i ON o.sku = i.sku',
      '  WHERE i.sku IS NULL',
      ')',
      'SELECT',
      '  SUM(s.initial_stock)                                    AS total_initial_stock,',
      '  SUM(s.units_sold)                                       AS units_sold,',
      '  SUM(s.phantom_units)                                    AS phantom_units,',
      '  SUM(s.remaining_stock)                                  AS remaining_stock,',
      '  COUNTIF(s.remaining_stock > 0)                         AS in_stock_count,',
      '  COUNTIF(s.remaining_stock = 0)                         AS sold_out_count,',
      '  COUNT(DISTINCT s.sku)                                   AS total_skus,',
      '  (SELECT COUNT(DISTINCT upc) FROM `' + inv + '`)        AS total_upcs,',
      '  u.undefined_sku_sales',
      'FROM sku_calc s',
      'CROSS JOIN undef u'
    ].join('\n');

    var rows = BQ.runQuery(sql);
    if (!rows || !rows.length) {
      return {
        totalInitialStock: 0, unitsSold: 0, phantomUnits: 0, undefinedSkuSales: 0,
        remainingStock: 0, totalUpcs: 0, inStockCount: 0, soldOutCount: 0, totalSkus: 0
      };
    }

    var r = rows[0];
    return {
      totalInitialStock: Number(r.total_initial_stock)  || 0,
      unitsSold:         Number(r.units_sold)           || 0,
      phantomUnits:      Number(r.phantom_units)        || 0,
      undefinedSkuSales: Number(r.undefined_sku_sales)  || 0,
      remainingStock:    Number(r.remaining_stock)      || 0,
      totalUpcs:         Number(r.total_upcs)           || 0,
      inStockCount:      Number(r.in_stock_count)       || 0,
      soldOutCount:      Number(r.sold_out_count)       || 0,
      totalSkus:         Number(r.total_skus)           || 0
    };
  },

  // Paginated inventory list with per-SKU calculated fields.
  getInventoryList: function (page, pageSize, search) {
    page     = Math.max(1, parseInt(page)    || 1);
    pageSize = Math.min(200, parseInt(pageSize) || 50);
    var offset = (page - 1) * pageSize;

    var inv = BQ.tableRef(CONFIG.BQ.TABLES.INVENTORY);
    var ord = BQ.tableRef(CONFIG.BQ.TABLES.ORDERS);

    var searchWhere = '';
    if (search && search.trim()) {
      var s = Util.escapeSql(search.trim());
      searchWhere = [
        "WHERE i.sku LIKE '%" + s + "%'",
        "   OR i.upc LIKE '%" + s + "%'",
        "   OR i.part_number LIKE '%" + s + "%'",
        "   OR i.box_number LIKE '%" + s + "%'"
      ].join('\n');
    }

    var dataSql = [
      'SELECT',
      '  i.sku,',
      '  i.box_number,',
      '  i.part_number,',
      '  i.upc,',
      '  CAST(i.quantity AS INT64)                                          AS initial_stock,',
      '  COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)                   AS units_sold,',
      '  GREATEST(0, COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)',
      '              - CAST(i.quantity AS INT64))                            AS phantom_units,',
      '  GREATEST(0, CAST(i.quantity AS INT64)',
      '              - COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0))     AS remaining_stock,',
      '  i.date_added,',
      '  i.notes',
      'FROM `' + inv + '` i',
      'LEFT JOIN `' + ord + '` o ON i.sku = o.sku',
      searchWhere,
      'GROUP BY i.sku, i.box_number, i.part_number, i.upc, i.quantity, i.date_added, i.notes',
      'ORDER BY CAST(i.box_number AS STRING), i.sku',
      'LIMIT ' + pageSize + ' OFFSET ' + offset
    ].join('\n');

    var countSql = [
      'SELECT COUNT(DISTINCT i.sku) AS total',
      'FROM `' + inv + '` i',
      searchWhere
    ].join('\n');

    var items      = BQ.runQuery(dataSql) || [];
    var countRows  = BQ.runQuery(countSql);
    var total      = countRows && countRows[0] ? Number(countRows[0].total) : 0;

    return {
      items: items,
      pagination: { page: page, pageSize: pageSize, total: total, totalPages: Math.ceil(total / pageSize) }
    };
  },

  // Box Lookup — search by SKU, UPC, or part number.
  searchBox: function (query) {
    if (!query || !query.trim()) return { items: [] };

    var q   = Util.escapeSql(query.trim());
    var inv = BQ.tableRef(CONFIG.BQ.TABLES.INVENTORY);
    var ord = BQ.tableRef(CONFIG.BQ.TABLES.ORDERS);

    var sql = [
      'WITH matches AS (',
      '  SELECT DISTINCT i.sku',
      '  FROM `' + inv + '` i',
      "  WHERE i.sku         = '" + q + "'",
      "     OR i.upc         = '" + q + "'",
      "     OR i.part_number = '" + q + "'",
      "     OR LOWER(i.sku)         LIKE LOWER('%" + q + "%')",
      "     OR LOWER(i.upc)         LIKE LOWER('%" + q + "%')",
      "     OR LOWER(i.part_number) LIKE LOWER('%" + q + "%')",
      '),',
      'sku_stats AS (',
      '  SELECT',
      '    i.sku,',
      '    i.box_number,',
      '    i.part_number,',
      '    i.upc,',
      '    CAST(i.quantity AS INT64)                                        AS initial_stock,',
      '    COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)                 AS units_sold,',
      '    GREATEST(0, COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0)',
      '                - CAST(i.quantity AS INT64))                          AS phantom_units,',
      '    GREATEST(0, CAST(i.quantity AS INT64)',
      '                - COALESCE(SUM(CAST(o.quantity_sold AS INT64)), 0))   AS remaining_stock',
      '  FROM `' + inv + '` i',
      '  LEFT JOIN `' + ord + '` o ON i.sku = o.sku',
      '  WHERE i.sku IN (SELECT sku FROM matches)',
      '  GROUP BY i.sku, i.box_number, i.part_number, i.upc, i.quantity',
      ')',
      'SELECT * FROM sku_stats ORDER BY box_number, sku'
    ].join('\n');

    return { items: BQ.runQuery(sql) || [] };
  }
};
