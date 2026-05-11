import { TABLES } from '../config/tables.js';

export function createInventoryRepository({ bq, projectId }) {
  const table = `\`${projectId}.${TABLES.INVENTORY}\``;

  async function findAll({ organizationId, page, pageSize, search, sortBy, sortDir }) {
    const offset = (page - 1) * pageSize;

    const conditions = ['organization_id = @organizationId'];
    const params     = { organizationId };

    if (search) {
      conditions.push('(LOWER(sku) LIKE @search OR LOWER(upc) LIKE @search OR LOWER(box_number) LIKE @search OR LOWER(part_number) LIKE @search)');
      params.search = `%${search.toLowerCase()}%`;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const allowedSort = ['sku', 'upc', 'box_number', 'quantity', 'date_added'];
    const col = allowedSort.includes(sortBy) ? sortBy : 'date_added';
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const dataQuery = `
      SELECT
        sku, upc, part_number, box_number, quantity, date_added, notes
      FROM ${table}
      ${where}
      ORDER BY ${col} ${dir}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM ${table}
      ${where}
    `;

    const [rows, countRows] = await Promise.all([
      bq.query({ query: dataQuery, params }),
      bq.query({ query: countQuery, params }),
    ]);

    return {
      items: rows[0],
      total: Number(countRows[0][0]?.total ?? 0),
    };
  }

  return { findAll };
}
