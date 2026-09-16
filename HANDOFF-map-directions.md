# Handoff: in-app directions instead of the Google Maps hand-off

**From:** Claude Code (`lib/`, `app/api/`) · **To:** Antigravity (`components/`, `app/page.tsx`)
**Branch:** `feat/core-voice` (merge into your `feat/ui-*` branch)

## The ask

> "when someone asks how far, get his location and directly show him the
> direction in our app rather than going the other way"

The "other way" is `components/MapClient.tsx:266` — a **Get Directions** button
that opens `https://www.google.com/maps/dir/` in a new tab. It leaves the app,
it needs a connection, and CONTEXT.md's stack rules say no Google Maps.

## What is already done (my side, landed)

The app now knows where the pilgrim is, and the voice answer already states the
distance in all three languages:

| Query | Answer now |
|---|---|
| `how far is Ramkund` | "Ramkund is a straight-line distance of 940 meters from your location…" |
| `रामकुंड कितनी दूर है` | "रामकुंड आपसे सीधी दूरी पर 940 मीटर है…" |
| `रामकुंड किती लांब आहे` | "रामकुंड तुमच्यापासून थेट रेषेत ९४० मीटर अंतरावर…" |

Landed in `2b86704` / `efb1e31`:

- `lib/geolocation.ts` — acquires and caches the GPS fix, shared app-wide.
- `lib/voice/index.ts` — warms the fix on the mic tap, sends `lat`/`lng` in every `AskRequest`.
- `lib/gemini.ts` — puts the straight-line distance in the prompt, forbids invented walking times/routes.
- `app/api/ask/route.ts` — passes `origin` through to both answer modes.
- Distance questions can no longer be misrouted to "I need an internet connection".

**Nothing in `components/` was touched.** That is this document.

## What I built for you specifically

Two helpers exist so you do not have to write them. Both are offline-safe and
have no dependencies.

### 1. `useUserPosition()` — `lib/geolocation.ts`

```ts
import { useUserPosition } from "@/lib/geolocation";

const { position, requested, request } = useUserPosition();
// position: { lat, lng } | null
```

- Returns a **cached** fix instantly if the mic was already used — no second prompt.
- **Never prompts on its own.** Call `request()` from a tap (a "locate me" button).
  An unexplained permission dialog on page load is the fastest route to a
  permanent denial, which would kill this feature for that pilgrim for good.
- `position` stays `null` if permission is refused or there is no fix. That is a
  normal state, not an error — design for it.

### 2. `bearingDeg()` / `compassPoint()` — `lib/geo.ts`

```ts
import { bearingDeg, compassPoint, haversineKm, formatDistanceKm } from "@/lib/geo";

const km      = haversineKm(position, place);       // 0.94
const { value, unit } = formatDistanceKm(km);        // { value: 940, unit: "m" }
const heading = bearingDeg(position, place);         // 7.6  (degrees from north)
const spoken  = compassPoint(heading);               // "north"
```

`bearingDeg` is degrees clockwise from north — feed it straight into a CSS
`rotate()` for an arrow. `compassPoint` gives eight points only; sixteen is false
precision for a straight line.

## What to build

`MapClient` already renders `VoiceButton` and receives `onPlaceIds`, so **it
already knows the voice-chosen destination**. The missing pieces:

1. **A "you are here" marker** from `useUserPosition()`, visually distinct from
   place pins (a dot with an accuracy halo is conventional and reads well at 375px).
2. **A direct line** from the user to the selected place. A styled `Polyline`
   between the two points.
3. **Fit both in view** — `fitBounds` on the two coordinates with padding, so the
   pilgrim sees themselves and the destination together.
4. **Replace the external link.** The `<a href="google.com/maps/dir/…">` at line
   266 becomes an in-app button that does 1–3 and shows
   `{value} {unit} · {compassPoint}` in the place card.
5. **Handle `position === null`** — with no fix, keep the card working and show a
   "Locate me" button wired to `request()`. Do not show a broken line or a
   zero distance.

## Two things to be careful about

- **Call it a straight line, not a route.** There is no routing engine in this
  ₹0 stack, and the lanes around the ghats are nothing like straight. The voice
  answers are already worded this way, and the map must not contradict them by
  implying turn-by-turn. A direct line with a distance is honest; a line that
  looks like a walking route is not.
- **Do not prompt for location on mount.** See above. The voice path already
  warms the fix on the mic tap, so by the time most pilgrims open a place card
  the position is cached and free.

## Contract note

`types/` is locked and needs no change — `AskRequest.lat/lng` already existed.
If you need a new prop on `MapClient`, that is your file and your call; nothing
in `lib/` depends on its signature.

## Verify

Per CONTEXT.md: test at **375px width** and share a screenshot. Worth checking
with location permission **denied**, since that is the path that silently breaks.
