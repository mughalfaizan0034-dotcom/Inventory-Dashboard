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

  async function deleteRows(organizationId, skus) {
    const deleted = await inventoryRepo.deleteBySkus(organizationId, skus);
    return { deleted };
  }

  async function updateRow(organizationId, originalSku, updates) {
    await inventoryRepo.updateRow(organizationId, originalSku, updates);
  }

  async function findAlternatives(organizationId, sku) {
    return inventoryRepo.findAlternativeBoxes(organizationId, sku);
  }

  return { list, deleteRows, updateRow, findAlternatives };
}
