-- Accounts, what they own, and the payments behind it.
-- Users are keyed by their sign-in provider's id (Clerk) and keep their Google email,
-- so the data stays ours if sign-in ever moves elsewhere.

create table if not exists users (
  id          text primary key,              -- the sign-in provider's user id
  email       text not null,
  name        text,
  avatar_url  text,
  country     text,                          -- ISO code picked for prices, e.g. 'IN'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists users_email_key on users (lower(email));

-- One row per thing an account can use: 'pro' (everything), or one item ('night', 'galaxy', 'forest', 'song').
create table if not exists entitlements (
  user_id     text not null references users (id) on delete cascade,
  item        text not null,
  source      text not null,                 -- the purchase that granted it, or 'gift'
  expires_at  timestamptz,                   -- null = forever (one world, lifetime)
  created_at  timestamptz not null default now(),
  primary key (user_id, item)
);

-- Every payment the provider tells us about, kept as received.
create table if not exists purchases (
  id            text primary key,            -- the provider's order or subscription id
  user_id       text references users (id) on delete set null,
  provider      text not null,
  plan          text not null,               -- 'world' | 'month' | 'year' | 'life'
  item          text,                        -- for 'world': which one
  amount_minor  integer,                     -- in the currency's smallest unit
  currency      text,
  status        text not null,               -- 'paid' | 'refunded' | 'active' | 'cancelled'
  raw           jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists purchases_user_idx on purchases (user_id);
