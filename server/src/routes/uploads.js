import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authenticate.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const uploadBodySchema = z.object({
  csvText:  z.string().min(1),
  filename: z.string().optional(),
});

export async function uploadsRoutes(fastify, { uploadsService }) {
  fastify.post(
    '/inventory',
    { preHandler: [authenticate, requireRole('manager')] },
    async (request, reply) => {
      const parsed = uploadBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: 'csvText is required' });
      }

      try {
        const { organization_id, user_id } = request.user;
        const { csvText, filename } = parsed.data;
        const result = await uploadsService.processInventoryUpload(organization_id, user_id, csvText, filename);

        request.log.info(
          { event: 'inventory_upload', user_id, organization_id, rows: result.inserted },
          'Inventory uploaded'
        );
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send({ success: false, error: err.message });
        }
        request.log.error({ err }, 'Inventory upload error');
        return reply.code(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  fastify.post(
    '/orders',
    { preHandler: [authenticate, requireRole('manager')] },
    async (request, reply) => {
      const parsed = uploadBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: 'csvText is required' });
      }

      try {
        const { organization_id, user_id } = request.user;
        const { csvText, filename } = parsed.data;
        const result = await uploadsService.processOrdersUpload(organization_id, user_id, csvText, filename);

        request.log.info(
          { event: 'orders_upload', user_id, organization_id, rows: result.inserted },
          'Orders uploaded'
        );
        return reply.send({ success: true, data: result });
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send({ success: false, error: err.message });
        }
        request.log.error({ err }, 'Orders upload error');
        return reply.code(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  fastify.get('/history', { preHandler: [authenticate] }, async (request, reply) => {
    const type = ['inventory', 'orders', ''].includes(request.query.type ?? '')
      ? (request.query.type ?? '')
      : '';
    try {
      const data = await uploadsService.getHistory(request.user.organization_id, type);
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Upload history error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });
}
