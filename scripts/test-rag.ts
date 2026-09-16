// Smoke-test retrieval + the offline answer templates.
//   npx tsx scripts/test-rag.ts
// No network, no API key, no build step required.
import { answerOffline } from "../lib/intent-offline";
import { detectCategoryIntents, PLACES, retrieveScored } from "../lib/rag";
import { CATEGORIES, type Category, type Lang } from "../types";

interface Case { query: string; lang: Lang; note?: string; lat?: number; lng?: number }

// Ramkund, for the "nearest" cases that need an origin.
const ORIGIN = { lat: 20.0059, lng: 73.791 };

const CASES: Case[] = [
  { query: "Ramkund", lang: "en-IN", note: "exact name" },
  { query: "Trimbak", lang: "en-IN", note: "partial / prefix of Trimbakeshwar" },
  { query: "nearest hospital", lang: "en-IN", note: "category intent, en", ...ORIGIN },
  { query: "जवळचे हॉस्पिटल", lang: "mr-IN", note: "category intent, mr", ...ORIGIN },
  { query: "रामकुंड कुठे आहे", lang: "mr-IN", note: "name inside a question, mr" },
  { query: "रामकुंड कहाँ है?", lang: "hi-IN", note: "name inside a question, hi" },
  { query: "ramkond", lang: "en-IN", note: "misspelling of Ramkund" },
  { query: "kalaram mandhir", lang: "en-IN", note: "misspelling of Kalaram Mandir" },
  { query: "trimbakeshwer temple", lang: "en-IN", note: "misspelling + category word" },
  { query: "where can I stay in Panchavati", lang: "en-IN", note: "category + area" },
  { query: "पिण्याचे पाणी कुठे मिळेल", lang: "mr-IN", note: "water category, mr" },
  { query: "पास में पुलिस स्टेशन", lang: "hi-IN", note: "police category, hi", ...ORIGIN },
  { query: "औषध दुकान", lang: "mr-IN", note: "chemist category, mr" },
  { query: "godavari ghat", lang: "en-IN", note: "ghat category + river alias" },
  { query: "xyzzy plutonium mines", lang: "en-IN", note: "no match — must degrade gracefully" },
];

console.log(`Loaded ${PLACES.length} places from data/places.json`);
console.log(`Categories present: ${[...new Set(PLACES.map((p) => p.category))].sort().join(", ")}`);
console.log(`Running ${CASES.length} retrieval cases\n`);

let noMatch = 0;

for (const [i, c] of CASES.entries()) {
  const origin = c.lat !== undefined && c.lng !== undefined ? { lat: c.lat, lng: c.lng } : undefined;
  const scored = retrieveScored(c.query, c.lang);
  const places = scored.map((s) => s.place);
  if (places.length === 0) noMatch++;

  console.log(`${String(i + 1).padStart(2)}. "${c.query}"  [${c.lang}]${c.note ? `  — ${c.note}` : ""}`);
  console.log(`    origin: ${origin ? `${origin.lat},${origin.lng}` : "(none)"}`);

  if (scored.length === 0) {
    console.log("    hits:   (none)");
  } else {
    for (const { place, score } of scored) {
      console.log(
        `    hit:    ${String(score).padStart(6)}  ${place.id}  (${place.category}, ${place.area})`,
      );
    }
  }
  console.log(`    ids:    [${places.map((p) => p.id).join(", ")}]`);
  console.log(`    offline: ${answerOffline(c.query, c.lang, places, origin)}\n`);
}

console.log(`Done. ${CASES.length - noMatch}/${CASES.length} cases returned at least one place.`);
console.log(`(The one intentional nonsense query is expected to return none.)`);

// ---------------------------------------------------------------------------
// Category-intent map. data/places.json currently has only ghat/temple places,
// so retrieval cannot exercise the other eight categories. Assert the keyword
// map directly so the map is proven correct ahead of the real dataset.
// ---------------------------------------------------------------------------
const INTENT_PROBES: Array<{ query: string; expect: Category }> = [
  { query: "काळाराम मंदिर", expect: "temple" },
  { query: "godavari ghat", expect: "ghat" },
  { query: "dharamshala near ramkund", expect: "stay" },
  { query: "कुठे जेवण मिळेल", expect: "food" },
  { query: "गाडी पार्किंग", expect: "parking" },
  { query: "nearest hospital", expect: "hospital" },
  { query: "जवळचे रुग्णालय", expect: "hospital" },
  { query: "दवाखाना कहाँ है", expect: "hospital" },
  { query: "पास में पुलिस स्टेशन", expect: "police" },
  { query: "पोलीस ठाणे", expect: "police" },
  { query: "public toilet", expect: "toilet" },
  { query: "शौचालय कुठे आहे", expect: "toilet" },
  { query: "पिण्याचे पाणी कुठे मिळेल", expect: "water" },
  { query: "औषध दुकान", expect: "chemist" },
  { query: "medical store nearby", expect: "chemist" },
  { query: "hosptal", expect: "hospital" },
];

console.log("");
console.log("Category-intent probes");
let intentFailures = 0;
for (const { query, expect } of INTENT_PROBES) {
  const got = detectCategoryIntents(query);
  const ok = got.has(expect);
  if (!ok) intentFailures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  "${query}" -> {${[...got].join(", ") || "-"}}  expected ${expect}`,
  );
}

const uncovered = CATEGORIES.filter((c) => !INTENT_PROBES.some((p) => p.expect === c));
if (uncovered.length) console.log(`  note: no probe for ${uncovered.join(", ")}`);

console.log("");
console.log(`${INTENT_PROBES.length - intentFailures}/${INTENT_PROBES.length} intent probes passed.`);
if (intentFailures > 0) process.exit(1);
