import { inventorySchema } from '../schemas/inventorySchema.js';

export const inventoryImporter = {
  type:     'inventory',
  schema:   inventorySchema,
  keyField: 'row_uid',

  getKey(row) {
    return row.row_uid;
  },

  async fetchKeySet(uploadsRepo, organizationId, keys) {
    return uploadsRepo.getInventoryKeySet(organizationId, keys);
  },

  async addBatch(uploadsRepo, rows) {
    await uploadsRepo.insertInventoryBatch(rows);
  },

  async updateBatch(uploadsRepo, organizationId, rows) {
    await uploadsRepo.updateInventoryByRowUid(organizationId, rows);
  },

  async removeBatch(uploadsRepo, organizationId, keys) {
    await uploadsRepo.deleteInventoryByRowUids(organizationId, keys);
  },

  async logUpload(uploadsRepo, meta) {
    await uploadsRepo.logInventoryUpload(meta);
  },
};
