// ============================================================
//  ROUTES: /api/auth (Проверка ключа доступа / синхронизации)
//  Считывает актуальный 4-значный код из файла access_code.txt
//  Поддерживает общий сброс ключей у всех пользователей
// ============================================================
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, run, queryOne } from '../db/init.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODE_FILE_PATH = join(__dirname, '../../../access_code.txt');

function getAdminIds() {
  const envVal = process.env.ADMIN_TELEGRAM_IDS || '228844325';
  return envVal
    .split(',')
    .map(x => Number(x.trim()))
    .filter(x => !isNaN(x) && x > 0);
}

function isUserAdmin(telegramId) {
  if (!telegramId) return false;
  return getAdminIds().includes(Number(telegramId));
}

function ensureConfigTable(db) {
  db.run(`CREATE TABLE IF NOT EXISTS system_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`);
  const row = queryOne(db, "SELECT value FROM system_config WHERE key = 'auth_version'");
  if (!row) {
    run(db, "INSERT INTO system_config (key, value) VALUES ('auth_version', '1')");
  }
}

function getAuthVersion(db) {
  ensureConfigTable(db);
  const row = queryOne(db, "SELECT value FROM system_config WHERE key = 'auth_version'");
  return row ? Number(row.value) : 1;
}

function bumpAuthVersion(db) {
  ensureConfigTable(db);
  const current = getAuthVersion(db);
  const next = current + 1;
  run(db, "UPDATE system_config SET value = ? WHERE key = 'auth_version'", [String(next)]);
  return next;
}

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
    const db = await getDb();
    const authVersion = getAuthVersion(db);

    if (cleanCode === expectedCode) {
      return {
        status: 'OK',
        authorized: true,
        auth_version: authVersion,
        message: 'СИНХРОНИЗАЦИЯ УСПЕШНА // ДОСТУП РАЗРЕШЕН',
      };
    }

    // При неверном вводе логируем инцидент b181
    try {
      run(
        db,
        `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
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
  // Проверка доступности системы авторизации и текущей версии ключа
  fastify.get('/auth/status', async () => {
    const db = await getDb();
    return {
      status: 'ONLINE',
      auth_mode: 'PIN_GATE_4DIGIT',
      auth_version: getAuthVersion(db),
    };
  });

  // POST /api/auth/reset-all
  // Сбросить ключ у ВСЕХ пользователей (только для Администратора)
  fastify.post('/auth/reset-all', async (request, reply) => {
    const callerId = request.headers['x-telegram-user-id'] || request.body?.telegram_id;
    const adminKey = request.headers['x-admin-key'] || request.body?.admin_key;

    const isAuthorized = isUserAdmin(callerId) || adminKey === 'PROJECT_SA_ADMIN_2026';
    if (!isAuthorized) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
        message: 'Действие сброса доступно исключительно Администратору.',
      });
    }

    const db = await getDb();
    const newVer = bumpAuthVersion(db);

    try {
      run(
        db,
        `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
         VALUES (NULL, 'b181', 'WARN', ?)`,
        [JSON.stringify({ event: 'GLOBAL_AUTH_RESET', by: callerId || 'admin_key', new_version: newVer })]
      );
    } catch (_) {}

    return {
      status: 'OK',
      auth_version: newVer,
      message: 'СИНХРОНИЗАЦИЯ СБРОШЕНА У ВСЕХ ОПЕРАТОРОВ // ТРЕБУЕТСЯ ПОВТОРНЫЙ ВВОД КЛЮЧА',
    };
  });
}
