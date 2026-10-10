import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocketPlugin from '@fastify/websocket';
import { authRoutes } from './routes/auth.js';
import { dailyRoutes } from './routes/daily.js';
import { runRoutes } from './routes/runs.js';
import { ghostHub } from './ws/ghostRelay.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  const server = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }
  });

  // Enable CORS for client apps
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS']
  });

  // Register WebSocket
  await server.register(websocketPlugin);

  // Health check
  server.get('/health', async () => ({
    status: 'ok',
    game: 'Echo Drift',
    timestamp: new Date().toISOString()
  }));

  // REST API routes
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(dailyRoutes, { prefix: '/api' });
  await server.register(runRoutes, { prefix: '/api' });

  // WebSocket route for live ghosts
  server.register(async function (fastify) {
    fastify.get('/ws/ghosts/:seed', { websocket: true }, (socket, req) => {
      const { seed } = (req.params as { seed: string }) || { seed: 'default' };
      ghostHub.register(socket, seed);
    });
  });

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`\n========================================`);
    console.log(`  ECHO DRIFT API Server active at:`);
    console.log(`  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`========================================\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

bootstrap();
