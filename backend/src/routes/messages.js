// ============================================================
//  ROUTES: /api/messages (Послания операторов в контур)
//  Пользователи отправляют заметки на сервер.
//  Администратор просматривает и выгружает их через админку.
// ============================================================
import { getDb, queryOne, queryAll, run, persistDb } from '../db/init.js';
import { isUserAdminVerified } from '../utils/security.js';

export default async function messagesRoutes(fastify) {

  // ── POST /api/messages ───────────────────────────────────────
  // Приём нового послания от оператора
  fastify.post('/messages', async (request, reply) => {
    const { text, message_text, telegram_id, username, first_name } = request.body || {};
    const content = (text || message_text || '').trim();

    if (!content) {
      return reply.status(400).send({
        status: 'b181',
        error: 'MESSAGE_TEXT_REQUIRED',
        message: 'Текст послания не может быть пустым',
      });
    }

    if (content.length > 4000) {
      return reply.status(400).send({
        status: 'b181',
        error: 'MESSAGE_TOO_LONG',
        message: 'Превышен лимит длины сообщения (максимум 4000 знаков)',
      });
    }

    const db = await getDb();
    const callerId = telegram_id || request.headers['x-telegram-user-id'] || null;
    const tid = callerId ? Number(callerId) : null;

    try {
      run(
        db,
        `INSERT INTO messages (operator_id, username, first_name, message_text, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [tid, username || null, first_name || null, content]
      );

      persistDb();

      const lastRow = queryOne(db, "SELECT last_insert_rowid() AS id, datetime('now') AS created_at");
      const id = lastRow ? lastRow.id : null;
      const createdAt = lastRow ? lastRow.created_at : new Date().toISOString();

      return {
        status: 'OK',
        message: 'Послание успешно зафиксировано сервером контура [b181]',
        data: {
          id,
          operator_id: tid,
          username: username || null,
          first_name: first_name || null,
          message_text: content,
          created_at: createdAt,
        },
      };
    } catch (err) {
      fastify.log.error({ err, code: 'b181' });
      return reply.status(500).send({
        status: 'b181',
        error: 'DB_INSERT_FAILED',
        message: err.message,
      });
    }
  });

  // ── GET /api/messages ────────────────────────────────────────
  // Получение всех посланий для администратора
  fastify.get('/messages', async (request, reply) => {
    const db = await getDb();

    if (!isUserAdminVerified(request, db)) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ACCESS_DENIED',
        message: 'Журнал посланий доступен только верифицированным Администраторам контура',
      });
    }

    try {
      const messages = queryAll(
        db,
        `SELECT m.id, m.operator_id, m.username, m.first_name, m.message_text, m.created_at,
                o.operator_number,
                CASE 
                  WHEN o.operator_number IS NOT NULL THEN '№ ' || printf('%04d', o.operator_number)
                  ELSE '---'
                END AS display_number,
                CASE 
                  WHEN o.operator_number IS NOT NULL THEN 'OP-' || printf('%04d', o.operator_number)
                  ELSE '---'
                END AS operator_code
         FROM messages m
         LEFT JOIN operators o ON m.operator_id = o.telegram_id
         ORDER BY m.id DESC`
      );

      return {
        status: 'OK',
        count: messages.length,
        data: messages,
      };
    } catch (err) {
      fastify.log.error({ err, code: 'b181' });
      return reply.status(500).send({
        status: 'b181',
        error: 'DB_QUERY_FAILED',
        message: err.message,
      });
    }
  });

  // ── DELETE /api/messages/:id ─────────────────────────────────
  // Удаление послания администратором
  fastify.delete('/messages/:id', async (request, reply) => {
    const db = await getDb();

    if (!isUserAdminVerified(request, db)) {
      return reply.status(403).send({
        status: 'b181',
        error: 'ACCESS_DENIED',
      });
    }

    const { id } = request.params;
    try {
      run(db, "DELETE FROM messages WHERE id = ?", [Number(id)]);
      persistDb();

      return {
        status: 'OK',
        message: `Послание #${id} удалено из базы`,
      };
    } catch (err) {
      return reply.status(500).send({
        status: 'b181',
        error: err.message,
      });
    }
  });

}
