// Applies db/migrations/*.sql in order, once each. Run: npm run db:migrate
// Uses the direct (non-pooled) connection, as schema changes should.
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL?.replace('-pooler.', '.');
if (!url) throw new Error('Set DATABASE_URL (or DATABASE_URL_UNPOOLED), e.g. in .env.local');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  const dir = new URL('../db/migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    await client.query('begin');
    try {
      await client.query(await readFile(new URL(name, dir), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [name]);
      await client.query('commit');
      console.log('applied', name);
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log('database is up to date');
} finally {
  await client.end();
}
