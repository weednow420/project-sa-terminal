// ============================================================
//  ROUTES: /api/auth (Проверка ключа доступа / синхронизации)
//  Считывает актуальный 4-значный код из файла access_code.txt
//  Поддерживает общий сброс ключей у всех пользователей
// ============================================================
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, run, queryOne, persistDb } from '../db/init.js';
import {
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinRateLimit,
  isUserAdminVerified
} from '../utils/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODE_FILE_PATH = join(__dirname, '../../../access_code.txt');


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

    const clientIp = request.ip || 'unknown';
    const limiterKey = `${clientIp}_${telegram_id || ''}`;
    const limitCheck = checkPinRateLimit(limiterKey);
    if (limitCheck.limited) {
      return reply.status(429).send({
        status: 'b181',
        error: 'TOO_MANY_ATTEMPTS',
        message: `Слишком много попыток ввода. Доступ временно заблокирован на ${limitCheck.remainingSec} сек.`,
      });
    }

    const expectedCode = getExpectedCode();
    const cleanCode = code.trim();
    const db = await getDb();
    const authVersion = getAuthVersion(db);

    if (cleanCode === expectedCode) {
      resetPinRateLimit(limiterKey);
      if (telegram_id) {
        try {
          run(
            db,
            `UPDATE operators
             SET auth_revoked = 0,
                 auth_version = ?
             WHERE telegram_id = ?`,
            [authVersion, Number(telegram_id)]
          );
          persistDb();
        } catch (_) {}
      }

      return {
        status: 'OK',
        authorized: true,
        auth_version: authVersion,
        message: 'СИНХРОНИЗАЦИЯ УСПЕШНА // ДОСТУП РАЗРЕШЕН',
      };
    }

    const record = recordFailedPinAttempt(limiterKey);

    // При неверном вводе логируем инцидент b181
    try {
      run(
        db,
        `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
         VALUES (NULL, 'b181', 'WARN', ?)`,
        [JSON.stringify({ reason: 'INVALID_ACCESS_CODE', tid: telegram_id || null })]
      );
    } catch (_) {}

    if (record && record.lockedUntil && record.lockedUntil > Date.now()) {
      return reply.status(429).send({
        status: 'b181',
        error: 'TOO_MANY_ATTEMPTS',
        message: 'ПРЕВЫШЕН ЛИМИТ ПОПЫТОК // ДОСТУП ЗАБЛОКИРОВАН НА 5 МИН',
      });
    }

    const remaining = Math.max(0, 5 - (record ? record.count : 1));
    return reply.status(403).send({
      status: 'b181',
      error: 'INVALID_CODE',
      remaining_attempts: remaining,
      message: `КЛЮЧ ДОСТУПА НЕ ВЕРЕН // b181 (ОСТАЛОСЬ ПОПЫТОК: ${remaining})`,
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

  // GET /api/auth/current-code (ТОЛЬКО АДМИН)
  fastify.get('/auth/current-code', async (request, reply) => {
    const db = await getDb();

    if (!isUserAdminVerified(request, db)) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
        message: 'Доступ к ключу контура доступен исключительно верифицированному Администратору.',
      });
    }

    return {
      status: 'OK',
      current_code: getExpectedCode(),
      auth_version: getAuthVersion(db),
    };
  });

  // POST /api/auth/change-code (ТОЛЬКО АДМИН)
  // Смена 4-значного ключа доступа
  fastify.post('/auth/change-code', async (request, reply) => {
    const db = await getDb();

    if (!isUserAdminVerified(request, db)) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
        message: 'Действие доступно исключительно верифицированному Администратору.',
      });
    }

    const { new_code, reset_all } = request.body || {};
    if (!new_code || typeof new_code !== 'string') {
      return reply.status(400).send({
        status: 'b181',
        error: 'CODE_REQUIRED',
        message: 'Укажите новый 4-значный ключ доступа.',
      });
    }

    const clean = new_code.trim();
    if (!/^\d{4}$/.test(clean)) {
      return reply.status(400).send({
        status: 'b181',
        error: 'INVALID_FORMAT',
        message: 'Ключ должен состоять ровно из 4 цифр.',
      });
    }

    if (clean.includes('8')) {
      return reply.status(400).send({
        status: 'b181',
        error: 'DIGIT_8_FORBIDDEN',
        message: 'Цифра 8 недопустима на терминальной клавиатуре.',
      });
    }

    // Сохраняем в access_code.txt
    try {
      writeFileSync(CODE_FILE_PATH, clean, 'utf8');
    } catch (err) {
      return reply.status(500).send({
        status: 'b181',
        error: 'FILE_WRITE_FAILED',
        message: `Ошибка записи файла ключа: ${err.message}`,
      });
    }

    let newVer = getAuthVersion(db);
    if (reset_all) {
      newVer = bumpAuthVersion(db);
      run(db, "UPDATE operators SET auth_revoked = 1");
    }

    try {
      run(
        db,
        `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
         VALUES (NULL, 'b181', 'INFO', ?)`,
        [JSON.stringify({ event: 'ACCESS_CODE_CHANGED', by: 'verified_admin', reset_all: Boolean(reset_all), new_version: newVer })]
      );
    } catch (_) {}

    persistDb();

    return {
      status: 'OK',
      new_code: clean,
      auth_version: newVer,
      sessions_revoked: Boolean(reset_all),
      message: reset_all
        ? 'КЛЮЧ ДОСТУПА ИЗМЕНЁН // ВСЕ СЕССИИ АННУЛИРОВАНЫ'
        : 'КЛЮЧ ДОСТУПА УСПЕШНО ИЗМЕНЁН',
    };
  });

  // POST /api/auth/reset-all
  // Сбросить ключ у ВСЕХ пользователей (только для Администратора)
  fastify.post('/auth/reset-all', async (request, reply) => {
    const db = await getDb();

    if (!isUserAdminVerified(request, db)) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
        message: 'Действие сброса доступно исключительно верифицированному Администратору.',
      });
    }

    const newVer = bumpAuthVersion(db);
    run(db, "UPDATE operators SET auth_revoked = 1");

    try {
      run(
        db,
        `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
         VALUES (NULL, 'b181', 'WARN', ?)`,
        [JSON.stringify({ event: 'GLOBAL_AUTH_RESET', by: 'verified_admin', new_version: newVer })]
      );
    } catch (_) {}

    persistDb();

    return {
      status: 'OK',
      auth_version: newVer,
      message: 'СИНХРОНИЗАЦИЯ СБРОШЕНА У ВСЕХ ОПЕРАТОРОВ // ТРЕБУЕТСЯ ПОВТОРНЫЙ ВВОД КЛЮЧА',
    };
  });
}
