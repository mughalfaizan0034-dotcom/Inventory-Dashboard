import { safeString, parsePositiveInt } from '../core/rowNormalizer.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ordersSchema = {
  required: ['order_date', 'sku', 'quantity_sold', 'shipped_from_box', 'platform'],

  buildRow(raw, organizationId, lineNum) {
    const orderDate = safeString(raw.order_date);
    if (!orderDate) {
      return { error: { row: lineNum, field: 'order_date', value: raw.order_date, reason: 'order_date is required' } };
    }
    if (!ISO_DATE_RE.test(orderDate) || isNaN(new Date(orderDate).getTime())) {
      return { error: { row: lineNum, field: 'order_date', value: raw.order_date, reason: 'order_date must be a valid date in YYYY-MM-DD format' } };
    }

    if (!raw.sku?.trim()) {
      return { error: { row: lineNum, field: 'sku', value: raw.sku, reason: 'sku is required' } };
    }

    const qty = parsePositiveInt(raw.quantity_sold, 'quantity_sold', lineNum);
    if (qty.error) return { error: qty.error };

    if (!raw.shipped_from_box?.trim()) {
      return { error: { row: lineNum, field: 'shipped_from_box', value: raw.shipped_from_box, reason: 'shipped_from_box is required' } };
    }

    if (!raw.platform?.trim()) {
      return { error: { row: lineNum, field: 'platform', value: raw.platform, reason: 'platform is required' } };
    }

    return {
      row: {
        organization_id:  organizationId,
        order_date:       orderDate,
        sku:              safeString(raw.sku),
        quantity_sold:    qty.value,
        shipped_from_box: safeString(raw.shipped_from_box),
        platform:         safeString(raw.platform),
        created_at:       new Date().toISOString(),
      },
    };
  },
};
