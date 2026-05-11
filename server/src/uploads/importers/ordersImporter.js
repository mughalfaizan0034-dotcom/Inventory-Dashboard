import { ordersSchema } from '../schemas/ordersSchema.js';

export const ordersImporter = {
  type:   'orders',
  schema: ordersSchema,

  // Append mode: orders are cumulative, no pre-delete.
  async prepare(_uploadsRepo, _organizationId) {},

  async insertBatch(uploadsRepo, rows) {
    await uploadsRepo.insertOrdersBatch(rows);
  },

  async logUpload(uploadsRepo, meta) {
    await uploadsRepo.logOrderUpload(meta);
  },
};
