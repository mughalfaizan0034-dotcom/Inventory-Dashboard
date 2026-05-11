import { authenticate } from '../middleware/authenticate.js';
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

const ordersQuerySchema = z.object({
  page:       positiveInt.optional().default(1),
  pageSize:   positiveInt.max(200).optional().default(50),
  platform:   z.string().optional(),
  start_date: z.string().optional(),
  end_date:   z.string().optional(),
  search:     z.string().optional(),
});

const deleteFiltersSchema = z.object({
  platform:   z.string().optional(),
  start_date: z.string().optional(),
  end_date:   z.string().optional(),
  search:     z.string().optional(),
});

const deleteBodySchema = z.object({
  row_ids: z.array(z.string()).min(1).optional(),
  filters: deleteFiltersSchema.optional(),
}).refine(
  data => (data.row_ids?.length > 0) || (data.filters && Object.values(data.filters).some(v => v)),
  { message: 'Provide row_ids or at least one filter criterion' }
);

export async function ordersRoutes(fastify, { ordersService }) {
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = ordersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid query parameters' });
    }

    const { page, pageSize, platform, start_date, end_date, search } = parsed.data;
    try {
      const data = await ordersService.list(request.user.organization_id, {
        page, pageSize,
        platform:  platform  || null,
        startDate: start_date || null,
        endDate:   end_date   || null,
        search:    search     || null,
      });
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Orders list error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.get('/platforms', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await ordersService.getPlatforms(request.user.organization_id);
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Platforms error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.delete('/rows', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = deleteBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || 'Invalid request body';
      return reply.code(400).send({ success: false, error: msg });
    }

    const { row_ids, filters } = parsed.data;
    try {
      const data = await ordersService.deleteRows(request.user.organization_id, {
        rowIds:  row_ids || null,
        filters: filters ? {
          platform:  filters.platform  || null,
          startDate: filters.start_date || null,
          endDate:   filters.end_date   || null,
          search:    filters.search     || null,
        } : null,
      });
      return reply.send({ success: true, data });
    } catch (err) {
      if (err.code === 400) return reply.code(400).send({ success: false, error: err.message });
      request.log.error({ err }, 'Orders delete error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });
}
