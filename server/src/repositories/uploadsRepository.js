import { TABLES } from '../config/tables.js';

export function createUploadsRepository({ bq, projectId }) {
  const invUploads = `\`${projectId}.${TABLES.INVENTORY_UPLOADS}\``;
  const ordUploads = `\`${projectId}.${TABLES.ORDER_UPLOADS}\``;
  const invTable   = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable   = `\`${projectId}.${TABLES.ORDERS}\``;

  async function getHistory(organizationId, type = '') {
    const queries = [];

    if (!type || type === 'inventory') {
      queries.push(`
        SELECT 'inventory' AS type, upload_id, filename, row_count, status,
               (report IS NOT NULL AND report != '') AS has_report,
               created_at
        FROM ${invUploads}
        WHERE organization_id = @organizationId
      `);
    }
    if (!type || type === 'orders') {
      queries.push(`
        SELECT 'orders' AS type, upload_id, filename, row_count, status,
               (report IS NOT NULL AND report != '') AS has_report,
               created_at
        FROM ${ordUploads}
        WHERE organization_id = @organizationId
      `);
    }

    const combined = queries.join('\nUNION ALL\n');
    const query    = `${combined} ORDER BY created_at DESC LIMIT 100`;
    try {
      const [rows] = await bq.query({ query, params: { organizationId } });
      return rows.map(r => ({
        ...r,
        created_at: r.created_at?.value ?? r.created_at ?? null,
      }));
    } catch {
      // Tables may not exist yet (migration pending). Return empty rather than crashing.
      return [];
    }
  }

  async function logInventoryUpload({ uploadId, organizationId, userId, filename, rowCount, status, report }) {
    const query = `
      INSERT INTO ${invUploads}
        (upload_id, organization_id, user_id, filename, row_count, status, report, created_at)
      VALUES
        (@uploadId, @organizationId, @userId, @filename, @rowCount, @status, @report, CURRENT_TIMESTAMP())
    `;
    await bq.query({
      query,
      params: { uploadId, organizationId, userId, filename, rowCount, status, report: report ?? null },
      types:  { report: 'STRING' },
    });
  }

  async function logOrderUpload({ uploadId, organizationId, userId, filename, rowCount, status, report }) {
    const query = `
      INSERT INTO ${ordUploads}
        (upload_id, organization_id, user_id, filename, row_count, status, report, created_at)
      VALUES
        (@uploadId, @organizationId, @userId, @filename, @rowCount, @status, @report, CURRENT_TIMESTAMP())
    `;
    await bq.query({
      query,
      params: { uploadId, organizationId, userId, filename, rowCount, status, report: report ?? null },
      types:  { report: 'STRING' },
    });
  }

  // Fetch the stored report text for a single upload (admin / member only;
  // route enforces org scoping). Returns null if not found or no report.
  async function getUploadReport(organizationId, uploadId) {
    const query = `
      SELECT report, filename, status, created_at, 'inventory' AS type
      FROM ${invUploads}
      WHERE organization_id = @organizationId AND upload_id = @uploadId
      UNION ALL
      SELECT report, filename, status, created_at, 'orders' AS type
      FROM ${ordUploads}
      WHERE organization_id = @organizationId AND upload_id = @uploadId
      LIMIT 1
    `;
    try {
      const [rows] = await bq.query({ query, params: { organizationId, uploadId } });
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  // Full org inventory delete (legacy — kept for potential future use).
  async function deleteInventory(organizationId) {
    await bq.query({
      query:  `DELETE FROM ${invTable} WHERE organization_id = @organizationId`,
      params: { organizationId },
    });
  }

  async function insertInventoryBatch(rows) {
    if (!rows.length) return;
    const dataset = bq.dataset('patman_inventory');
    await dataset.table('inventory').insert(rows);
  }

  async function insertOrdersBatch(rows) {
    if (!rows.length) return;
    const dataset = bq.dataset('patman_inventory');
    await dataset.table('orders').insert(rows);
  }

  // Returns a Set of row_uids that already exist for this org (from the given candidate list).
  async function getInventoryKeySet(organizationId, rowUids) {
    if (!rowUids.length) return new Set();
    const query = `
      SELECT row_uid FROM ${invTable}
      WHERE organization_id = @organizationId
        AND row_uid IN UNNEST(@rowUids)
    `;
    const [rows] = await bq.query({ query, params: { organizationId, rowUids } });
    return new Set(rows.map(r => r.row_uid));
  }

  // Returns a Set of order_row_ids that already exist for this org.
  async function getOrderKeySet(organizationId, orderIds) {
    if (!orderIds.length) return new Set();
    const query = `
      SELECT order_row_id FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND order_row_id IN UNNEST(@orderIds)
    `;
    const [rows] = await bq.query({ query, params: { organizationId, orderIds } });
    return new Set(rows.map(r => r.order_row_id));
  }

  // Partial update of inventory rows, keyed by row_uid. Each row may contain
  // a different subset of mutable columns (sku is now mutable — only row_uid
  // identifies the row).
  async function updateInventoryByRowUid(organizationId, rows) {
    for (const row of rows) {
      const sets   = [];
      const params = { organizationId, row_uid: row.row_uid };

      if (row.sku         !== undefined) { sets.push('sku = @sku');                   params.sku         = row.sku; }
      if (row.upc         !== undefined) { sets.push('upc = @upc');                   params.upc         = row.upc; }
      if (row.part_number !== undefined) { sets.push('part_number = @part_number');   params.part_number = row.part_number; }
      if (row.box_number  !== undefined) { sets.push('box_number = @box_number');     params.box_number  = row.box_number; }
      if (row.quantity    !== undefined) { sets.push('quantity = @quantity');         params.quantity    = row.quantity; }
      if (row.date_added  !== undefined) { sets.push('date_added = @date_added');     params.date_added  = row.date_added; }
      if (row.notes       !== undefined) { sets.push('notes = @notes');               params.notes       = row.notes; }

      if (!sets.length) continue;
      sets.push('updated_at = @updated_at');
      params.updated_at = row.updated_at ?? new Date().toISOString();

      const query = `
        UPDATE ${invTable}
        SET ${sets.join(', ')}
        WHERE organization_id = @organizationId AND row_uid = @row_uid
      `;
      await bq.query({ query, params });
    }
  }

  // Partial update of order rows — each row may contain a different subset of columns.
  async function updateOrdersByOrderId(organizationId, rows) {
    for (const row of rows) {
      const sets   = [];
      const params = { organizationId, order_row_id: row.order_row_id };

      if (row.order_date      !== undefined) { sets.push('order_date = @order_date');             params.order_date      = row.order_date; }
      if (row.sku             !== undefined) { sets.push('sku = @sku');                           params.sku             = row.sku; }
      if (row.quantity_sold   !== undefined) { sets.push('quantity_sold = @quantity_sold');       params.quantity_sold   = row.quantity_sold; }
      if (row.platform        !== undefined) { sets.push('platform = @platform');                 params.platform        = row.platform; }
      if (row.shipped_from_box !== undefined){ sets.push('shipped_from_box = @shipped_from_box'); params.shipped_from_box = row.shipped_from_box; }

      if (!sets.length) continue;

      const query = `
        UPDATE ${ordTable}
        SET ${sets.join(', ')}
        WHERE organization_id = @organizationId AND order_row_id = @order_row_id
      `;
      await bq.query({ query, params });
    }
  }

  async function deleteInventoryByRowUids(organizationId, rowUids) {
    if (!rowUids.length) return;
    const query = `
      DELETE FROM ${invTable}
      WHERE organization_id = @organizationId
        AND row_uid IN UNNEST(@rowUids)
    `;
    await bq.query({ query, params: { organizationId, rowUids } });
  }

  async function deleteOrdersByOrderIds(organizationId, orderIds) {
    if (!orderIds.length) return;
    const query = `
      DELETE FROM ${ordTable}
      WHERE organization_id = @organizationId
        AND order_row_id IN UNNEST(@orderIds)
    `;
    await bq.query({ query, params: { organizationId, orderIds } });
  }

  return {
    getHistory, logInventoryUpload, logOrderUpload, getUploadReport,
    deleteInventory, insertInventoryBatch, insertOrdersBatch,
    getInventoryKeySet, getOrderKeySet,
    updateInventoryByRowUid, updateOrdersByOrderId,
    deleteInventoryByRowUids, deleteOrdersByOrderIds,
  };
}
