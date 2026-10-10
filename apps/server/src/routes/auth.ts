import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { store } from '../db/store.js';
import type { AuthSession } from '@echo-drift/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'echo-drift-abyss-secret-2026';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { userId?: string; displayName?: string } }>('/auth/anon', async (request, reply) => {
    const { userId, displayName } = request.body || {};
    const user = await store.getOrCreateUser(userId, displayName);

    const token = jwt.sign(
      { userId: user.id, displayName: user.displayName },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const session: AuthSession = {
      userId: user.id,
      displayName: user.displayName,
      token
    };

    return reply.send(session);
  });
};
