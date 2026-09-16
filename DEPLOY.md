# Deploying Discover Nashik

**Production:** https://discovernashik.vercel.app
Vercel project `discovernashik` (team *Suyash's projects*, Hobby plan, region iad1).

## Environment variables

Set on Vercel for **Production** and **Preview**. Local values live in `.env.local` (never committed).

| Name | Kind | Used by |
|---|---|---|
| `GEMINI_API_KEY` | secret | `/api/ask` live answers |
| `SARVAM_API_KEY` | secret | `/api/voice/stt`, `/api/voice/tts` |
| `GOOGLE_MAPS_SERVER_KEY` | secret | `/api/route` (Routes API), `/api/place-photo` (Places API New) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | public config | map in the browser |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | public config | Firebase web SDK |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | public config | Firebase Auth |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | public config | Firestore advisories |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | public config | Firebase web SDK |
| `NEXT_PUBLIC_ADMIN_EMAILS` | public config | `/admin` access list |

Optional tuning variables are listed in `.env.example`. `VERCEL_OIDC_TOKEN` in `.env.local` is written by the
Vercel CLI; do not upload it.

Add or change one:

```bash
vercel env add GEMINI_API_KEY production --sensitive
```

Public `NEXT_PUBLIC_*` keys need `--type config`. `NEXT_PUBLIC_*` values are baked in at build time, so redeploy
after changing them. `.env.local` is saved with Windows line endings: when piping values in, strip `\r`
first or the key will not work.

## Redeploy

```bash
git switch main && git pull
npm ci && npm run data && npm run build
vercel --prod
```

`vercel --prod` uploads the local folder, so commit first. If the upload fails with `fetch failed`, run it again.
It is a transient network error. Check a deploy with `vercel logs discovernashik.vercel.app --since 10m`.

## Manual setup (outside Vercel)

- **Google Cloud: Maps browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`): add `https://discovernashik.vercel.app/*`
  (plus `http://localhost:3000/*` for development) to the key's website restrictions, and limit the key to the
  Maps JavaScript API.
- **Google Cloud: server key** (`GOOGLE_MAPS_SERVER_KEY`): enable **Places API (New)** (needed for the Google
  photo fallback) and restrict the key to Routes API + Places API (New). Use a separate key from the browser one.
- **Firebase Auth:** add `discovernashik.vercel.app` to *Authentication → Settings → Authorized domains*,
  or admin sign-in on `/admin` fails.
- **Twilio:** `app/api/voice/twilio` **does not exist yet**, so there is no webhook to configure. When it is added,
  set the number's *A call comes in* webhook to `https://discovernashik.vercel.app/api/voice/twilio` (POST).

## Last verified (2026-09-16)

| Check | Result |
|---|---|
| `/`, `/admin`, `/manifest.webmanifest`, `/sw.js`, `/icon.svg`, `/photos/*.webp` | 200 |
| `POST /api/ask` `{"query":"Ramkund kuthe aahe","lang":"mr-IN"}` | 200, answer + `placeIds: ["ramkund"]` |
| `POST /api/ask` (warm) | 200, live Gemini answer in ~1.5 s. The first call after a cold start can fall back offline. |
| `POST /api/voice/tts` (Marathi) | 200, `audio/wav` |
| `POST /api/route` Nashik Road station → Ramkund | 200, walking route |
| `GET /api/place-photo?id=kalaram-mandir` | 200, Wikimedia photo |
