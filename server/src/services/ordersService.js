export function createOrdersService({ ordersRepo }) {
  async function list(organizationId, filters) {
    const { items, total } = await ordersRepo.findAll({ organizationId, ...filters });
    return {
      items,
      total,
      page:     filters.page,
      pageSize: filters.pageSize,
      pages:    Math.ceil(total / filters.pageSize),
    };
  }

  async function getPlatforms(organizationId) {
    return ordersRepo.getPlatforms(organizationId);
  }

  return { list, getPlatforms };
}
