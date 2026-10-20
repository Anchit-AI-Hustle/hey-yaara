// Neon Postgres (DATABASE_URL, set by the Vercel Neon integration).
//
// Only server code holds the connection string; the browser never talks to the
// database. The tables are created on first use, so a fresh database needs no
// manual step. db/schema.sql keeps the same statements for reading.

import pg from "pg";

export const SCHEMA = `
create table if not exists yaara_users (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique check (phone ~ '^\\+91[6-9][0-9]{9}$'),
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
`;

export function connectionString(): string {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
}

let pool: pg.Pool | null = null;
let poolUrl = "";
let ready: Promise<unknown> | null = null;

function getPool(): pg.Pool {
  const url = connectionString();
  if (!url) {
    const e = new Error("The database is not configured (DATABASE_URL).") as Error & { code?: string };
    e.code = "unconfigured";
    throw e;
  }
  if (!pool || poolUrl !== url) {
    // One connection per function instance; Neon's pooled URL does the rest.
    pool = new pg.Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
    pool.on("error", () => { /* a dropped idle connection is replaced on next use */ });
    poolUrl = url;
    ready = null;
  }
  return pool;
}

function ensureSchema(): Promise<unknown> {
  if (!ready) {
    const p = getPool();
    ready = p.query(SCHEMA)
      // Two cold starts creating the same table race on the catalog; the loser
      // runs it again and finds everything there.
      .catch((e: { code?: string }) => (e?.code === "23505" || e?.code === "42P07" ? p.query(SCHEMA) : Promise.reject(e)))
      .catch((e: unknown) => { ready = null; throw e; });
  }
  return ready as Promise<unknown>;
}

export const configured = () => Boolean(connectionString());

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, params);
}

export async function ping(): Promise<boolean> {
  await q("select 1");
  return true;
}

/** Tests only: close the pool so the process can exit. */
export async function closeForTests(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
  ready = null;
}
