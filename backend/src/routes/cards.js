// ============================================================
//  ROUTES: /api/cards  (sql.js версия)
// ============================================================
import { getDb, queryAll, queryOne, run } from '../db/init.js';

export default async function cardsRoutes(fastify) {

  // GET /api/categories/:slug/cards — последовательность СТРОГО с §01
  fastify.get('/categories/:slug/cards', async (request, reply) => {
    const db = await getDb();
    try {
      const category = queryOne(db,
        `SELECT id FROM categories WHERE slug = ? AND is_active = 1`,
        [request.params.slug]
      );
      if (!category) {
        return reply.status(404).send({ status: 'b181', error: 'CATEGORY_NOT_FOUND' });
      }

      // sequence_index ВСЕГДА начинается с 1 — без пропусков
      const rows = queryAll(db,
        `SELECT id, title, body_text, sequence_index
         FROM cards
         WHERE category_id = ? AND is_active = 1 AND sequence_index >= 1
         ORDER BY sequence_index ASC`,
        [category.id]
      );

      return { status: 'OK', category_slug: request.params.slug, data: rows };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });

  // GET /api/cards/:id
  fastify.get('/cards/:id', async (request, reply) => {
    const db = await getDb();
    try {
      const row = queryOne(db,
        `SELECT c.id, c.title, c.body_text, c.sequence_index,
                cat.slug as category_slug, cat.title as category_title
         FROM cards c
         JOIN categories cat ON cat.id = c.category_id
         WHERE c.id = ? AND c.is_active = 1`,
        [request.params.id]
      );
      if (!row) return reply.status(404).send({ status: 'b181', error: 'CARD_NOT_FOUND' });
      return { status: 'OK', data: row };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });
}

function logIncident(db, operatorId, context, severity = 'ERROR') {
  try {
    run(db,
      `INSERT INTO incident_log (operator_id, error_code, severity, context_json)
       VALUES (?, 'b181', ?, ?)`,
      [operatorId, severity, JSON.stringify({ message: context })]
    );
  } catch (_) { /* silent */ }
}
