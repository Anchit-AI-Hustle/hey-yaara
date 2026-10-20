-- Hey Yaara on Neon Postgres. api/_lib/db.ts runs these same statements on
-- first use, so a new database needs no manual step; this copy is for reading.
create table if not exists yaara_users (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  name            text not null,
  age             text,
  gender          text,
  email           text,
  female_voice_id text,
  male_voice_id   text,
  pin_salt        text not null,
  pin_hash        text not null,
  pin_tries       integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create table if not exists yaara_sessions (
  token_hash text primary key,
  user_id    uuid not null references yaara_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists yaara_sessions_user_idx on yaara_sessions (user_id);
create table if not exists yaara_calls (
  id         text primary key,
  user_id    uuid not null references yaara_users(id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz,
  duration   integer not null default 0,
  status     text not null default 'completed',
  transcript jsonb not null default '[]'::jsonb,
  has_audio  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists yaara_calls_user_idx on yaara_calls (user_id, start_time desc);
create table if not exists yaara_messages (
  id         bigserial primary key,
  call_id    text not null,
  user_id    uuid not null references yaara_users(id) on delete cascade,
  role       text not null check (role in ('user', 'yaara')),
  text       text not null,
  created_at timestamptz not null default now()
);
create index if not exists yaara_messages_call_idx on yaara_messages (user_id, call_id, created_at);
create table if not exists yaara_call_audio (
  call_id    text primary key references yaara_calls(id) on delete cascade,
  user_id    uuid not null references yaara_users(id) on delete cascade,
  mime       text not null,
  bytes      bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists yaara_reviews (
  user_id    uuid primary key references yaara_users(id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  text       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
