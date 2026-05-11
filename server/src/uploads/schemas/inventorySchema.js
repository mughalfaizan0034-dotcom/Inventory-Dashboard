import { safeString, parsePositiveInt, normalizeDate } from '../core/rowNormalizer.js';

export const inventorySchema = {
  required: ['sku', 'upc', 'quantity', 'part_number', 'box_number', 'date_added'],

  buildRow(raw, organizationId, lineNum) {
    if (!raw.sku?.trim()) {
      return { error: { row: lineNum, field: 'sku', value: raw.sku, reason: 'sku is required' } };
    }
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

    const dateAdded = normalizeDate(raw.date_added);

    return {
      row: {
        organization_id: organizationId,
        sku:         safeString(raw.sku),
        upc:         safeString(raw.upc),
        part_number: safeString(raw.part_number),
        box_number:  safeString(raw.box_number),
        quantity:    qty.value,
        date_added:  dateAdded,
        notes:       safeString(raw.notes) || null,
        updated_at:  new Date().toISOString(),
      },
    };
  },
};
