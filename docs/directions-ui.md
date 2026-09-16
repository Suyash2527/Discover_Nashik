# Directions + place photos — UI handoff (for `components/`)

The backend is done (branch `feat/photos-directions`). This is what the UI needs
to build. Nothing in `/types` changed; the new response fields are documented here.

## 1. Place photo in the place sheet

`GET /api/place-photo?id=<placeId>`

| Status | Meaning | UI |
|---|---|---|
| 200 | `{ source: "wikimedia" \| "google", src, attribution: {text, url?}[], license?, sourceUrl? }` | Show `src` (16:9, `object-fit: cover`, lazy) |
| 204 | No photo | Show the category icon (current behaviour) |
| 404 | Unknown id | Same as 204 |

- Fast path, works offline: `import photos from "@/data/photos.json"`. If `photos[place.id]` exists,
  use `src` directly (served from `/photos/<id>.webp`, cached by the service worker) and skip the fetch.
  Call the API only for places not in that file, and only when `navigator.onLine`.
- **Attribution is required.**
  - Wikimedia: small caption under the photo, `"<author> · <license>"`, linking to `sourceUrl`.
  - Google: caption must include the text **"Google Maps"** plus every `attribution[].text` (link to `url` when present).
    Do not download, store or re-host Google photo URLs; they expire, so just render them.

## 2. Directions button (place sheet)

`POST /api/route`

```jsonc
// request
{ "origin": { "lat": 19.9477, "lng": 73.8421 }, "placeId": "ramkund", "mode": "walk", "lang": "mr-IN" }
// 200
{
  "placeId": "ramkund",
  "destination": { "lat": 20.007867, "lng": 73.791201 },
  "straightLine": { "distanceMeters": 8547, "bearingDeg": 322 },
  "route": {
    "mode": "walk", "language": "mr",
    "polyline": "<Google encoded polyline>",
    "distanceMeters": 9747, "durationSeconds": 8272,
    "distanceText": "९.७ किमी", "durationText": "2 तास 18 मि",
    "steps": [{ "instruction": "…", "maneuver": "TURN_LEFT", "distanceMeters": 35, "durationSeconds": 30, "distanceText": "३५ मी", "durationText": "…" }]
  }
}
// 503 (no key, Google error, timeout): same body without "route", plus "error"
```

Flow:
1. Tap **Directions** → `getCurrentPosition` (use `lib/geolocation.ts`). If denied, show the compass fallback without distance.
2. POST with `mode: "walk"` and the current UI language.
3. **200:** decode `route.polyline` (`google.maps.geometry.encoding.decodePath`, load the `geometry` library with
   `useMapsLibrary("geometry")`), draw a `google.maps.Polyline` in saffron (`--saffron`, weight 6, opacity 0.9),
   and `map.fitBounds()` over the path with sheet-height bottom padding.
   Card: `distanceText` · `durationText`, a Walk / Drive switch (re-POST with `mode: "drive"`), and the steps list.
   Instructions may contain `\n`, so render with `white-space: pre-line`.
4. Big **Start navigation** button → open in a new tab:
   `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG&travelmode=walking` (`driving` when on Drive).
5. **Offline / 503 / fetch error → "Head this way":**
   - Arrow rotated to `straightLine.bearingDeg - deviceHeading`.
   - Heading: `deviceorientationabsolute` (Android: `360 - e.alpha`), or `e.webkitCompassHeading` (iOS, after
     `DeviceOrientationEvent.requestPermission()` from the tap). No sensor: rotate by bearing only and add "(north is up)".
   - Straight-line distance: `straightLine.distanceMeters`. Offline with no response at all, compute it
     locally with `haversineKm` / `bearingDeg` from `lib/geo.ts`.
   - Label: "Head this way" / "या दिशेने जा" / "इस दिशा में जाएं". Keep **Start navigation** visible.
6. Clear the polyline when the sheet closes or another place is selected.

## 3. Voice: "how do I get to X"

`POST /api/ask` responses may now include:

```jsonc
{ "answer": "रामकुंड 9.7 किलोमीटर अंतरावर आहे, चालत सुमारे 2 तास 18 मिनिटे; …",
  "placeIds": ["ramkund"], "source": "offline",
  "directions": { "placeId": "ramkund", "mode": "walk", "distanceMeters": 9747, "durationSeconds": 8272 } }
```

When `directions` is present, select that place and open the Directions card (step 2) automatically.
Distance and time are only present when the pilgrim's location was sent and Google answered; otherwise the card
runs its own request or fallback. `useVoiceAssistant()` must pass `directions` through. That's a
`lib/voice` change, and Claude Code will add it on request.

Test at 375px: the card must not cover the route. Collapse the steps behind a "Steps (22)" toggle.
