import { randomUUID } from 'crypto';
import { TABLES } from '../config/tables.js';

export function createActivityRepository({ bq, projectId }) {
  const table   = `\`${projectId}.${TABLES.ACTIVITY_LOG}\``;
  const dataset = bq.dataset('patman_inventory');

  const ICONS = {
    upload_inventory:  '📦',
    upload_orders:     '🛒',
    delete_inventory:  '🗑',
    delete_orders:     '🗑',
    edit_inventory:    '✏️',
    edit_order:        '✏️',
  };

  async function log({ organizationId, userId, actionType, entityType, description }) {
    const row = {
      activity_id:     randomUUID(),
      organization_id: organizationId,
      user_id:         userId || null,
      action_type:     actionType,
      entity_type:     entityType,
      description,
      created_at:      new Date().toISOString(),
    };
    try {
      await dataset.table('activity_log').insert([row]);
    } catch { /* non-fatal — activity log failures must not break main operations */ }
  }

  async function getRecent(organizationId, limit = 10) {
    const safe = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const query = `
      SELECT activity_id, user_id, action_type, entity_type, description, created_at
      FROM ${table}
      WHERE organization_id = @organizationId
      ORDER BY created_at DESC
      LIMIT ${safe}
    `;
    try {
      const [rows] = await bq.query({ query, params: { organizationId } });
      return rows.map(r => ({
        id:          r.activity_id,
        icon:        ICONS[r.action_type] || '📄',
        title:       r.description,
        action_type: r.action_type,
        entity_type: r.entity_type,
        date:        r.created_at?.value ?? r.created_at ?? null,
      }));
    } catch {
      return [];
    }
  }

  return { log, getRecent };
}
