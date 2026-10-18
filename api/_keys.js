// Embed keys: proof that a Pro world in an embed was paid for.
// A key is "<user id>.<item>.<signature>", signed with EMBED_SECRET (server only), so it
// can't be made up or moved to another world. Every check also looks the purchase up
// again, so a refunded or cancelled plan stops working in every embed.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './_db.js';

const sign = (text) => createHmac('sha256', process.env.EMBED_SECRET || '').update(text).digest('base64url');

export function makeKey(userId, item) {
  if (!process.env.EMBED_SECRET) throw new Error('EMBED_SECRET is not set');
  return `${userId}.${item}.${sign(`${userId}.${item}`)}`;
}

/** The user id a key belongs to when it's genuine and for this item; otherwise null. */
export function readKey(key, item) {
  if (!process.env.EMBED_SECRET || typeof key !== 'string') return null;
  const [userId, keyItem, sig] = key.split('.');
  if (!userId || !sig || keyItem !== item) return null;
  const want = Buffer.from(sign(`${userId}.${item}`));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? userId : null;
}

/** True when the account owns this item, or all of Pro, right now. */
export async function owns(userId, item) {
  const { rows } = await db().query(
    "select 1 from entitlements where user_id = $1 and item in ('pro', $2) and (expires_at is null or expires_at > now()) limit 1",
    [userId, item],
  );
  return rows.length > 0;
}
