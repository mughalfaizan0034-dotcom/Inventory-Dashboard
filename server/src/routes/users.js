import { authenticate, requireRole } from '../middleware/authenticate.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const createUserSchema = z.object({
  display_name: z.string().min(1).max(100),
  email:        z.string().email().optional(),
  username:     z.string().min(2).max(32).optional(),
  password:     z.string().min(8),
  role:         z.enum(['admin', 'manager', 'operator', 'viewer']).optional().default('viewer'),
});

const updateUserSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  role:         z.enum(['admin', 'manager', 'operator', 'viewer']).optional(),
  is_active:    z.boolean().optional(),
});

export async function usersRoutes(fastify, { usersService }) {
  fastify.get('/', { preHandler: [authenticate, requireRole('manager')] }, async (request, reply) => {
    try {
      const data = await usersService.list(request.user.organization_id);
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Users list error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.post('/', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body', details: parsed.error.flatten() });
    }
    try {
      const data = await usersService.create(request.user.organization_id, parsed.data);
      request.log.info({ event: 'user_created', new_user_id: data.user_id, by: request.user.user_id }, 'User created');
      return reply.code(201).send({ success: true, data });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message });
      }
      request.log.error({ err }, 'User create error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.patch('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body' });
    }
    try {
      await usersService.update(request.params.id, request.user.organization_id, parsed.data);
      request.log.info({ event: 'user_updated', target_user_id: request.params.id, by: request.user.user_id }, 'User updated');
      return reply.send({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message });
      }
      request.log.error({ err }, 'User update error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.delete('/:id', { preHandler: [authenticate, requireRole('admin')] }, async (request, reply) => {
    try {
      await usersService.deactivate(request.params.id, request.user.organization_id, request.user.user_id);
      request.log.info({ event: 'user_deactivated', target_user_id: request.params.id, by: request.user.user_id }, 'User deactivated');
      return reply.send({ success: true });
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ success: false, error: err.message });
      }
      request.log.error({ err }, 'User delete error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });
}
