import { TABLES } from '../config/tables.js';

export function createInventoryRepository({ bq, projectId }) {
  const invTable = `\`${projectId}.${TABLES.INVENTORY}\``;
  const ordTable = `\`${projectId}.${TABLES.ORDERS}\``;

  async function findAll({ organizationId, page, pageSize, search, sortBy, sortDir }) {
    const offset = (page - 1) * pageSize;

    const conditions = ['i.organization_id = @organizationId'];
    const params     = { organizationId };

    if (search) {
      conditions.push('(LOWER(i.sku) LIKE @search OR LOWER(i.upc) LIKE @search OR LOWER(i.box_number) LIKE @search OR LOWER(i.part_number) LIKE @search)');
      params.search = `%${search.toLowerCase()}%`;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const allowedSort = ['sku', 'upc', 'box_number', 'quantity', 'date_added'];
    const col = allowedSort.includes(sortBy) ? `i.${sortBy}` : 'i.date_added';
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const dataQuery = `
      WITH ord_summary AS (
        SELECT sku, SUM(quantity_sold) AS units_sold
        FROM ${ordTable}
        WHERE organization_id = @organizationId
        GROUP BY sku
      )
      SELECT
        i.sku, i.upc, i.part_number, i.box_number, i.quantity, i.date_added, i.notes,
        COALESCE(o.units_sold, 0) AS units_sold,
        i.quantity - COALESCE(o.units_sold, 0) AS remaining_stock
      FROM ${invTable} i
      LEFT JOIN ord_summary o ON i.sku = o.sku
      ${where}
      ORDER BY ${col} ${dir}
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const countQuery = `SELECT COUNT(*) AS total FROM ${invTable} i ${where}`;

    const [rows, countRows] = await Promise.all([
      bq.query({ query: dataQuery, params }),
      bq.query({ query: countQuery, params }),
    ]);

    return {
      items: rows[0],
      total: Number(countRows[0][0]?.total ?? 0),
    };
  }

  async function deleteBySkus(organizationId, skus) {
    if (!skus?.length) return 0;
    const query = `
      DELETE FROM ${invTable}
      WHERE organization_id = @organizationId AND sku IN UNNEST(@skus)
    `;
    await bq.query({ query, params: { organizationId, skus } });
    return skus.length;
  }

  async function updateRow(organizationId, originalSku, updates) {
    const query = `
      UPDATE ${invTable}
      SET
        sku         = @sku,
        upc         = @upc,
        quantity    = @quantity,
        part_number = @partNumber,
        box_number  = @boxNumber,
        notes       = @notes,
        date_added  = @dateAdded
      WHERE sku = @originalSku AND organization_id = @organizationId
    `;
    await bq.query({
      query,
      params: {
        organizationId,
        originalSku,
        sku:        updates.sku,
        upc:        updates.upc,
        quantity:   updates.quantity,
        partNumber: updates.part_number ?? null,
        boxNumber:  updates.box_number  ?? null,
        notes:      updates.notes       ?? null,
        dateAdded:  updates.date_added  ?? null,
      },
      types: { partNumber: 'STRING', boxNumber: 'STRING', notes: 'STRING', dateAdded: 'STRING' },
    });
  }

  async function findAlternativeBoxes(organizationId, sku) {
    const match = sku?.match(/^ARA\d+-(.+)-(.+)$/);
    if (!match) return [];
    const partNumber = match[1];

    const query = `
      SELECT sku, box_number, part_number, quantity
      FROM ${invTable}
      WHERE organization_id = @organizationId AND part_number = @partNumber
      ORDER BY box_number
    `;
    const [rows] = await bq.query({ query, params: { organizationId, partNumber } });
    return rows;
  }

  return { findAll, deleteBySkus, updateRow, findAlternativeBoxes };
}
