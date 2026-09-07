// ============================================================
//  ROUTES: /api/auth (Проверка ключа доступа / синхронизации)
//  Считывает актуальный 4-значный код из файла access_code.txt
// ============================================================
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, run } from '../db/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODE_FILE_PATH = join(__dirname, '../../../access_code.txt');

function getExpectedCode() {
  try {
    if (existsSync(CODE_FILE_PATH)) {
      const content = readFileSync(CODE_FILE_PATH, 'utf8').trim();
      if (content) {
        // Извлекаем первые 4 цифры
        const match = content.match(/\d{4}/);
        if (match) return match[0];
        return content.substring(0, 4);
      }
    }
  } catch (err) {
    console.warn('[AUTH] Не удалось прочитать access_code.txt:', err.message);
  }
  return process.env.ACCESS_CODE || '1234';
}

export default async function authRoutes(fastify) {

  // POST /api/auth/verify
  // Проверка введенного 4-значного кода
  fastify.post('/auth/verify', async (request, reply) => {
    const { code, telegram_id } = request.body || {};

    if (!code || typeof code !== 'string') {
      return reply.status(400).send({
        status: 'b181',
        error: 'CODE_REQUIRED',
        message: 'Требуется ввод ключа синхронизации.',
      });
    }

    const expectedCode = getExpectedCode();
    const cleanCode = code.trim();

    if (cleanCode === expectedCode) {
      return {
        status: 'OK',
        authorized: true,
        message: 'СИНХРОНИЗАЦИЯ УСПЕШНА // ДОСТУП РАЗРЕШЕН',
      };
    }

    // При неверном вводе логируем инцидент b181
    try {
      const db = await getDb();
      run(
        db,
        `INSERT INTO incident_log (operator_number, error_code, severity, context_json)
         VALUES (NULL, 'b181', 'WARN', ?)`,
        [JSON.stringify({ reason: 'INVALID_ACCESS_CODE', tid: telegram_id || null })]
      );
    } catch (_) {}

    return reply.status(403).send({
      status: 'b181',
      error: 'INVALID_CODE',
      message: 'КЛЮЧ ДОСТУПА НЕ ВЕРЕН // b181',
    });
  });

  // GET /api/auth/status
  // Проверка доступности системы авторизации
  fastify.get('/auth/status', async () => ({
    status: 'ONLINE',
    auth_mode: 'PIN_GATE_4DIGIT',
  }));
}
