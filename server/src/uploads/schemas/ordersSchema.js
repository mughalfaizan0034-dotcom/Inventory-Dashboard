import { safeString, parsePositiveInt } from '../core/rowNormalizer.js';

export const ordersSchema = {
  required: ['order_id', 'order_date', 'sku', 'upc', 'quantity_sold', 'platform'],

  buildRow(raw, organizationId, lineNum) {
    if (!raw.order_id?.trim()) {
      return { error: { row: lineNum, field: 'order_id', value: raw.order_id, reason: 'order_id is required' } };
    }
    if (!raw.sku?.trim()) {
      return { error: { row: lineNum, field: 'sku', value: raw.sku, reason: 'sku is required' } };
    }
    if (!raw.order_date?.trim()) {
      return { error: { row: lineNum, field: 'order_date', value: raw.order_date, reason: 'order_date is required' } };
    }

    const qty = parsePositiveInt(raw.quantity_sold, 'quantity_sold', lineNum);
    if (qty.error) return { error: qty.error };

    return {
      row: {
        organization_id:  organizationId,
        order_id:         safeString(raw.order_id),
        order_date:       safeString(raw.order_date),
        sku:              safeString(raw.sku),
        upc:              safeString(raw.upc),
        quantity_sold:    qty.value,
        platform:         safeString(raw.platform) || 'Unknown',
        source_file:      safeString(raw.source_file)      || null,
        shipped_from_box: safeString(raw.shipped_from_box) || null,
        created_at:       new Date().toISOString(),
      },
    };
  },
};
