// "How far is it" — the path from a GPS fix to a spoken distance.
//   npx tsx scripts/test-distance.ts
//
// This flow was dead code until the hook started sending coordinates: geo.ts
// could measure, intent-offline.ts could phrase it and /api/ask could parse
// lat/lng, but nothing ever called navigator.geolocation, so `origin` was
// always undefined and every "how far" answer was a description instead.
//
// Covered here: the routing decision, the distance arithmetic, and the offline
// phrasing in all three languages. The browser half (permission prompts, the
// warm-on-tap timing) is verified by hand — see lib/geolocation.ts.
import { asksDistance, classifyAnswerMode } from "../lib/gemini";
import { formatDistanceKm, haversineKm } from "../lib/geo";
import { answerOffline } from "../lib/intent-offline";
import { retrieveScored } from "../lib/rag";
import type { Lang } from "../types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail && !ok ? `\n        ${detail}` : ""}`);
}

/** Nashik CBS bus stand — where a pilgrim arriving by road actually stands. */
const CBS = { lat: 19.9975, lng: 73.7898 };

// ---------------------------------------------------------------------------
console.log("Distance intent is recognised in all three languages");
// ---------------------------------------------------------------------------
const ASKS: Array<[string, boolean]> = [
  ["how far is Ramkund", true],
  ["how far away is the temple", true],
  ["what is the distance to Trimbakeshwar", true],
  ["how do I reach Kalaram", true],
  ["रामकुंड कितनी दूर है", true],
  ["त्र्यंबकेश्वर किती लांब आहे", true],
  ["काळाराम मंदिर किती दूर आहे", true],
  ["रामकुंड की दूरी", true],
  // Must NOT fire: these are quantity or advice questions, not distance ones.
  ["how much water should I carry", false],
  ["कितना पानी लाना चाहिए", false],
  ["किती वाजता उघडते", false],
  ["what is Kumbh Mela", false],
  ["where is Ramkund", false],
];
for (const [q, expected] of ASKS) {
  check(`"${q}" -> ${expected ? "distance" : "not distance"}`, asksDistance(q) === expected);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("A distance question is never routed to general mode");
// ---------------------------------------------------------------------------
// The regression: a place name diluted by surrounding words scores below
// NAME_MATCH_FLOOR, then matches a general marker (किती / how) and gets
// answered "I need an internet connection" — throwing away a correct hit.
const ROUTING: Array<{ query: string; lang: Lang }> = [
  { query: "त्र्यंबकेश्वर किती लांब आहे", lang: "mr-IN" },
  { query: "रामकुंड कितनी दूर है", lang: "hi-IN" },
  { query: "how far is Trimbakeshwar", lang: "en-IN" },
  { query: "काळाराम मंदिर किती लांब आहे", lang: "mr-IN" },
];
for (const { query, lang } of ROUTING) {
  const scored = retrieveScored(query, lang);
  const top = scored[0]?.score ?? 0;
  check(
    `[${lang}] "${query}" retrieves a place`,
    scored.length > 0,
    "retrieval returned nothing, so routing cannot be judged",
  );
  check(
    `[${lang}] "${query}" -> grounded (top=${Math.round(top)})`,
    classifyAnswerMode(query, top) === "grounded",
    `got ${classifyAnswerMode(query, top)}`,
  );
}

// ---------------------------------------------------------------------------
console.log("");
console.log("Distance arithmetic and spoken formatting");
// ---------------------------------------------------------------------------
const ramkund = retrieveScored("Ramkund", "en-IN")[0]?.place;
check("Ramkund is in the dataset", Boolean(ramkund));
if (ramkund) {
  const km = haversineKm(CBS, ramkund);
  // CBS to Ramkund is a little under a kilometre in a straight line.
  check(`CBS -> Ramkund is 0.5-1.5 km (got ${km.toFixed(2)})`, km > 0.5 && km < 1.5);

  const near = formatDistanceKm(km);
  check(`sub-kilometre formats as metres (got ${near.value} ${near.unit})`, near.unit === "m");
  check("metres are rounded to a speakable 10", near.value % 10 === 0);

  const far = formatDistanceKm(28.4);
  check(`long distance stays km (got ${far.value} ${far.unit})`, far.unit === "km");

  // Zero distance must not produce "0 m" — formatDistanceKm floors at 10 m,
  // because "you are 0 metres away" is not something to say to a person.
  check("standing on the spot floors at 10 m", formatDistanceKm(0).value === 10);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("Offline answers carry the distance, in the pilgrim's language");
// ---------------------------------------------------------------------------
// This is the no-network path: no Gemini, pure templates. It must still answer
// "how far" with a number, because GPS works with no connection at all.
// `lead` is distancePhrase()'s opening word in each language. Asserting on it
// rather than on the unit: "m" is a substring of Ramkund and Panchavati, so a
// naive unit check passes on text containing no distance at all.
const OFFLINE: Array<{ query: string; lang: Lang; unit: string; lead: string }> = [
  { query: "how far is Ramkund", lang: "en-IN", unit: "m", lead: "about" },
  { query: "रामकुंड कितनी दूर है", lang: "hi-IN", unit: "मीटर", lead: "लगभग" },
  { query: "रामकुंड किती लांब आहे", lang: "mr-IN", unit: "मीटर", lead: "सुमारे" },
];
for (const { query, lang, unit, lead } of OFFLINE) {
  const places = retrieveScored(query, lang).map((s) => s.place);
  const withFix = answerOffline(query, lang, places, CBS);
  const without = answerOffline(query, lang, places);

  console.log(`  [${lang}] ${withFix}`);
  check(`[${lang}] states a distance when we have a fix`, withFix.includes(unit), withFix);
  check(`[${lang}] leads with "${lead}"`, withFix.includes(lead), withFix);
  check(`[${lang}] states a number when we have a fix`, /\d/.test(withFix), withFix);
  // The honest half: no fix means no distance, never a guessed one.
  check(`[${lang}] omits the distance with no fix`, !without.includes(lead), without);
  check(`[${lang}] still answers with no fix`, without.trim().length > 0);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("Nearest-of-category re-ranks by real distance");
// ---------------------------------------------------------------------------
// Far from Panchavati: whatever "nearest" returns must be the closest of the
// candidates, not simply the best-scoring one.
const FAR = { lat: 19.9387, lng: 73.7489 };
const ghats = retrieveScored("nearest ghat", "en-IN").map((s) => s.place);
if (ghats.length > 1) {
  const answer = answerOffline("nearest ghat", "en-IN", ghats, FAR);
  const closest = [...ghats].sort((a, b) => haversineKm(FAR, a) - haversineKm(FAR, b))[0];
  console.log(`  ${answer}`);
  check("names the genuinely closest candidate", answer.includes(closest.name.en), answer);
} else {
  console.log("  (skipped: fewer than two ghats in the dataset)");
}

console.log("");
console.log(failures === 0 ? "All distance tests passed." : `${failures} test(s) FAILED.`);
if (failures > 0) process.exit(1);
