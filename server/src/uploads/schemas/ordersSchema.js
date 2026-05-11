import { randomUUID } from 'crypto';
import { safeString, parsePositiveInt, normalizeDate } from '../core/rowNormalizer.js';

export const ordersSchema = {
  required: ['order_date', 'sku', 'quantity_sold', 'platform'],

  buildRow(raw, organizationId, lineNum) {
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

    const shippedFromBox = safeString(raw.shipped_from_box);

    return {
      row: {
        order_row_id:     randomUUID(),
        organization_id:  organizationId,
        order_date:       orderDate,
        sku:              safeString(raw.sku),
        quantity_sold:    qty.value,
        platform:         safeString(raw.platform),
        shipped_from_box: shippedFromBox || null,
        created_at:       new Date().toISOString(),
      },
    };
  },
};
