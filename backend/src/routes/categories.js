// ============================================================
//  ROUTES: /api/categories  (sql.js версия)
// ============================================================
import { getDb, queryAll, queryOne, run } from '../db/init.js';

export default async function categoriesRoutes(fastify) {

  // GET /api/categories
  fastify.get('/categories', async (request, reply) => {
    const db = await getDb();
    try {
      const rows = queryAll(db,
        `SELECT id, slug, title, description, sort_order
         FROM categories
         WHERE is_active = 1
         ORDER BY sort_order ASC`
      );
      return { status: 'OK', data: rows };
    } catch (err) {
      logIncident(db, null, err.message);
      return reply.status(500).send({ status: 'b181', error: 'QUERY_FAILED' });
    }
  });

  // GET /api/categories/:slug
  fastify.get('/categories/:slug', async (request, reply) => {
    const db = await getDb();
    try {
      const row = queryOne(db,
        `SELECT id, slug, title, description, sort_order
         FROM categories WHERE slug = ? AND is_active = 1`,
        [request.params.slug]
      );
      if (!row) return reply.status(404).send({ status: 'b181', error: 'CATEGORY_NOT_FOUND' });
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
