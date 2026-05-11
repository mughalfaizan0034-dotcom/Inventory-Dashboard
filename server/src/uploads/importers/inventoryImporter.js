import { inventorySchema } from '../schemas/inventorySchema.js';

export const inventoryImporter = {
  type:     'inventory',
  schema:   inventorySchema,
  keyField: 'sku',

  getKey(row) {
    return row.sku;
  },

  async fetchKeySet(uploadsRepo, organizationId, keys) {
    return uploadsRepo.getInventoryKeySet(organizationId, keys);
  },

  async addBatch(uploadsRepo, rows) {
    await uploadsRepo.insertInventoryBatch(rows);
  },

  async updateBatch(uploadsRepo, organizationId, rows) {
    await uploadsRepo.updateInventoryBySku(organizationId, rows);
  },

  async removeBatch(uploadsRepo, organizationId, keys) {
    await uploadsRepo.deleteInventoryBySkus(organizationId, keys);
  },

  async logUpload(uploadsRepo, meta) {
    await uploadsRepo.logInventoryUpload(meta);
  },
};
