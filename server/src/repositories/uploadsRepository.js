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
        SELECT 'inventory' AS type, upload_id, filename, row_count, status, created_at
        FROM ${invUploads}
        WHERE organization_id = @organizationId
      `);
    }
    if (!type || type === 'orders') {
      queries.push(`
        SELECT 'orders' AS type, upload_id, filename, row_count, status, created_at
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

  async function logInventoryUpload({ uploadId, organizationId, userId, filename, rowCount, status }) {
    const query = `
      INSERT INTO ${invUploads}
        (upload_id, organization_id, user_id, filename, row_count, status, created_at)
      VALUES
        (@uploadId, @organizationId, @userId, @filename, @rowCount, @status, CURRENT_TIMESTAMP())
    `;
    await bq.query({ query, params: { uploadId, organizationId, userId, filename, rowCount, status } });
  }

  async function logOrderUpload({ uploadId, organizationId, userId, filename, rowCount, status }) {
    const query = `
      INSERT INTO ${ordUploads}
        (upload_id, organization_id, user_id, filename, row_count, status, created_at)
      VALUES
        (@uploadId, @organizationId, @userId, @filename, @rowCount, @status, CURRENT_TIMESTAMP())
    `;
    await bq.query({ query, params: { uploadId, organizationId, userId, filename, rowCount, status } });
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

  // Returns a Set of SKUs that already exist for this org (from the given candidate list).
  async function getInventoryKeySet(organizationId, skus) {
    if (!skus.length) return new Set();
    const query = `
      SELECT sku FROM ${invTable}
      WHERE organization_id = @organizationId
        AND sku IN UNNEST(@skus)
    `;
    const [rows] = await bq.query({ query, params: { organizationId, skus } });
    return new Set(rows.map(r => r.sku));
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

  // Partial update of inventory rows — each row may contain a different subset of columns.
  async function updateInventoryBySku(organizationId, rows) {
    for (const row of rows) {
      const sets   = [];
      const params = { organizationId, sku: row.sku };

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
        WHERE organization_id = @organizationId AND sku = @sku
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

  async function deleteInventoryBySkus(organizationId, skus) {
    if (!skus.length) return;
    const query = `
      DELETE FROM ${invTable}
      WHERE organization_id = @organizationId
        AND sku IN UNNEST(@skus)
    `;
    await bq.query({ query, params: { organizationId, skus } });
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
    getHistory, logInventoryUpload, logOrderUpload,
    deleteInventory, insertInventoryBatch, insertOrdersBatch,
    getInventoryKeySet, getOrderKeySet,
    updateInventoryBySku, updateOrdersByOrderId,
    deleteInventoryBySkus, deleteOrdersByOrderIds,
  };
}
