import { safeString, parsePositiveInt, normalizeDate } from '../core/rowNormalizer.js';

const VALID_ACTIONS = new Set(['Add', 'Update', 'Remove']);

export const inventorySchema = {
  // Only 'sku' is universally required across all action types.
  // Action-specific required fields are validated in buildRow.
  required: ['sku'],

  buildRow(raw, organizationId, lineNum) {
    const action = raw.action?.trim() || 'Add';
    if (!VALID_ACTIONS.has(action)) {
      return { error: { row: lineNum, field: 'action', reason: `action must be Add, Update, or Remove (got "${action}")` } };
    }

    const sku = raw.sku?.trim();
    if (!sku) {
      return { error: { row: lineNum, field: 'sku', reason: 'sku is required' } };
    }

    if (action === 'Remove') {
      return { action, row: { organization_id: organizationId, sku } };
    }

    if (action === 'Update') {
      const row = { organization_id: organizationId, sku, updated_at: new Date().toISOString() };

      if (raw.upc?.trim())         row.upc         = safeString(raw.upc);
      if (raw.part_number?.trim()) row.part_number  = safeString(raw.part_number);
      if (raw.box_number?.trim())  row.box_number   = safeString(raw.box_number);
      if (raw.date_added?.trim())  row.date_added   = normalizeDate(raw.date_added);
      if (raw.notes !== undefined && raw.notes !== '') row.notes = safeString(raw.notes) || null;

      if (raw.quantity !== undefined && raw.quantity !== '') {
        const qty = parsePositiveInt(raw.quantity, 'quantity', lineNum);
        if (qty.error) return { error: qty.error };
        row.quantity = qty.value;
      }

      return { action, row };
    }

    // Add: all fields required
    if (!raw.upc?.trim()) {
      return { error: { row: lineNum, field: 'upc', value: raw.upc, reason: 'upc is required' } };
    }
    if (!raw.part_number?.trim()) {
      return { error: { row: lineNum, field: 'part_number', value: raw.part_number, reason: 'part_number is required' } };
    }
    if (!raw.box_number?.trim()) {
      return { error: { row: lineNum, field: 'box_number', value: raw.box_number, reason: 'box_number is required' } };
    }
    if (!raw.date_added?.trim()) {
      return { error: { row: lineNum, field: 'date_added', value: raw.date_added, reason: 'date_added is required' } };
    }

    const qty = parsePositiveInt(raw.quantity, 'quantity', lineNum);
    if (qty.error) return { error: qty.error };

    return {
      action,
      row: {
        organization_id: organizationId,
        sku:         safeString(raw.sku),
        upc:         safeString(raw.upc),
        part_number: safeString(raw.part_number),
        box_number:  safeString(raw.box_number),
        quantity:    qty.value,
        date_added:  normalizeDate(raw.date_added),
        notes:       safeString(raw.notes) || null,
        updated_at:  new Date().toISOString(),
      },
    };
  },
};
