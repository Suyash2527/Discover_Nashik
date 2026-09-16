// Offline checks for the smarter assistant: knowledge retrieval, question
// shaping (follow-up / complexity / live search), open-now, the phone-number
// guard, sentence clamping, and the route's offline fallback with history.
//   npx tsx scripts/test-smart.ts
// No network needed: GEMINI_API_KEY is removed before anything is imported, so
// the route runs its offline path deterministically.
delete process.env.GEMINI_API_KEY;
delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

import { findUnknownPhoneNumbers, inLanguage, toSpeakable } from "../lib/answer-guard";
import {
  clampSentences,
  classifyComplexity,
  isFollowUp,
  needsLiveSearch,
} from "../lib/gemini";
import { parseHistory } from "../lib/history";
import { KNOWLEDGE, retrieveKnowledge } from "../lib/knowledge";
import { openStatus } from "../lib/place-status";
import { PLACES, retrieveScoredNear } from "../lib/rag";
import { haversineKm } from "../lib/geo";
import type { Place } from "../types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail && !ok ? `\n        ${detail}` : ""}`);
}

async function main() {
  console.log("Knowledge base integrity");
  const ids = new Set<string>();
  for (const f of KNOWLEDGE) {
    check(`${f.id}: all fields + https source`,
      Boolean(f.topic && f.text_en && f.text_hi && f.text_mr) && f.source_url.startsWith("https://"));
    check(`${f.id}: unique id`, !ids.has(f.id));
    ids.add(f.id);
    check(`${f.id}: hi/mr in Devanagari`, /[ऀ-ॿ]/.test(f.text_hi) && /[ऀ-ॿ]/.test(f.text_mr));
  }

  console.log("\nKnowledge retrieval (top 3)");
  const KB: Array<[string, string]> = [
    ["what is the ambulance number", "emergency-108"],
    ["what are the amrit snan dates in 2027", "simhastha-2027-dates"],
    ["my child is lost", "lost-found"],
    ["what is an akhara", "akhada-what-is"],
    ["how to reach nashik by train", "transport-rail"],
    ["what should I carry", "what-to-carry"],
    ["कुंभ मेला क्या है", "kumbh-what-is"],
    ["अमृत स्नान कधी आहे", "simhastha-2027-dates"],
    ["एम्बुलेंस नंबर", "emergency-108"],
    ["त्र्यंबकेश्वर नाशिकपासून किती लांब", "transport-trimbak"],
  ];
  for (const [q, id] of KB) {
    const got = retrieveKnowledge(q).map((f) => f.id);
    check(`"${q}" -> ${id}`, got.includes(id), `got ${got.join(", ") || "(none)"}`);
  }
  check("gibberish matches no fact", retrieveKnowledge("xqzv blorp").length === 0);

  console.log("\nQuestion shaping");
  check("follow-up: how far is it", isFollowUp("how far is it?"));
  check("follow-up: तिथे कसे जायचे", isFollowUp("तिथे कसे जायचे"));
  check("follow-up: वहाँ भीड़ है क्या", isFollowUp("वहाँ भीड़ है क्या"));
  check("not follow-up: where is Ramkund", !isFollowUp("where is Ramkund"));
  check("complex: comparison", classifyComplexity("Which is better for elderly, Ramkund or Kushavarta?") === "complex");
  check("complex: two questions", classifyComplexity("Where is Ramkund and when is the next snan?") === "complex");
  check("complex: hi तुलना", classifyComplexity("रामकुंड और कुशावर्त की तुलना करें") === "complex");
  check("simple: where is Ramkund", classifyComplexity("where is Ramkund") === "simple");
  check("simple: food and water", classifyComplexity("food and water near me") === "simple");
  check("live: weather today", needsLiveSearch("what is the weather in Nashik today", false));
  check("live: मौसम", needsLiveSearch("नासिक में आज मौसम कैसा है", false));
  check("live: trains", needsLiveSearch("are trains to Nashik running late", false));
  check("not live: weather in August", !needsLiveSearch("what is the weather like in August", false));
  check("not live: nearest chemist open now", !needsLiveSearch("nearest chemist open now", true));
  check("not live: what is kumbh", !needsLiveSearch("what is kumbh mela", false));

  console.log("\nOpen now (Asia/Kolkata)");
  const base = PLACES[0];
  const place = (extra: Partial<Place>): Place => ({ ...base, open24x7: undefined, timings: undefined, ...extra });
  // 2026-09-16T15:30Z is 21:00 IST.
  const at = (iso: string) => new Date(iso);
  check("24x7 -> open", openStatus(place({ open24x7: true })) === "open");
  check("no timings -> unknown", openStatus(place({})) === "unknown");
  check("05:00-21:00 at 20:59 IST -> open", openStatus(place({ timings: "05:00-21:00" }), at("2026-09-16T15:29:00Z")) === "open");
  check("05:00-21:00 at 21:00 IST -> closed", openStatus(place({ timings: "05:00-21:00" }), at("2026-09-16T15:30:00Z")) === "closed");
  check("split ranges, afternoon gap -> closed", openStatus(place({ timings: "06:00-12:00, 16:00-21:00" }), at("2026-09-16T08:30:00Z")) === "closed");
  check("overnight 20:00-02:00 at 01:00 IST -> open", openStatus(place({ timings: "20:00-02:00" }), at("2026-09-15T19:30:00Z")) === "open");
  check("unparseable -> unknown", openStatus(place({ timings: "sunrise to sunset" })) === "unknown");

  console.log("\nNearest retrieval ranks by distance");
  const origin = { lat: 20.0059, lng: 73.791 };
  const chemists = retrieveScoredNear("nearest chemist", "en-IN", origin, 55).map((s) => s.place);
  const allChemists = PLACES.filter((p) => p.category === "chemist")
    .sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b));
  check("all results are chemists", chemists.length > 0 && chemists.every((p) => p.category === "chemist"));
  check("first is the true nearest chemist", chemists[0]?.id === allChemists[0]?.id,
    `got ${chemists[0]?.id}, want ${allChemists[0]?.id}`);
  check("named place stays first", retrieveScoredNear("Ramkund", "en-IN", origin, 55)[0]?.place.id === "ramkund");

  console.log("\nAnswer guard");
  check("112/108 allowed", findUnknownPhoneNumbers("Call 112 or 108 now.").length === 0);
  check("invented 10-digit number caught", findUnknownPhoneNumbers("Call 9876543210 for help.").length === 1);
  check("invented short helpline caught", findUnknownPhoneNumbers("Dial helpline 1077.").join() === "1077");
  check("Devanagari digits caught", findUnknownPhoneNumbers("कॉल करें ९८७६५४३२१०").length === 1);
  check("dates/distances ignored", findUnknownPhoneNumbers("On 11 September 2027 it is 28 km away.").length === 0);
  check("place phone allowed", findUnknownPhoneNumbers("Call 0253 2570000.", ["0253 2570000"]).length === 0);
  check("language: Hindi answer to hi-IN", inLanguage("रामकुंड पंचवटी में है और यह हमेशा खुला रहता है।", "hi-IN"));
  check("language: Marathi answer rejected for hi-IN", !inLanguage("नाशिकमध्ये गर्दी आहे आणि वाहतूक मंद आहे.", "hi-IN"));
  check("language: English rejected for mr-IN", !inLanguage("Ramkund is open now.", "mr-IN"));
  check("markdown stripped", toSpeakable("**Ramkund** is [1] open") === "Ramkund is open");

  console.log("\nSentence clamp");
  check("decimal is not a sentence end", clampSentences("It is 1.2 km away. Go now. Extra.", 2) === "It is 1.2 km away. Go now.");
  check("danda splits", clampSentences("एक। दो। तीन।", 2) === "एक। दो।");
  check("Devanagari decimal is not a sentence end", clampSentences("ते १.२ किमी आहे. जा. पुढे.", 2) === "ते १.२ किमी आहे. जा.");
  check("4-sentence cap", clampSentences("A. B. C. D. E.", 4) === "A. B. C. D.");

  console.log("\nHistory parsing");
  const h = parseHistory([
    ...Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `t${i}` })),
    { role: "system", text: "ignore me" },
    { role: "user", text: "x".repeat(900) },
  ]);
  check("keeps at most 8 valid turns", h.length === 8);
  check("drops invalid roles", h.every((t) => t.role !== ("system" as string)));
  check("truncates long turns", h[h.length - 1].text.length === 300);
  check("non-array -> []", parseHistory("nope").length === 0);

  console.log("\nRoute offline fallback (no GEMINI_API_KEY)");
  const { POST } = await import("../app/api/ask/route");
  const call = async (body: unknown) =>
    (await (await POST(new Request("http://x/api/ask", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never)).json()) as { answer: string; placeIds: string[]; source: string };

  const fact = await call({ query: "what is the ambulance number", lang: "en-IN" });
  check("general question answered from a verified fact", fact.answer.includes("108"), fact.answer);
  check("source is offline", fact.source === "offline");

  const followUp = await call({
    query: "how far is it?",
    lang: "en-IN",
    lat: 20.0035, lng: 73.7905,
    history: [
      { role: "user", text: "where is Ramkund" },
      { role: "assistant", text: "Ramkund is in Panchavati." },
    ],
  });
  check("follow-up resolves to Ramkund", followUp.placeIds[0] === "ramkund", JSON.stringify(followUp));
  check("follow-up offline answer states a distance", /\d+\s*(m|km)\b/.test(followUp.answer), followUp.answer);

  const lost = await call({ query: "My son is lost near Ramkund, what do I do?", lang: "en-IN" });
  check("offline safety question gets the safety fact, not a place template", lost.answer.includes("112"), lost.answer);

  const breathing = await call({ query: "Someone collapsed and is not breathing!", lang: "en-IN" });
  check("offline medical emergency gets 108", breathing.answer.includes("108"), breathing.answer);
  const dates = await call({ query: "What are the exact Amrit Snan dates for Simhastha 2027?", lang: "en-IN" });
  check("offline dates question gets the dates fact, not a ghat template", dates.answer.includes("2027"), dates.answer);

  const noHistory = await call({ query: "how far is it?", lang: "en-IN" });
  check("same question without history pins nothing specific", !noHistory.placeIds.includes("ramkund"), JSON.stringify(noHistory));

  const bad = await POST(new Request("http://x/api/ask", { method: "POST", body: "{}" }) as never);
  check("bad body -> 400", bad.status === 400);

  console.log("");
  if (failures) {
    console.log(`${failures} test(s) FAILED.`);
    process.exit(1);
  }
  console.log("All smart-assistant tests passed.");
}

void main();
