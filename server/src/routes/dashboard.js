import { authenticate } from '../middleware/authenticate.js';

export async function dashboardRoutes(fastify, { dashboardService }) {
  fastify.get('/kpis', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await dashboardService.getKPIs(request.user.organization_id);
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Dashboard KPIs error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.get('/performance', { preHandler: [authenticate] }, async (request, reply) => {
    const weeks = Math.min(Math.max(parseInt(request.query.weeks, 10) || 12, 1), 52);
    try {
      const data = await dashboardService.getPerformance(request.user.organization_id, weeks);
      return reply.send({ success: true, data });
    } catch (err) {
      request.log.error({ err }, 'Dashboard performance error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });
}
