// ============================================================
//  PROJECT S-A TERMINAL — Security & Authentication Helpers
//  - Проверка криптографической подписи Telegram WebApp initData
//  - Безопасная проверка прав Администратора (без уязвимости подмены заголовков)
//  - Защита от перебора 4-значного PIN-кода (Rate Limiting / Brute-force protection)
// ============================================================
import crypto from 'crypto';
import { queryOne, run } from '../db/init.js';

// ── Rate Limiter для попыток ввода PIN-кода ─────────────────────
const FAILED_ATTEMPTS = new Map(); // key -> { count, lockedUntil }

// Периодическая очистка устаревших записей (каждые 10 минут)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of FAILED_ATTEMPTS.entries()) {
    if (record.lockedUntil && record.lockedUntil < now) {
      FAILED_ATTEMPTS.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

export function checkPinRateLimit(key, maxAttempts = 5, lockDurationMs = 5 * 60 * 1000) {
  const now = Date.now();
  const record = FAILED_ATTEMPTS.get(key);
  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return { limited: true, remainingSec };
  }
  return { limited: false };
}

export function recordFailedPinAttempt(key, maxAttempts = 5, lockDurationMs = 5 * 60 * 1000) {
  const now = Date.now();
  const record = FAILED_ATTEMPTS.get(key) || { count: 0, firstAttempt: now };
  record.count += 1;
  if (record.count >= maxAttempts) {
    record.lockedUntil = now + lockDurationMs;
  }
  FAILED_ATTEMPTS.set(key, record);
}

export function resetPinRateLimit(key) {
  FAILED_ATTEMPTS.delete(key);
}

// ── Список Telegram ID администраторов ──────────────────────────
export function getAdminIds() {
  const envVal = process.env.ADMIN_TELEGRAM_IDS || '228844325';
  return envVal
    .split(',')
    .map(x => Number(x.trim()))
    .filter(x => !isNaN(x) && x > 0);
}

// ── Секретный мастер-ключ Администратора ────────────────────────
export function getAdminSecretKey(db = null) {
  if (process.env.ADMIN_SECRET_KEY) {
    return process.env.ADMIN_SECRET_KEY.trim();
  }
  if (process.env.ADMIN_KEY) {
    return process.env.ADMIN_KEY.trim();
  }

  // Если не задан в .env — получаем или генерируем постоянный случайный ключ в БД
  if (db) {
    try {
      db.run(`CREATE TABLE IF NOT EXISTS system_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );`);
      const row = queryOne(db, "SELECT value FROM system_config WHERE key = 'admin_master_secret'");
      if (row && row.value) {
        return row.value;
      }
      const randomSecret = crypto.randomBytes(24).toString('hex');
      run(db, "INSERT OR REPLACE INTO system_config (key, value) VALUES ('admin_master_secret', ?)", [randomSecret]);
      console.log('[SECURITY] Сгенерирован защищенный мастер-ключ Администратора.');
      return randomSecret;
    } catch (_) {}
  }

  return 'PROJECT_SA_MASTER_DEFAULT';
}

// ── Валидация криптографической подписи Telegram WebApp initData ──
export function verifyTelegramInitData(initData, botToken = null) {
  const token = botToken || process.env.BOT_TOKEN;
  if (!initData || typeof initData !== 'string' || !token) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const items = [];
    for (const [k, v] of params.entries()) {
      items.push(`${k}=${v}`);
    }
    items.sort();
    const dataCheckString = items.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userJson = params.get('user');
      if (userJson) {
        return JSON.parse(userJson);
      }
    }
  } catch (err) {
    console.warn('[SECURITY] Ошибка проверки HMAC initData:', err.message);
  }

  return null;
}

// ── Безопасная проверка прав Администратора ────────────────────
export function isUserAdminVerified(request, db) {
  const adminSecret = getAdminSecretKey(db);
  const providedAdminKey = request.headers['x-admin-key'] || request.query?.admin_key || request.body?.admin_key;

  // 1. Проверка по секретному ключу администратора
  if (providedAdminKey && typeof providedAdminKey === 'string' && providedAdminKey.trim() === adminSecret) {
    return true;
  }

  // 2. Проверка через криптографический заголовок Telegram WebApp
  const rawInitData = request.headers['x-telegram-init-data'];
  if (rawInitData) {
    const verifiedUser = verifyTelegramInitData(rawInitData);
    if (verifiedUser && verifiedUser.id) {
      const adminIds = getAdminIds();
      if (adminIds.includes(Number(verifiedUser.id))) {
        return true;
      }
      if (db) {
        try {
          const row = queryOne(db, "SELECT is_admin FROM operators WHERE telegram_id = ?", [Number(verifiedUser.id)]);
          if (row && row.is_admin === 1) return true;
        } catch (_) {}
      }
    }
  }

  return false;
}
