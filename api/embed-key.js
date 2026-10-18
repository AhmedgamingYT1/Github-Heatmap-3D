// GET /api/embed-key?item=galaxy → { key } for an account that owns that Pro world.
// The Studio puts the key in the embed code it hands out.
import { userIdFrom } from './_auth.js';
import { makeKey, owns } from './_keys.js';

const ITEMS = new Set(['night', 'galaxy', 'forest', 'pro']); // 'pro': embeds without the badge

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const item = new URL(req.url, 'http://x').searchParams.get('item');
  const send = (status, body) => ((res.statusCode = status), res.end(JSON.stringify(body)));
  if (!ITEMS.has(item)) return send(400, { error: 'Unknown world' });
  const userId = await userIdFrom(req);
  if (!userId) return send(401, { error: 'Not signed in' });
  try {
    if (!(await owns(userId, item))) return send(403, { error: 'Not unlocked' });
    send(200, { key: makeKey(userId, item) });
  } catch (err) {
    console.error('api/embed-key', err);
    send(500, { error: 'Could not make a key' });
  }
}
