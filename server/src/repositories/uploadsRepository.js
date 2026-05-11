import { TABLES } from '../config/tables.js';

export function createUploadsRepository({ bq, projectId }) {
  const invUploads = `\`${projectId}.${TABLES.INVENTORY_UPLOADS}\``;
  const ordUploads = `\`${projectId}.${TABLES.ORDER_UPLOADS}\``;
  const invTable   = `\`${projectId}.${TABLES.INVENTORY}\``;

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
    const query = `${combined} ORDER BY created_at DESC LIMIT 100`;
    const [rows] = await bq.query({ query, params: { organizationId } });
    return rows;
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

  // Replace full inventory for an org via delete + streaming insert
  async function replaceInventory(organizationId, rows) {
    await bq.query({
      query:  `DELETE FROM ${invTable} WHERE organization_id = @organizationId`,
      params: { organizationId },
    });
    if (rows.length) {
      const dataset = bq.dataset('patman_inventory');
      await dataset.table('inventory').insert(rows);
    }
  }

  return { getHistory, logInventoryUpload, logOrderUpload, replaceInventory };
}
