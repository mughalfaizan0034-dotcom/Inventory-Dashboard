import { safeString, parsePositiveInt } from '../core/rowNormalizer.js';

export const inventorySchema = {
  required: ['sku', 'upc', 'quantity'],

  buildRow(raw, organizationId, lineNum) {
    if (!raw.sku?.trim()) {
      return { error: { row: lineNum, field: 'sku', value: raw.sku, reason: 'sku is required' } };
    }
    if (!raw.upc?.trim()) {
      return { error: { row: lineNum, field: 'upc', value: raw.upc, reason: 'upc is required' } };
    }

    const qty = parsePositiveInt(raw.quantity, 'quantity', lineNum);
    if (qty.error) return { error: qty.error };

    const dateAdded = safeString(raw.date_added) || null;
    if (dateAdded && isNaN(new Date(dateAdded).getTime())) {
      return { error: { row: lineNum, field: 'date_added', value: raw.date_added, reason: 'date_added has an invalid format (expected YYYY-MM-DD)' } };
    }

    return {
      row: {
        organization_id: organizationId,
        sku:         safeString(raw.sku),
        upc:         safeString(raw.upc),
        part_number: safeString(raw.part_number) || null,
        box_number:  safeString(raw.box_number)  || null,
        quantity:    qty.value,
        date_added:  dateAdded,
        notes:       safeString(raw.notes)       || null,
        updated_at:  new Date().toISOString(),
      },
    };
  },
};
