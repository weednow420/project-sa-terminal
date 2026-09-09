// ============================================================
//  ROUTES: /api/cards  (sql.js версия с поддержкой подкатегорий)
// ============================================================
import { getDb, queryAll, queryOne, run } from '../db/init.js';

export default async function cardsRoutes(fastify) {

  // GET /api/categories/:slug/cards
  fastify.get('/categories/:slug/cards', async (request, reply) => {
    const db = await getDb();
    try {
      const category = queryOne(db,
        `SELECT id, slug, title FROM categories WHERE slug = ? AND is_active = 1`,
        [request.params.slug]
      );
      if (!category) {
        return reply.status(404).send({ status: 'b181', error: 'CATEGORY_NOT_FOUND' });
      }

      const { subcategory } = request.query || {};

      let sql = `
        SELECT id, title, body_text, sequence_index, subcategory, subcategory_title
        FROM cards
        WHERE category_id = ? AND is_active = 1
      `;
      const params = [category.id];

      if (subcategory && subcategory !== 'all') {
        sql += ` AND subcategory = ?`;
        params.push(subcategory);
      }

      sql += ` ORDER BY subcategory ASC, sequence_index ASC`;

      const rows = queryAll(db, sql, params);

      // Извлекаем уникальные подкатегории для этого раздела
      const subcategories = queryAll(db,
        `SELECT subcategory, subcategory_title, COUNT(id) as count
         FROM cards
         WHERE category_id = ? AND is_active = 1 AND subcategory IS NOT NULL AND subcategory != ''
         GROUP BY subcategory, subcategory_title
         ORDER BY MIN(sequence_index) ASC`,
        [category.id]
      );

      return {
        status: 'OK',
        category_slug: category.slug,
        category_title: category.title,
        subcategories: subcategories || [],
        data: rows
      };
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
                c.subcategory, c.subcategory_title,
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
