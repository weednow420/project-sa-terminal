// ============================================================
//  SA TERMINAL — Backend Entry Point
//  Node.js + Fastify
// ============================================================
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import categoriesRoutes from './routes/categories.js';
import cardsRoutes from './routes/cards.js';
import operatorsRoutes from './routes/operators.js';
import authRoutes from './routes/auth.js';
import messagesRoutes from './routes/messages.js';
import { initDb } from './db/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({ logger: true });

// CORS — разрешаем Telegram WebApp + localhost + ngrok + Hugging Face
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (
      !origin ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      origin.includes('telegram.org') ||
      origin.includes('t.me') ||
      origin.includes('ngrok') ||
      origin.includes('ngrok-free') ||
      origin.includes('hf.space') ||
      origin.includes('huggingface.co')
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning', 'Authorization', 'x-telegram-user-id', 'x-admin-key'],
});

// Отдаём frontend как статику с корня /
await fastify.register(staticFiles, {
  root:   join(__dirname, '..', '..', 'frontend'),
  prefix: '/',
  decorateReply: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
});

// Маршруты API
await fastify.register(categoriesRoutes, { prefix: '/api' });
await fastify.register(cardsRoutes, { prefix: '/api' });
await fastify.register(operatorsRoutes, { prefix: '/api' });
await fastify.register(authRoutes, { prefix: '/api' });
await fastify.register(messagesRoutes, { prefix: '/api' });

// Health check — для мониторинга контура
fastify.get('/api/health', async () => ({
  status: 'ONLINE',
  terminal: 'S-A',
  phase: 1,
  mode: 'READ_ONLY',
  timestamp: new Date().toISOString(),
}));

// Глобальный обработчик ошибок — метка b181
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error({ error_code: 'b181', err: error });
  reply.status(error.statusCode || 500).send({
    status: 'b181',
    error: error.message,
  });
});

// Инициализация БД при старте (sql.js — async WebAssembly)
await initDb();

await fastify.listen({ port: PORT, host: HOST });
console.log(`[TERMINAL] API ONLINE → http://${HOST}:${PORT}/api/health`);
