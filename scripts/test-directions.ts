// Offline checks for directions + place photos.
//   npx tsx scripts/test-directions.ts
// No network: the Google server key is removed before anything is imported, so
// the routes exercise their "unavailable" paths deterministically.
delete process.env.GOOGLE_MAPS_SERVER_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

import { existsSync } from "node:fs";
import {
  buildRoutesBody,
  directionsAnswer,
  isDirectionsQuestion,
  parseDuration,
  parseMode,
  parseRoutesResponse,
  routeLanguage,
  straightLine,
} from "../lib/directions";
import { WIKIMEDIA_PHOTOS, googlePhoto, wikimediaPhoto } from "../lib/place-photos";
import { PLACES } from "../lib/rag";
import { POST as ask } from "../app/api/ask/route";
import { GET as placePhoto } from "../app/api/place-photo/route";
import { POST as route } from "../app/api/route/route";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail && !ok ? `\n        ${detail}` : ""}`);
}

const NASHIK_ROAD_STATION = { lat: 19.9477, lng: 73.8421 };
const ramkund = PLACES.find((p) => p.id === "ramkund")!;

async function main() {
  console.log("Directions intent");
  for (const q of [
    "how do I get to Ramkund", "directions to Kalaram Mandir", "take me to Ramkund",
    "रामकुंड कैसे जाएं", "रामकुंड का रास्ता बताओ", "ramkund kaise jaye",
    "रामकुंडला कसे जायचे", "रामकुंडचा रस्ता सांगा", "ramkund la kasa jaycha",
  ]) check(`directions: "${q}"`, isDirectionsQuestion(q));
  for (const q of ["where is Ramkund", "how far is Ramkund", "रामकुंड कुठे आहे", "nearest toilet", "is Ramkund open"]) {
    check(`not directions: "${q}"`, !isDirectionsQuestion(q));
  }

  console.log("Request shaping");
  const walk = buildRoutesBody(NASHIK_ROAD_STATION, ramkund, "walk", "mr");
  check("walk -> WALK, no routingPreference", walk.travelMode === "WALK" && !("routingPreference" in walk));
  const drive = buildRoutesBody(NASHIK_ROAD_STATION, ramkund, "drive", "en");
  check("drive -> DRIVE, traffic aware", drive.travelMode === "DRIVE" && drive.routingPreference === "TRAFFIC_AWARE");
  check("language mapping", routeLanguage("mr-IN") === "mr" && routeLanguage("hi-IN") === "hi" && routeLanguage("fr") === "en" && routeLanguage(undefined) === "en");
  check("mode defaults to walk", parseMode(undefined) === "walk" && parseMode("fly") === "walk" && parseMode("drive") === "drive");
  check("duration parse", parseDuration("754s") === 754 && parseDuration("12.6s") === 13 && parseDuration(undefined) === 0);

  console.log("Response parsing");
  const parsed = parseRoutesResponse({
    routes: [{
      distanceMeters: 8123, duration: "6000s", polyline: { encodedPolyline: "abc" },
      localizedValues: { distance: { text: "8.1 km" }, duration: { text: "1 hour 40 mins" } },
      legs: [{ steps: [
        { distanceMeters: 100, staticDuration: "80s", navigationInstruction: { maneuver: "DEPART", instructions: "Head north" }, localizedValues: { distance: { text: "100 m" } } },
        { distanceMeters: 5, staticDuration: "4s" },
      ] }],
    }],
  }, "walk", "en");
  check("parses totals", parsed?.distanceMeters === 8123 && parsed.durationSeconds === 6000 && parsed.polyline === "abc");
  check("keeps steps with instructions only", parsed?.steps.length === 1 && parsed.steps[0].instruction === "Head north" && parsed.steps[0].distanceText === "100 m");
  check("empty response -> null", parseRoutesResponse({}, "walk", "en") === null);

  const line = straightLine(NASHIK_ROAD_STATION, ramkund);
  check("straight line station -> Ramkund ~8-10 km, heading west-ish", line.distanceMeters > 7000 && line.distanceMeters < 11000 && line.bearingDeg > 200 && line.bearingDeg < 340, JSON.stringify(line));

  console.log("Spoken answer");
  const en = directionsAnswer("Ramkund", { distanceMeters: 8123, durationSeconds: 6000, mode: "walk" }, "en-IN");
  check("en: distance + time", en.includes("8.1 km") && en.includes("1 hr 40 min") && en.includes("on foot"), en);
  const mr = directionsAnswer("रामकुंड", { distanceMeters: 450, durationSeconds: 300, mode: "walk" }, "mr-IN");
  check("mr: Devanagari, metres, minutes", mr.includes("450 मीटर") && mr.includes("5 मिनिटे"), mr);
  check("one sentence", en.split(/[.!?।](?:\s|$)/).filter((s) => s.trim()).length === 1, en);

  console.log("POST /api/route");
  const call = (body: unknown) => route(new Request("http://x/api/route", { method: "POST", body: JSON.stringify(body) }) as never);
  check("bad body -> 400", (await call({ origin: { lat: "x" }, placeId: "ramkund" })).status === 400);
  check("unknown place -> 400", (await call({ origin: NASHIK_ROAD_STATION, placeId: "nope" })).status === 400);
  const noKey = await call({ origin: NASHIK_ROAD_STATION, placeId: "ramkund" });
  const noKeyJson = await noKey.json();
  check("no key -> 503 with straightLine fallback", noKey.status === 503 && noKeyJson.straightLine?.distanceMeters > 0, JSON.stringify(noKeyJson));

  console.log("POST /api/ask directions hint");
  const askRes = await ask(new Request("http://x/api/ask", {
    method: "POST",
    body: JSON.stringify({ query: "how do I get to Ramkund", lang: "en-IN", ...NASHIK_ROAD_STATION }),
  }) as never);
  const askJson = await askRes.json();
  check("offline: directions hint for Ramkund, answer still given", askJson.directions?.placeId === "ramkund" && askJson.answer.length > 0, JSON.stringify(askJson));
  const suffixed = await (await ask(new Request("http://x/api/ask", { method: "POST", body: JSON.stringify({ query: "रामकुंडला कसे जायचे", lang: "mr-IN", ...NASHIK_ROAD_STATION }) }) as never)).json();
  check("mr case suffix (रामकुंडला) still gets the Ramkund hint", suffixed.directions?.placeId === "ramkund", JSON.stringify(suffixed));
  const plain = await (await ask(new Request("http://x/api/ask", { method: "POST", body: JSON.stringify({ query: "where is Ramkund", lang: "en-IN" }) }) as never)).json();
  check("no hint for a plain where-is", plain.directions === undefined, JSON.stringify(plain));

  console.log("Photos");
  for (const [id, p] of Object.entries(WIKIMEDIA_PHOTOS)) {
    check(`${id}: known place, file on disk, attribution`,
      PLACES.some((pl) => pl.id === id) && existsSync(`public${p.src}`) && Boolean(p.author && p.license && p.sourceUrl.startsWith("https://commons.wikimedia.org/")));
  }
  check("wikimedia lookup returns attribution", Object.keys(WIKIMEDIA_PHOTOS).every((id) => wikimediaPhoto(id)?.attribution[0].text));
  const noPhotoPlace = PLACES.find((p) => !WIKIMEDIA_PHOTOS[p.id])!;
  check("google fallback without key -> null", (await googlePhoto(noPhotoPlace)) === null);
  const photoRes = await placePhoto({ nextUrl: new URL(`http://x/api/place-photo?id=${noPhotoPlace.id}`) } as never);
  check("GET /api/place-photo without photo -> 204", photoRes.status === 204);
  const missing = await placePhoto({ nextUrl: new URL("http://x/api/place-photo?id=nope") } as never);
  check("GET /api/place-photo unknown id -> 404", missing.status === 404);

  console.log(failures ? `\n${failures} directions/photo test(s) failed.` : "\nAll directions and photo tests passed.");
  process.exit(failures ? 1 : 0);
}

main();
