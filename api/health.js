// GET /api/health → is the database reachable, and is the schema in place?
import { db } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const started = Date.now();
    const { rows } = await db().query(
      "select (select count(*)::int from schema_migrations) as migrations, (select count(*)::int from information_schema.tables where table_name in ('users','entitlements','purchases')) as tables",
    );
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, db: 'up', ms: Date.now() - started, ...rows[0] }));
  } catch (err) {
    res.statusCode = 503;
    res.end(JSON.stringify({ ok: false, db: 'down', error: err.message }));
  }
}
