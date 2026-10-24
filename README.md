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
| `DATABASE_URL` | Neon Postgres, set by the Vercel Neon integration. Tables are created on first use (`db/schema.sql`). Without it the API uses `POSTGRES_URL` from the Supabase integration. |
| `GROQ_API_KEY` | the conversation |
| `GEMINI_API_KEY` | fallback for the conversation |
| `ELEVENLABS_API_KEY` | Yaara's voice; optional |
| `VITE_API_BASE` | native apps only: the hosted site, default `https://hey-yaara.vercel.app` (CI builds the apps with `https://hey-yaara.anchit-tandon.com`) |
| `VITE_IOS_STORE_URL` | optional: the App Store or TestFlight link, shown first on `/get` for iPhones |

## Native apps

[hey-yaara.anchit-tandon.com/get](https://hey-yaara.anchit-tandon.com/get) is the download page.
The apps are the same web app in Capacitor (`android/`, `ios/`); in them the call
screen listens and speaks with the phone's own speech recognizer and voice
(`src/lib/native-speech.ts`), because Android's WebView has neither.

`.github/workflows/native-apps.yml` builds both on every change to the app:

- **Android**: `hey-yaara.apk`, opened on an Android 14 emulator in CI before release.
- **iOS**: `hey-yaara-ios.ipa`, unsigned (no Apple developer account yet), opened on
  the iPhone simulator in CI. People install it with AltStore or Sideloadly; the page
  also shows Safari's Add to Home Screen. With an App Store or TestFlight build, set
  `VITE_IOS_STORE_URL` in Vercel and the page leads with it.

On `main` both files go to a GitHub release `v1.0.<run>`; the page and the short links
`/download/android` and `/download/ios` always point at the newest one.

**Android signing.** Updates install over the old app only when every APK has the same
key. Make one once and add it to the repository's Actions secrets
(`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`):

```sh
keytool -genkeypair -v -keystore yaara-release.keystore -alias yaara -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 yaara-release.keystore   # the value of ANDROID_KEYSTORE_BASE64
```

Keep the keystore safe: a lost key means people must uninstall to update. Until the
secrets are set, each build is signed with the runner's one-off debug key, so a new
version installs only after the old one is uninstalled. (A key is never cached in CI:
pull requests run their own workflow code and could read it.)

Icons and splash screens were made from `public/icon-512x512.png` with `@capacitor/assets`.

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
