// `npm run dev` only: answers /api/* with the same api/*.ts files Vercel runs,
// so sign-in, calls and reviews work locally (set DATABASE_URL to a Postgres).
// Never part of the production build.

import type { Plugin } from "vite";

const NAME = /^\/api\/([a-z-]+)(?:\?|$)/;

export function apiDev(): Plugin {
  return {
    name: "yaara-api-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = (req.url || "").match(NAME);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const method = (req.method || "GET").toUpperCase();
          const handler = mod[method] || mod.default;
          if (typeof handler !== "function") {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
          const request = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(`[api] ${req.url}: ${(e as Error).stack || e}`);
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: "dev api error" }));
        }
      });
    },
  };
}
