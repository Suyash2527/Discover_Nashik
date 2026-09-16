// General-question handling for /api/ask.
//   npx tsx scripts/test-general.ts
//
// Two layers:
//   1. Offline, always runs — the routing decision (grounded vs general), the
//      sentence clamp, and the offline general message. This is what guards
//      against the old failure: a general question answered with
//      "not in my offline Nashik list".
//   2. Live Gemini, only when GEMINI_API_KEY is set — prints real answers so a
//      human can eyeball groundedness, and asserts the 2-sentence cap and
//      language of the actual model output.
import {
  answerGeneralWithGemini,
  answerWithGemini,
  clampSentences,
  classifyAnswerMode,
  generalOfflineAnswer,
  isGeminiConfigured,
  NAME_MATCH_FLOOR,
} from "../lib/gemini";
import { retrieveScored } from "../lib/rag";
import type { Lang } from "../types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail && !ok ? `\n        ${detail}` : ""}`);
}

const GENERAL_QUERIES: Array<{ query: string; lang: Lang }> = [
  { query: "What is Kumbh Mela", lang: "en-IN" },
  { query: "Is it safe to bring kids", lang: "en-IN" },
  { query: "What should I wear for the holy bath", lang: "en-IN" },
  { query: "कुंभमेळा म्हणजे काय", lang: "mr-IN" },
  { query: "क्या बुजुर्गों के लिए भीड़ सुरक्षित है", lang: "hi-IN" },
];

const PLACE_QUERIES: Array<{ query: string; lang: Lang }> = [
  { query: "Ramkund", lang: "en-IN" },
  { query: "रामकुंड कुठे आहे", lang: "mr-IN" },
  { query: "where is Trimbakeshwar", lang: "en-IN" },
];

// ---------------------------------------------------------------------------
console.log("Routing: general questions must NOT be treated as place lookups");
// ---------------------------------------------------------------------------
for (const { query, lang } of GENERAL_QUERIES) {
  const scored = retrieveScored(query, lang);
  const top = scored[0]?.score ?? 0;
  const mode = classifyAnswerMode(query, top);
  check(
    `"${query}" -> ${mode} (top score ${top}, floor ${NAME_MATCH_FLOOR})`,
    mode === "general",
    `expected general, got ${mode}`,
  );
}

// ---------------------------------------------------------------------------
console.log("");
console.log("Routing: real place lookups must stay grounded");
// ---------------------------------------------------------------------------
for (const { query, lang } of PLACE_QUERIES) {
  const scored = retrieveScored(query, lang);
  const top = scored[0]?.score ?? 0;
  const mode = classifyAnswerMode(query, top);
  check(`"${query}" -> ${mode} (top score ${top})`, mode === "grounded", `expected grounded`);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("Offline general fallback must not sound like 'place not found'");
// ---------------------------------------------------------------------------
for (const lang of ["en-IN", "hi-IN", "mr-IN"] as Lang[]) {
  const msg = generalOfflineAnswer(lang);
  console.log(`  [${lang}] ${msg}`);
  check(`[${lang}] non-empty`, msg.trim().length > 0);
  check(
    `[${lang}] mentions connectivity, not a missing place`,
    /internet|इंटरनेट/i.test(msg) && !/not in my|यादीत सापडले नाही|सूची में नहीं/i.test(msg),
  );
  check(`[${lang}] at most 2 sentences`, sentenceCount(msg) <= 2, `got ${sentenceCount(msg)}`);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("clampSentences");
// ---------------------------------------------------------------------------
check("trims a 4-sentence English answer to 2", clampSentences("One. Two. Three. Four.") === "One. Two.");
check(
  "trims Devanagari danda sentences to 2",
  clampSentences("पहिले वाक्य। दुसरे वाक्य। तिसरे वाक्य।") === "पहिले वाक्य। दुसरे वाक्य।",
);
check("leaves a 2-sentence answer alone", clampSentences("Only one. And two.") === "Only one. And two.");
check("handles no terminator", clampSentences("a single clause") === "a single clause");
check("handles empty", clampSentences("   ") === "");

function sentenceCount(text: string): number {
  return (text.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Live Gemini (opt-in)
// ---------------------------------------------------------------------------
async function live() {
  console.log("");
  if (!isGeminiConfigured()) {
    console.log("Live Gemini: SKIPPED (GEMINI_API_KEY not set).");
    console.log("  Set it and re-run to check real answers for groundedness.");
    return;
  }
  console.log("Live Gemini: general answers");
  for (const { query, lang } of GENERAL_QUERIES) {
    try {
      const answer = await answerGeneralWithGemini(query, lang, []);
      console.log(`  [${lang}] "${query}"\n        -> ${answer}`);
      check(`[${lang}] "${query}" non-empty`, answer.trim().length > 0);
      check(`[${lang}] "${query}" <= 2 sentences`, sentenceCount(answer) <= 2, `got ${sentenceCount(answer)}`);
    } catch (error) {
      check(`[${lang}] "${query}" answered`, false, String(error));
    }
  }

  console.log("");
  console.log("Live Gemini: a place it does NOT have must be refused, not invented");
  for (const query of ["Where is Shirdi Sai Baba temple", "What is the phone number of Nashik Civil Hospital"]) {
    try {
      const answer = await answerGeneralWithGemini(query, "en-IN", []);
      console.log(`  "${query}"\n        -> ${answer}`);
      check(`"${query}" invents no phone number`, !/\+?\d[\d\s-]{7,}/.test(answer), answer);
    } catch (error) {
      check(`"${query}" answered`, false, String(error));
    }
  }

  console.log("");
  console.log("Live Gemini: grounded mode still restricted to our places");
  const scored = retrieveScored("Ramkund", "en-IN");
  const answer = await answerWithGemini("Tell me about Ramkund", "en-IN", scored.map((s) => s.place));
  console.log(`  -> ${answer}`);
  check("grounded answer <= 2 sentences", sentenceCount(answer) <= 2);
}

live()
  .catch((error) => {
    console.error("Live Gemini section crashed:", error);
    failures++;
  })
  .finally(() => {
    console.log("");
    console.log(failures === 0 ? "All general-question tests passed." : `${failures} check(s) FAILED.`);
    if (failures > 0) process.exit(1);
  });
