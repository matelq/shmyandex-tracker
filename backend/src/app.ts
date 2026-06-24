import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

import './types.js';
import authRoutes from './routes/auth.js';
import cardRoutes from './routes/cards.js';
import statusRoutes from './routes/statuses.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AppOptions {
  jwtSecret?: string;
  serveFrontend?: boolean;
  logger?: boolean;
}

export async function buildApp(
  db: Database.Database,
  opts: AppOptions = {}
): Promise<FastifyInstance> {
  const {
    jwtSecret = 'dev-secret-change-me-in-production',
    serveFrontend = true,
    logger = false,
  } = opts;

  const fastify = Fastify({ logger });

  await fastify.register(cors, { origin: true });
  await fastify.register(jwt, { secret: jwtSecret });

  fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Требуется авторизация' });
    }
  });

  await fastify.register(authRoutes, { db });
  await fastify.register(cardRoutes, { db });
  await fastify.register(statusRoutes, { db });

  fastify.get('/api/health', async () => ({ status: 'ok' }));

  if (serveFrontend) {
    const frontendDist = join(__dirname, '..', '..', 'frontend', 'dist');
    if (existsSync(frontendDist)) {
      await fastify.register(fastifyStatic, { root: frontendDist });

      fastify.setNotFoundHandler((request, reply) => {
        if (request.raw.url?.startsWith('/api/')) {
          return reply.code(404).send({ error: 'Not found' });
        }
        return reply.sendFile('index.html');
      });
    }
  }

  return fastify;
}
