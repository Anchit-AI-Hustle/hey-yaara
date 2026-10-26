// Which database the API uses: its own DATABASE_URL first, else the Postgres
// of the Supabase integration (POSTGRES_URL), encrypted the libpq way.

import { afterEach, describe, expect, it } from "vitest";
import { connectionString } from "../../api/_lib/db";

const KEYS = ["DATABASE_URL", "STORAGE_DATABASE_URL", "NEON_DATABASE_URL", "POSTGRES_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

describe("database url", () => {
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
  const only = (env: Partial<Record<(typeof KEYS)[number], string>>) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, env); };

  it("prefers DATABASE_URL, then NEON_DATABASE_URL, untouched", () => {
    only({ DATABASE_URL: "postgres://a@neon/db?sslmode=require", POSTGRES_URL: "postgres://b@supabase/db" });
    expect(connectionString()).toBe("postgres://a@neon/db?sslmode=require");
    only({ NEON_DATABASE_URL: "postgres://n@neon/db", POSTGRES_URL: "postgres://b@supabase/db" });
    expect(connectionString()).toBe("postgres://n@neon/db");
  });

  it("reads the Neon store connected with the STORAGE prefix", () => {
    only({ STORAGE_DATABASE_URL: "postgres://s@neon/db?sslmode=require", NEON_DATABASE_URL: "postgres://n@neon/db", POSTGRES_URL: "postgres://b@supabase/db" });
    expect(connectionString()).toBe("postgres://s@neon/db?sslmode=require");
    only({ DATABASE_URL: "postgres://a@neon/db", STORAGE_DATABASE_URL: "postgres://s@neon/db" });
    expect(connectionString()).toBe("postgres://a@neon/db");
  });

  it("falls back to the Supabase POSTGRES_URL with libpq's sslmode=require", () => {
    only({ POSTGRES_URL: "postgres://u:p%40ss@aws-0.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x" });
    const url = new URL(connectionString());
    expect(url.hostname).toBe("aws-0.pooler.supabase.com");
    expect(url.password).toBe("p%40ss");
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("uselibpqcompat")).toBe("true");
    only({ POSTGRES_URL: "postgres://u:p@db.supabase.co:5432/postgres" });
    expect(new URL(connectionString()).searchParams.get("sslmode")).toBe("require");
  });

  it("is empty when nothing is set, so sign-in says it is off", () => {
    only({});
    expect(connectionString()).toBe("");
  });
});
