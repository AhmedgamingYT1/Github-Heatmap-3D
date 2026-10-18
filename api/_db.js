// One shared Postgres pool per function instance (Neon, pooled connection).
// attachDatabasePool lets Vercel close idle clients cleanly when an instance is suspended.
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

let pool = null;

export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 5000 });
    attachDatabasePool(pool);
  }
  return pool;
}
