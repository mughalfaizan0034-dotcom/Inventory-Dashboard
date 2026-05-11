import { loginBodySchema, refreshBodySchema } from '../validation/authSchemas.js';
import { AppError } from '../utils/errors.js';

export async function authRoutes(fastify, { authService, usersRepo, tokenFactory }) {
  fastify.post('/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error:   'Invalid request body',
        details: parsed.error.flatten(),
      });
    }

    const { username, password } = parsed.data;

    try {
      const user = await authService.login(username, password);
      const accessToken  = tokenFactory.signAccessToken(user);
      const refreshToken = tokenFactory.signRefreshToken(user);

      request.log.info(
        { event: 'login_success', user_id: user.user_id, organization_id: user.organization_id, role: user.role },
        'User authenticated'
      );

      return reply.send({
        success: true,
        data: {
          access_token:  accessToken,
          refresh_token: refreshToken,
          user: {
            user_id:         user.user_id,
            organization_id: user.organization_id,
            username:        user.username,
            display_name:    user.display_name,
            role:            user.role,
          },
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        request.log.warn(
          { event: 'login_failure', username, ip: request.ip },
          'Authentication failed'
        );
        return reply.code(err.statusCode).send({ success: false, error: err.message });
      }
      request.log.error({ err }, 'Login error');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  fastify.post('/refresh', async (request, reply) => {
    const parsed = refreshBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body' });
    }

    try {
      const payload = await fastify.jwt.verify(parsed.data.refresh_token);
      if (payload.type !== 'refresh') {
        return reply.code(401).send({ success: false, error: 'Invalid token type' });
      }

      const user = await usersRepo.findById(payload.user_id);
      if (!user || !user.is_active) {
        request.log.warn(
          { event: 'refresh_failure', user_id: payload.user_id, reason: 'account_inactive' },
          'Refresh rejected — account inactive or not found'
        );
        return reply.code(401).send({ success: false, error: 'Account inactive or not found' });
      }

      const accessToken     = tokenFactory.signAccessToken({
        user_id:         user.user_id,
        organization_id: user.organization_id,
        username:        user.username,
        display_name:    user.display_name,
        role:            user.role,
      });
      const newRefreshToken = tokenFactory.signRefreshToken(user);

      request.log.info(
        { event: 'token_refresh', user_id: user.user_id, organization_id: user.organization_id },
        'Refresh token rotated'
      );

      return reply.send({ success: true, data: { access_token: accessToken, refresh_token: newRefreshToken } });
    } catch {
      request.log.warn({ event: 'refresh_failure', reason: 'invalid_token' }, 'Refresh token invalid or expired');
      return reply.code(401).send({ success: false, error: 'Refresh token invalid or expired' });
    }
  });
}
