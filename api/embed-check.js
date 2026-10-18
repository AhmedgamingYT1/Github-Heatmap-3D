// GET /api/embed-check?item=galaxy&key=… → { ok } : may this embed show that Pro world?
// Called by every embed of a Pro world. Without a genuine key for a current purchase the
// embed falls back to the free City.
import { readKey, owns } from './_keys.js';

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const userId = readKey(q.get('key'), q.get('item'));
  let ok = false;
  try {
    ok = Boolean(userId) && (await owns(userId, q.get('item')));
  } catch (err) {
    console.error('api/embed-check', err);
  }
  res.setHeader('Content-Type', 'application/json');
  // a valid answer can be reused for a few minutes; a refusal is re-asked sooner
  res.setHeader('Cache-Control', ok ? 'public, max-age=300, s-maxage=300' : 'public, max-age=60, s-maxage=60');
  res.statusCode = 200;
  res.end(JSON.stringify({ ok }));
}
