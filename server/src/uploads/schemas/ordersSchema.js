import { randomUUID } from 'crypto';
import { safeString, parsePositiveInt, normalizeDate } from '../core/rowNormalizer.js';

const VALID_ACTIONS = new Set(['Add', 'Update', 'Remove']);

export const ordersSchema = {
  // No columns are universally required across all action types:
  //   Add    → order_date, sku, quantity_sold, platform
  //   Update → order_id (user-provided key)
  //   Remove → order_id
  // Per-row validation in buildRow handles action-specific requirements.
  required: [],

  buildRow(raw, organizationId, lineNum) {
    const action = raw.action?.trim() || 'Add';
    if (!VALID_ACTIONS.has(action)) {
      return { error: { row: lineNum, field: 'action', reason: `action must be Add, Update, or Remove (got "${action}")` } };
    }

    if (action === 'Remove') {
      const orderId = raw.order_id?.trim();
      if (!orderId) {
        return { error: { row: lineNum, field: 'order_id', reason: 'order_id is required for Remove' } };
      }
      return { action, row: { organization_id: organizationId, order_row_id: orderId } };
    }

    if (action === 'Update') {
      const orderId = raw.order_id?.trim();
      if (!orderId) {
        return { error: { row: lineNum, field: 'order_id', reason: 'order_id is required for Update' } };
      }

      const row = { organization_id: organizationId, order_row_id: orderId };

      if (raw.order_date?.trim()) {
        const orderDate = normalizeDate(raw.order_date);
        if (!orderDate) {
          return { error: { row: lineNum, field: 'order_date', reason: 'order_date could not be parsed — accepted formats: YYYY-MM-DD, M/D/YYYY, MM/DD/YYYY' } };
        }
        row.order_date = orderDate;
      }
      if (raw.sku?.trim())      row.sku      = safeString(raw.sku);
      if (raw.platform?.trim()) row.platform = safeString(raw.platform);
      if (raw.shipped_from_box !== undefined) row.shipped_from_box = safeString(raw.shipped_from_box) || null;

      if (raw.quantity_sold !== undefined && raw.quantity_sold !== '') {
        const qty = parsePositiveInt(raw.quantity_sold, 'quantity_sold', lineNum);
        if (qty.error) return { error: qty.error };
        row.quantity_sold = qty.value;
      }

      return { action, row };
    }

    // Add: all fields required (original behavior)
    if (!raw.order_date?.trim()) {
      return { error: { row: lineNum, field: 'order_date', value: raw.order_date, reason: 'order_date is required' } };
    }
    const orderDate = normalizeDate(raw.order_date);
    if (!orderDate) {
      return { error: { row: lineNum, field: 'order_date', value: raw.order_date, reason: 'order_date could not be parsed — accepted formats: YYYY-MM-DD, M/D/YYYY, MM/DD/YYYY' } };
    }

    if (!raw.sku?.trim()) {
      return { error: { row: lineNum, field: 'sku', value: raw.sku, reason: 'sku is required' } };
    }

    const qty = parsePositiveInt(raw.quantity_sold, 'quantity_sold', lineNum);
    if (qty.error) return { error: qty.error };

    if (!raw.platform?.trim()) {
      return { error: { row: lineNum, field: 'platform', value: raw.platform, reason: 'platform is required' } };
    }

    return {
      action,
      row: {
        order_row_id:     randomUUID(),
        organization_id:  organizationId,
        order_date:       orderDate,
        sku:              safeString(raw.sku),
        quantity_sold:    qty.value,
        platform:         safeString(raw.platform),
        shipped_from_box: safeString(raw.shipped_from_box) || null,
        created_at:       new Date().toISOString(),
      },
    };
  },
};
