'use strict';

var Validation = {

  // Returns array of { row, column, issue } objects
  validateInventoryData: function (rows) {
    var errors  = [];
    var seenSKU = {};
    rows.forEach(function (row, idx) {
      var errs = Validation._inventoryRow(row, idx + 2, seenSKU);
      errors   = errors.concat(errs);
    });
    return errors;
  },

  validateOrdersData: function (rows) {
    var errors     = [];
    var seenOrders = {};
    rows.forEach(function (row, idx) {
      var errs = Validation._orderRow(row, idx + 2, seenOrders);
      errors   = errors.concat(errs);
    });
    return errors;
  },

  checkRequiredColumns: function (headers, required) {
    return required.filter(function (col) { return headers.indexOf(col) === -1; });
  },

  // --- private ---

  _inventoryRow: function (row, rowNum, seen) {
    var errs = [];

    // sku
    if (!row.sku || !row.sku.trim()) {
      errs.push({ row: rowNum, column: 'sku', issue: 'SKU is required' });
    } else {
      var sku = row.sku.trim();
      if (seen[sku]) {
        errs.push({ row: rowNum, column: 'sku',
          issue: 'Duplicate SKU "' + sku + '" (first at row ' + seen[sku] + ')' });
      } else {
        seen[sku] = rowNum;
      }
    }

    // box_number
    if (!row.box_number && row.box_number !== 0) {
      errs.push({ row: rowNum, column: 'box_number', issue: 'Box number is required' });
    }

    // part_number
    if (!row.part_number || !row.part_number.toString().trim()) {
      errs.push({ row: rowNum, column: 'part_number', issue: 'Part number is required' });
    }

    // upc
    if (!row.upc || !row.upc.toString().trim()) {
      errs.push({ row: rowNum, column: 'upc', issue: 'UPC is required' });
    } else if (!Util.isValidUPC(row.upc)) {
      errs.push({ row: rowNum, column: 'upc',
        issue: 'UPC must be 12–13 digits. Got: ' + row.upc });
    }

    // quantity
    if (row.quantity === '' || row.quantity === undefined || row.quantity === null) {
      errs.push({ row: rowNum, column: 'quantity', issue: 'Quantity is required' });
    } else if (!Util.isNonNegativeInt(row.quantity)) {
      errs.push({ row: rowNum, column: 'quantity',
        issue: 'Quantity must be a non-negative integer. Got: ' + row.quantity });
    }

    // date_added
    if (!row.date_added || !row.date_added.toString().trim()) {
      errs.push({ row: rowNum, column: 'date_added', issue: 'Date added is required' });
    } else if (!Util.isValidDate(row.date_added)) {
      errs.push({ row: rowNum, column: 'date_added',
        issue: 'Invalid date format. Got: ' + row.date_added });
    }

    return errs;
  },

  _orderRow: function (row, rowNum, seen) {
    var errs = [];

    // order_id
    if (!row.order_id || !row.order_id.toString().trim()) {
      errs.push({ row: rowNum, column: 'order_id', issue: 'Order ID is required' });
    } else {
      var oid = row.order_id.toString().trim();
      if (seen[oid]) {
        errs.push({ row: rowNum, column: 'order_id',
          issue: 'Duplicate order ID in file: "' + oid + '" (first at row ' + seen[oid] + ')' });
      } else {
        seen[oid] = rowNum;
      }
    }

    // order_date
    if (!row.order_date || !row.order_date.toString().trim()) {
      errs.push({ row: rowNum, column: 'order_date', issue: 'Order date is required' });
    } else if (!Util.isValidDate(row.order_date)) {
      errs.push({ row: rowNum, column: 'order_date',
        issue: 'Invalid date format. Got: ' + row.order_date });
    }

    // sku
    if (!row.sku || !row.sku.toString().trim()) {
      errs.push({ row: rowNum, column: 'sku', issue: 'SKU is required' });
    }

    // upc
    if (!row.upc || !row.upc.toString().trim()) {
      errs.push({ row: rowNum, column: 'upc', issue: 'UPC is required' });
    }

    // quantity_sold
    if (row.quantity_sold === '' || row.quantity_sold === undefined || row.quantity_sold === null) {
      errs.push({ row: rowNum, column: 'quantity_sold', issue: 'Quantity sold is required' });
    } else if (!Util.isPositiveInt(row.quantity_sold)) {
      errs.push({ row: rowNum, column: 'quantity_sold',
        issue: 'Quantity sold must be a positive integer. Got: ' + row.quantity_sold });
    }

    return errs;
  }
};
