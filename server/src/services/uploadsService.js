import { randomUUID } from 'crypto';
import { parseCsv } from '../utils/csv.js';
import { AppError } from '../utils/errors.js';

const REQUIRED_INVENTORY_COLS = ['sku'];
const REQUIRED_ORDER_COLS     = ['order_id', 'sku', 'quantity'];

export function createUploadsService({ uploadsRepo, ordersRepo }) {
  async function processInventoryUpload(organizationId, userId, csvText, filename) {
    const { headers, rows } = parseCsv(csvText);

    const missing = REQUIRED_INVENTORY_COLS.filter(c => !headers.includes(c));
    if (missing.length) {
      throw new AppError(400, `CSV missing required columns: ${missing.join(', ')}`);
    }

    const now = new Date().toISOString();
    const mapped = rows
      .filter(r => r.sku?.trim())
      .map(r => ({
        organization_id: organizationId,
        sku:             r.sku.trim().toUpperCase(),
        name:            r.name?.trim()            || r.sku.trim().toUpperCase(),
        platform:        r.platform?.trim()        || 'Unknown',
        is_active:       r.is_active?.toLowerCase() !== 'false',
        initial_stock:   parseInt(r.initial_stock  ?? r.stock ?? 0, 10) || 0,
        units_sold:      parseInt(r.units_sold      ?? 0, 10) || 0,
        units_returned:  parseInt(r.units_returned  ?? 0, 10) || 0,
        updated_at:      now,
      }));

    if (!mapped.length) throw new AppError(400, 'No valid rows found in CSV');

    const uploadId = randomUUID();
    await uploadsRepo.replaceInventory(organizationId, mapped);
    await uploadsRepo.logInventoryUpload({
      uploadId, organizationId, userId,
      filename: filename || 'inventory.csv',
      rowCount: mapped.length,
      status:   'success',
    }).catch(() => {}); // logging failure must not fail the upload

    return { upload_id: uploadId, inserted: mapped.length, filename };
  }

  async function processOrdersUpload(organizationId, userId, csvText, filename) {
    const { headers, rows } = parseCsv(csvText);

    const missing = REQUIRED_ORDER_COLS.filter(c => !headers.includes(c));
    if (missing.length) {
      throw new AppError(400, `CSV missing required columns: ${missing.join(', ')}`);
    }

    const mapped = rows
      .filter(r => r.order_id?.trim() && r.sku?.trim())
      .map(r => ({
        organization_id: organizationId,
        order_id:    r.order_id.trim(),
        platform:    r.platform?.trim()    || 'Unknown',
        sku:         r.sku.trim().toUpperCase(),
        quantity:    parseInt(r.quantity   ?? 1, 10) || 1,
        revenue:     parseFloat(r.revenue  ?? r.price ?? 0) || 0,
        order_date:  r.order_date?.trim()  || new Date().toISOString().slice(0, 10),
        created_at:  new Date().toISOString(),
      }));

    if (!mapped.length) throw new AppError(400, 'No valid rows found in CSV');

    const uploadId = randomUUID();
    await ordersRepo.insertRows(mapped);
    await uploadsRepo.logOrderUpload({
      uploadId, organizationId, userId,
      filename: filename || 'orders.csv',
      rowCount: mapped.length,
      status:   'success',
    }).catch(() => {});

    return { upload_id: uploadId, inserted: mapped.length, filename };
  }

  async function getHistory(organizationId, type) {
    return uploadsRepo.getHistory(organizationId, type);
  }

  return { processInventoryUpload, processOrdersUpload, getHistory };
}
