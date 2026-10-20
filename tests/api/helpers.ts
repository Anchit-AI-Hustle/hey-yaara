// Calls the real api/ handlers with Web Request objects, against a real Postgres
// (TEST_DATABASE_URL). Use a throwaway database: the tests drop the yaara_* tables.

export const TEST_DB = process.env.TEST_DATABASE_URL || "";

type Handler = (req: Request) => Promise<Response>;

export interface Reply {
  status: number;
  headers: Headers;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  cookie: string | null;
}

export async function call(
  handler: Handler,
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string | null; headers?: Record<string, string>; raw?: BodyInit } = {},
): Promise<Reply> {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  let body: BodyInit | undefined;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] ??= "application/json";
  }
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await handler(new Request("http://localhost" + path, { method, headers, body }));
  const type = res.headers.get("content-type") || "";
  const parsed = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
  const set = res.headers.get("set-cookie");
  return { status: res.status, headers: res.headers, body: parsed, cookie: set ? set.split(";")[0] : null };
}

let n = 0;
const run = String(Date.now()).slice(-6);
/** A fresh valid Indian mobile number for each call (10 digits, starts with 9). */
export const freshMobile = () => "9" + run + String(n++).padStart(3, "0");
