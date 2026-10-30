# scripts/

| Script | What |
|---|---|
| `vite-api-dev.ts` | Serves the `api/` functions inside `npm run dev`, so the app and its API run on one port. |
| `make-webclip.mjs` | Writes `public/install/hey-yaara.mobileconfig`, the iPhone install profile linked from `/get`. |
| `png-colours.py` | Counts the colours in a screenshot; CI uses it to check the Android app drew its home screen. |
