import { inventorySchema } from '../schemas/inventorySchema.js';

export const inventoryImporter = {
  type:   'inventory',
  schema: inventorySchema,

  // Full replacement on each upload: delete existing org inventory before first batch.
  async prepare(uploadsRepo, organizationId) {
    await uploadsRepo.deleteInventory(organizationId);
  },

  async insertBatch(uploadsRepo, rows) {
    await uploadsRepo.insertInventoryBatch(rows);
  },

  async logUpload(uploadsRepo, meta) {
    await uploadsRepo.logInventoryUpload(meta);
  },
};
