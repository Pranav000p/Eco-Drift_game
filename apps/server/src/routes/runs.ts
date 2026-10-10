import type { FastifyPluginAsync } from 'fastify';
import { store } from '../db/store.js';
import { validateRunSubmission } from '../validation/runValidator.js';
import type { RunSubmission, GameMode } from '@echo-drift/shared';

export const runRoutes: FastifyPluginAsync = async (fastify) => {
  // Submit a completed run
  fastify.post<{ Body: RunSubmission }>('/runs', async (request, reply) => {
    const submission = request.body;
    if (!submission) {
      return reply.code(400).send({ error: 'Missing run payload' });
    }

    const validation = validateRunSubmission(submission);
    if (!validation.valid) {
      return reply.code(422).send({
        error: 'Run rejected by anti-cheat verification',
        reason: validation.reason
      });
    }

    const savedRun = await store.recordRun(submission);
    return reply.code(201).send({
      success: true,
      runId: savedRun.id,
      score: savedRun.score,
      rank: savedRun.rank,
      totalRuns: savedRun.totalRuns
    });
  });

  // Get leaderboard
  fastify.get<{
    Querystring: { mode?: string; seed?: string; limit?: string; order?: 'desc' | 'asc' }
  }>('/leaderboard', async (request, reply) => {
    const mode = request.query.mode || 'all';
    const seed = request.query.seed || '';
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const order = request.query.order === 'asc' ? 'asc' : 'desc';

    const result = await store.getLeaderboard(mode, seed, limit, order);
    return reply.send({
      mode,
      seed,
      order,
      total: result.total,
      bestScore: result.bestScore,
      worstScore: result.worstScore,
      entries: result.entries
    });
  });

  // Get top ghosts for a seed
  fastify.get<{
    Params: { seed: string }
  }>('/ghosts/:seed', async (request, reply) => {
    const { seed } = request.params;
    const ghosts = await store.getTopGhosts(seed, 3);
    return reply.send({ seed, ghosts });
  });
};
