import type { FastifyPluginAsync } from 'fastify';
import { getUtcDailySeed, type DailySeedResponse } from '@echo-drift/shared';

export const dailyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/daily-seed', async (_request, reply) => {
    const now = new Date();
    const seed = getUtcDailySeed(now);

    // Calculate midnight UTC
    const midnightUtc = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));

    const remainingMs = midnightUtc.getTime() - now.getTime();

    const response: DailySeedResponse = {
      seed,
      date: now.toISOString().slice(0, 10),
      expiresAt: midnightUtc.toISOString(),
      remainingMs
    };

    return reply.send(response);
  });
};
