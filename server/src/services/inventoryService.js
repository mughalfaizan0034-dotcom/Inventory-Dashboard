export function createInventoryService({ inventoryRepo }) {
  async function list(organizationId, filters) {
    const { items, total } = await inventoryRepo.findAll({ organizationId, ...filters });
    return {
      items,
      total,
      page:     filters.page,
      pageSize: filters.pageSize,
      pages:    Math.ceil(total / filters.pageSize),
    };
  }

  // rowUids is the canonical tracker — SKU is no longer the row key.
  async function deleteRows(organizationId, rowUids) {
    const deleted = await inventoryRepo.deleteByRowUids(organizationId, rowUids);
    return { deleted };
  }

  async function updateRow(organizationId, rowUid, updates) {
    await inventoryRepo.updateRow(organizationId, rowUid, updates);
  }

  async function findAlternatives(organizationId, sku) {
    const { originalBox, originalSku, alternatives } = await inventoryRepo.findAlternativeBoxes(organizationId, sku);
    return {
      originalBox,
      originalSku,
      alternatives,
      inStock:  alternatives.filter(a => a.remaining_stock > 0),
    };
  }

  async function exportAll(organizationId, filters) {
    return inventoryRepo.exportAll({ organizationId, ...filters });
  }

  return { list, exportAll, deleteRows, updateRow, findAlternatives };
}
