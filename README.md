# Hey Yaara

A warm Hinglish voice companion: talk to Yaara on a call, listen to music, play
games. Built with Vite + React; the server is a handful of Vercel functions in
`api/`; accounts and calls live in Neon Postgres.

## Accounts

Sign up with a name, an Indian mobile number and a 4-digit PIN; sign in with the
number and the PIN. The PIN is checked on the server (scrypt hash, five wrong
tries lock the number for 15 minutes) and the session is an httpOnly cookie on
the web, a Bearer token in the native apps. Every profile, call, transcript,
recording and review belongs to its own account; the server checks the session
on every request.

| Endpoint | What |
| --- | --- |
| `/api/auth` | sign up, sign in, session, sign out, status |
| `/api/me` | profile, change PIN, delete account |
| `/api/calls` | calls, live transcript lines, recordings (up to 4 MB) |
| `/api/reviews` | rate and review (one per person) and the average |
| `/api/chat` | the conversation (Groq, Gemini as fallback) |
| `/api/tts` | Yaara's voice (ElevenLabs; the phone's own voice when unavailable) |

## Environment (Vercel)

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Neon Postgres, set by the Vercel Neon integration. Tables are created on first use (`db/schema.sql`). |
| `GROQ_API_KEY` | the conversation |
| `GEMINI_API_KEY` | fallback for the conversation |
| `ELEVENLABS_API_KEY` | Yaara's voice; optional |
| `VITE_API_BASE` | native apps only: the hosted site, default `https://hey-yaara.vercel.app` |

## Develop and test

```sh
npm ci
DATABASE_URL=postgres://... npm run dev     # the app and its /api on http://localhost:8080
npm run check                               # lint, typecheck, unit tests, API tests, build
TEST_DATABASE_URL=postgres://... npm run test:api   # the API on a real Postgres (drops yaara_* tables)
TEST_DATABASE_URL=postgres://... npm run test:e2e   # the whole app in Chromium
```

Use throwaway databases for the tests. CI runs all of it against a Postgres
service on every push and pull request.
