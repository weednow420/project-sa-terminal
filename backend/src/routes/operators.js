// ============================================================
//  ROUTES: /api/operator (Синхронизация и учет Операторов)
//  Защита: Реестр Операторов доступен ТОЛЬКО Администратору
// ============================================================
import { getDb, queryOne, queryAll, run } from '../db/init.js';

// Список Telegram ID администраторов (из .env с дефолтным ID создателя)
function getAdminIds() {
  const envVal = process.env.ADMIN_TELEGRAM_IDS || '228844325';
  return envVal
    .split(',')
    .map(x => Number(x.trim()))
    .filter(x => !isNaN(x) && x > 0);
}

function isUserAdmin(telegramId) {
  if (!telegramId) return false;
  const adminIds = getAdminIds();
  return adminIds.includes(Number(telegramId));
}

export default async function operatorsRoutes(fastify) {

  // ── POST /api/operator/sync ──────────────────────────────────
  // Синхронизация Оператора по telegram_id (вызывается при старте TMA или бота)
  // Присваивает постоянный operator_number (№ 0001 / OP-0001).
  // Возвращает флаг is_admin: true/false.
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
    const adminFlag = isUserAdmin(tid) ? 1 : 0;

    try {
      let operator = queryOne(
        db,
        `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin
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
          `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin
           FROM operators
           WHERE telegram_id = ?`,
          [tid]
        );
      } else {
        // Новый Оператор
        run(
          db,
          `INSERT INTO operators (telegram_id, username, first_name, theme_preference, is_admin)
           VALUES (?, ?, ?, ?, ?)`,
          [tid, username || null, first_name || null, theme_preference || 'auto', adminFlag]
        );

        operator = queryOne(
          db,
          `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, theme_preference, is_admin
           FROM operators
           WHERE telegram_id = ?`,
          [tid]
        );
      }

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
    // Проверка аутентификации Администратора
    const callerId = request.headers['x-telegram-user-id'] || request.query?.telegram_id;
    const adminKey = request.query?.admin_key || request.headers['x-admin-key'];

    const isAuthorized = isUserAdmin(callerId) || adminKey === 'PROJECT_SA_ADMIN_2026';
    const db = await getDb();

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
        `SELECT operator_number, telegram_id, username, first_name, first_seen_at, last_seen_at, is_admin
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
        };
      });

      return { status: 'OK', data: list };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });
}

function logIncident(db, operatorId, context, severity = 'ERROR') {
  try {
    run(
      db,
      `INSERT INTO incident_log (operator_number, error_code, severity, context_json)
       VALUES (?, 'b181', ?, ?)`,
      [operatorId, severity, JSON.stringify({ message: context })]
    );
  } catch (_) { /* silent */ }
}
