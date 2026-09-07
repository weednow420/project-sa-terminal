// ============================================================
//  ROUTES: /api/operator (Синхронизация и учет Операторов)
//  Защита: Реестр Операторов доступен ТОЛЬКО Администратору
// ============================================================
import { getDb, queryOne, queryAll, run, persistDb } from '../db/init.js';

// Список Telegram ID администраторов (из .env с дефолтным ID создателя)
function getAdminIds() {
  const envVal = process.env.ADMIN_TELEGRAM_IDS || '228844325';
  return envVal
    .split(',')
    .map(x => Number(x.trim()))
    .filter(x => !isNaN(x) && x > 0);
}

function isUserAdmin(db, telegramId) {
  if (!telegramId) return false;
  const tid = Number(telegramId);
  const adminIds = getAdminIds();
  if (adminIds.includes(tid)) return true;
  if (db) {
    try {
      const row = queryOne(db, "SELECT is_admin FROM operators WHERE telegram_id = ?", [tid]);
      if (row && row.is_admin === 1) return true;
    } catch (_) {}
  }
  return false;
}

export default async function operatorsRoutes(fastify) {

  // ── POST /api/operator/sync ──────────────────────────────────
  // Синхронизация Оператора по telegram_id (вызывается при старте TMA или бота)
  // Присваивает постоянный operator_number (№ 0001 / OP-0001).
  // Возвращает флаг is_admin: true/false и auth_required: true/false.
  fastify.post('/operator/sync', async (request, reply) => {
    const { telegram_id, username, first_name, theme_preference } = request.body || {};

    if (!telegram_id) {
      return reply.status(400).send({
        status: 'b181',
        error: 'TELEGRAM_ID_REQUIRED',
      });
    }

    const db = await getDb();
    const tid = Number(telegram_id);
    const adminFlag = isUserAdmin(db, tid) ? 1 : 0;

    try {
      let operator = queryOne(
        db,
        `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin, auth_revoked, auth_version
         FROM operators
         WHERE telegram_id = ?`,
        [tid]
      );

      if (operator) {
        // Обновляем данные; если пользователь в списке админов — повышаем
        run(
          db,
          `UPDATE operators
           SET last_seen_at = datetime('now'),
               username = COALESCE(?, username),
               first_name = COALESCE(?, first_name),
               theme_preference = COALESCE(?, theme_preference),
               is_admin = CASE WHEN ? = 1 THEN 1 ELSE is_admin END
           WHERE telegram_id = ?`,
          [username || null, first_name || null, theme_preference || null, adminFlag, tid]
        );

        operator = queryOne(
          db,
          `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin, auth_revoked, auth_version
           FROM operators
           WHERE telegram_id = ?`,
          [tid]
        );
      } else {
        // Новый Оператор
        run(
          db,
          `INSERT INTO operators (telegram_id, username, first_name, theme_preference, is_admin, auth_revoked, auth_version)
           VALUES (?, ?, ?, ?, ?, 0, 1)`,
          [tid, username || null, first_name || null, theme_preference || 'auto', adminFlag]
        );

        operator = queryOne(
          db,
          `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin, auth_revoked, auth_version
           FROM operators
           WHERE telegram_id = ?`,
          [tid]
        );
      }

      persistDb();

      // Проверяем актуальность ключа авторизации
      const sysVerRow = queryOne(db, "SELECT value FROM system_config WHERE key = 'auth_version'");
      const systemAuthVersion = sysVerRow ? Number(sysVerRow.value) : 1;
      const authRequired = Boolean(operator.auth_revoked === 1 || (operator.auth_version || 0) < systemAuthVersion);

      const numStr = String(operator.operator_number).padStart(4, '0');
      const responseData = {
        operator_number: operator.operator_number,
        operator_code:   `OP-${numStr}`,        // Код для транскрипта: OP-0001
        display_number:  `№ ${numStr}`,         // Отображение: № 0001
        telegram_id:     operator.telegram_id,
        username:        operator.username,
        first_name:      operator.first_name,
        first_seen_at:   operator.first_seen_at,
        last_seen_at:    operator.last_seen_at,
        theme_preference:operator.theme_preference,
        is_admin:        Boolean(operator.is_admin),
        auth_required:   authRequired,
        auth_version:    systemAuthVersion,
      };

      return { status: 'OK', data: responseData };
    } catch (err) {
      logIncident(db, tid, `Operator sync failed: ${err.message}`);
      return reply.status(500).send({ status: 'b181', error: 'OPERATOR_SYNC_FAILED' });
    }
  });

  // ── GET /api/operator/:identifier ───────────────────────────
  // Получить карточку Оператора
  fastify.get('/operator/:identifier', async (request, reply) => {
    const { identifier } = request.params;
    const db = await getDb();
    const idNum = Number(identifier);

    try {
      const operator = queryOne(
        db,
        `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin
         FROM operators
         WHERE operator_number = ? OR telegram_id = ?`,
        [idNum, idNum]
      );

      if (!operator) {
        return reply.status(404).send({ status: 'b181', error: 'OPERATOR_NOT_FOUND' });
      }

      const numStr = String(operator.operator_number).padStart(4, '0');
      return {
        status: 'OK',
        data: {
          operator_number: operator.operator_number,
          operator_code:   `OP-${numStr}`,
          display_number:  `№ ${numStr}`,
          telegram_id:     operator.telegram_id,
          username:        operator.username,
          first_name:      operator.first_name,
          first_seen_at:   operator.first_seen_at,
          last_seen_at:    operator.last_seen_at,
          is_admin:        Boolean(operator.is_admin),
        },
      };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });

  // ── GET /api/operators ──────────────────────────────────────
  // Реестр всех Операторов (ДОСТУПЕН ТОЛЬКО АДМИНИСТРАТОРАМ)
  fastify.get('/operators', async (request, reply) => {
    const callerId = request.headers['x-telegram-user-id'] || request.query?.telegram_id;
    const adminKey = request.query?.admin_key || request.headers['x-admin-key'];

    const db = await getDb();
    const isAuthorized = isUserAdmin(db, callerId) || adminKey === 'PROJECT_SA_ADMIN_2026';

    if (!isAuthorized) {
      logIncident(
        db,
        callerId ? Number(callerId) : null,
        `UNAUTHORIZED_REGISTRY_ACCESS_ATTEMPT: caller=${callerId || 'unknown'}`,
        'WARN'
      );
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
        message: 'Доступ к Реестру Операторов закрыт. Требуются права Администратора.',
      });
    }

    try {
      const rows = queryAll(
        db,
        `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, is_admin, auth_revoked, auth_version
         FROM operators
         ORDER BY operator_number ASC`
      );

      const list = rows.map(r => {
        const numStr = String(r.operator_number).padStart(4, '0');
        return {
          ...r,
          operator_code:  `OP-${numStr}`,
          display_number: `№ ${numStr}`,
          is_admin:       Boolean(r.is_admin),
          auth_revoked:   Boolean(r.auth_revoked),
        };
      });

      return { status: 'OK', data: list };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });

  // ── POST /api/operators/:identifier/reset-auth ───────────────
  // Сброс ключа конкретного Оператора (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
  fastify.post('/operators/:identifier/reset-auth', async (request, reply) => {
    const callerId = request.headers['x-telegram-user-id'] || request.body?.telegram_id;
    const adminKey = request.headers['x-admin-key'] || request.body?.admin_key;
    const db = await getDb();

    if (!isUserAdmin(db, callerId) && adminKey !== 'PROJECT_SA_ADMIN_2026') {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
      });
    }

    const { identifier } = request.params;
    const idNum = Number(identifier);

    const op = queryOne(
      db,
      `SELECT operator_number, telegram_id, username, first_name
       FROM operators
       WHERE operator_number = ? OR telegram_id = ?`,
      [idNum, idNum]
    );

    if (!op) {
      return reply.status(404).send({ status: 'b181', error: 'OPERATOR_NOT_FOUND' });
    }

    run(db, "UPDATE operators SET auth_revoked = 1 WHERE telegram_id = ?", [op.telegram_id]);
    persistDb();

    logIncident(db, op.telegram_id, `OPERATOR_AUTH_RESET by caller=${callerId}`, 'WARN');

    return {
      status: 'OK',
      telegram_id: op.telegram_id,
      operator_number: op.operator_number,
      message: `КЛЮЧ ОПЕРАТОРА №${String(op.operator_number).padStart(4, '0')} АННУЛИРОВАН`,
    };
  });

  // ── POST /api/operators/:identifier/toggle-admin ────────────
  // Выдать или отозвать статус Администратора (ТОЛЬКО ДЛЯ АДМИНИСТРАТОРА)
  fastify.post('/operators/:identifier/toggle-admin', async (request, reply) => {
    const callerId = request.headers['x-telegram-user-id'] || request.body?.telegram_id;
    const adminKey = request.headers['x-admin-key'] || request.body?.admin_key;
    const db = await getDb();

    if (!isUserAdmin(db, callerId) && adminKey !== 'PROJECT_SA_ADMIN_2026') {
      return reply.status(403).send({
        status: 'b181',
        error: 'ADMIN_ACCESS_REQUIRED',
      });
    }

    const { identifier } = request.params;
    const idNum = Number(identifier);

    const op = queryOne(
      db,
      `SELECT operator_number, telegram_id, username, first_name, is_admin
       FROM operators
       WHERE operator_number = ? OR telegram_id = ?`,
      [idNum, idNum]
    );

    if (!op) {
      return reply.status(404).send({ status: 'b181', error: 'OPERATOR_NOT_FOUND' });
    }

    const primaryAdmins = getAdminIds();
    if (primaryAdmins.includes(op.telegram_id) && op.is_admin === 1) {
      return reply.status(400).send({
        status: 'b181',
        error: 'ROOT_ADMIN_IMMUTABLE',
        message: 'Невозможно отозвать права у корневого Администратора контура.',
      });
    }

    const newAdminStatus = op.is_admin === 1 ? 0 : 1;
    run(db, "UPDATE operators SET is_admin = ? WHERE telegram_id = ?", [newAdminStatus, op.telegram_id]);
    persistDb();

    logIncident(db, op.telegram_id, `OPERATOR_ADMIN_TOGGLE to ${newAdminStatus} by caller=${callerId}`, 'INFO');

    return {
      status: 'OK',
      telegram_id: op.telegram_id,
      operator_number: op.operator_number,
      is_admin: Boolean(newAdminStatus),
      message: newAdminStatus === 1 ? 'СТАТУС АДМИНИСТРАТОРА ВЫДАН' : 'СТАТУС АДМИНИСТРАТОРА ОТОЗВАН',
    };
  });
}

function logIncident(db, operatorId, context, severity = 'ERROR') {
  try {
    run(
      db,
      `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
       VALUES (?, 'b181', ?, ?)`,
      [operatorId, severity, JSON.stringify({ message: context })]
    );
  } catch (_) { /* silent */ }
}
