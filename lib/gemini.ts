// Thin wrapper around @google/genai. Server-only: GEMINI_API_KEY must never
// reach the client, so this module is imported exclusively from app/api/.
//
// Two answering modes:
//   grounded — retrieval found the place the pilgrim named. Answer from it.
//   general  — no place named. Gemini may use general Kumbh/Nashik knowledge
//              plus the verified FACTS from data/kumbh-knowledge.json, but may
//              never invent place names, phone numbers, prices or dates.
//
// On top of that, each question is shaped (simple/complex, live or not) to pick
// a model path — see answerSmart(). Simple answers are capped at 2 sentences,
// complex ones at 4, always in the request language.
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Advisory, Lang, Place } from "@/types";
import { findUnknownPhoneNumbers, inLanguage, toSpeakable } from "./answer-guard";
import { formatDistanceKm, haversineKm, type LatLng } from "./geo";
import type { HistoryTurn } from "./history";
import { factText, retrieveKnowledge, type KnowledgeFact } from "./knowledge";
import { istClock, openStatus, type OpenStatus } from "./place-status";
import { normalize } from "./text";

/**
 * Pinned, not "latest": a silent upstream model swap could change latency or
 * tone mid-Kumbh. gemini-2.0-flash was retired (the API now 404s on it and
 * points here), so this is the current free-tier flash model.
 * gemini-flash-latest also works but measured ~3x slower — too slow for the
 * GEMINI_TIMEOUT_MS budget in app/api/ask.
 */
const DEFAULT_MODEL = "gemini-3.6-flash";

type LangKey = "en" | "hi" | "mr";

const langKey = (lang: Lang): LangKey =>
  lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en";

const LANG_NAME: Record<Lang, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi (हिंदी, Devanagari script)",
  "mr-IN": "Marathi (मराठी, Devanagari script)",
};

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Shout once, at import time, if there is no key.
 *
 * Without this the degradation is silent by design: app/api/ask checks
 * isGeminiConfigured() and quietly serves offline templates, which look like
 * real answers. A missing key on Vercel therefore ships an assistant that has
 * no intelligence at all and never says so. This module is imported only from
 * app/api/, so the warning lands in the server log at boot, not in the browser.
 *
 * Module scope, not inside the request handler: once per process beats once per
 * question, and it fires before the first pilgrim asks anything.
 */
if (!isGeminiConfigured()) {
  console.warn(
    "[gemini] GEMINI_API_KEY is not set — /api/ask will answer from offline " +
      "templates only. Live answers, and every general (non-place) question, " +
      "will be degraded. Set GEMINI_API_KEY in .env.local or the Vercel " +
      "project environment.",
  );
} else {
  console.info(
    `[gemini] GEMINI_API_KEY loaded; model ${process.env.GEMINI_MODEL || DEFAULT_MODEL}`,
  );
}

// ---------------------------------------------------------------------------
// Mode selection
// ---------------------------------------------------------------------------

export type AnswerMode = "grounded" | "general";

/**
 * Retrieval score at or above which we treat the query as naming a real place.
 *
 * From lib/rag.ts scoring: an exact name is 100, a name contained in the query
 * is ~70, a name containing the query ~55. A category-intent hit alone is 45,
 * and loose token/fuzzy overlap lands below that. So 55 is the line between
 * "the pilgrim said a place name" and "we only matched a category word" —
 * which is exactly the distinction between grounded and general answering.
 */
export const NAME_MATCH_FLOOR = 55;

/**
 * Words that mark a question as general advice rather than "where is X".
 * Multilingual, and matched on normalised text so Devanagari marks survive.
 */
const GENERAL_MARKERS = [
  // English
  "what is", "what are", "whats", "why", "when is", "how do", "how can",
  "how much", "should i", "can i", "is it safe", "safe to", "advice",
  "custom", "customs", "tradition", "rules", "weather", "hot", "cold", "rain",
  "crowd", "kids", "children", "elderly", "baby", "what to wear", "wear",
  "carry", "bring", "avoid", "tips", "history", "meaning", "significance",
  "dates", "why is", "tell me about",
  // Hindi
  "क्या है", "क्यों", "कब", "कैसे", "कितना", "क्या मैं", "सुरक्षित",
  "सुरक्षा", "रीति", "परंपरा", "नियम", "मौसम", "गर्मी", "ठंड", "बारिश",
  "भीड़", "बच्चे", "बच्चों", "बुजुर्ग", "बुजुर्गों", "क्या पहनें", "पहनना",
  "सलाह", "इतिहास", "महत्व", "बताइए", "बताओ",
  // Marathi
  "काय आहे", "म्हणजे काय", "का", "कधी", "कसे", "कसं", "किती", "सुरक्षित",
  "सुरक्षा", "रीत", "परंपरा", "नियम", "हवामान", "उन्हाळा", "थंडी", "पाऊस",
  "गर्दी", "मुले", "मुलांना", "वृद्ध", "काय घालावे", "घालावे", "सल्ला",
  "इतिहास", "महत्त्व", "सांगा",
];

/**
 * Phrases that ask "how far / how near / what distance".
 *
 * Multi-word on purpose. The bare quantifiers किती and कितना are already
 * GENERAL_MARKERS ("how much should I carry"), so only the distance-bearing
 * pairs belong here — otherwise every "how many" question would be dragged
 * into place mode.
 */
const DISTANCE_MARKERS = [
  // English
  "how far", "how near", "how close", "how long from", "distance to",
  "distance from", "far is", "far away", "how do i reach", "how to reach",
  "how do i get to", "way to",
  // Hindi
  "कितनी दूर", "कितना दूर", "दूरी", "कितने किलोमीटर", "कैसे पहुंचें",
  "कैसे पहुँचें", "कैसे जाऊं", "रास्ता",
  // Marathi
  "किती लांब", "किती दूर", "अंतर", "किती किलोमीटर", "कसे जायचे",
  "कसं जायचं", "कुठून जायचे", "वाट",
];

/**
 * Is this a "how far is X" question?
 *
 * Kept separate from looksGeneral() because it outranks it: distance is the one
 * thing a pilgrim asks that general knowledge can NEVER supply. See
 * classifyAnswerMode().
 */
export function asksDistance(query: string): boolean {
  const q = ` ${normalize(query)} `;
  return DISTANCE_MARKERS.some((marker) => q.includes(` ${normalize(marker)}`));
}

function looksGeneral(query: string): boolean {
  const q = ` ${normalize(query)} `;
  return GENERAL_MARKERS.some((marker) => q.includes(` ${normalize(marker)}`));
}

/**
 * Decide how to answer.
 *
 * - No places at all -> general.
 * - A confident place-name hit -> grounded, even if phrased as a question
 *   ("what is Ramkund" should still answer from our Ramkund entry).
 * - Places found only via a category word, on an advice-shaped question
 *   ("what should I wear at the ghats") -> general, with those places offered
 *   as optional context rather than as the only permitted facts.
 */
export function classifyAnswerMode(query: string, topScore: number): AnswerMode {
  if (topScore <= 0) return "general";
  if (topScore >= NAME_MATCH_FLOOR) return "grounded";

  // A distance question is always about a place, so if retrieval found
  // ANYTHING it must be answered from it. Without this, "त्र्यंबकेश्वर किती
  // लांब आहे" scored 40 — the name diluted by three surrounding words — then
  // matched the general marker किती and was answered "I need an internet
  // connection", discarding the trimbakeshwar-temple hit retrieval had already
  // made. There is no general-knowledge answer to "how far is it from me".
  if (asksDistance(query)) return "grounded";

  return looksGeneral(query) ? "general" : "grounded";
}


// ---------------------------------------------------------------------------
// Question shape: follow-up, complexity, live conditions
// ---------------------------------------------------------------------------

/** Whole-token (or whole-phrase) match of any marker against padded, normalised text. */
const hasAny = (paddedQuery: string, list: string[]) =>
  list.some((m) => {
    const n = normalize(m);
    return n !== "" && paddedQuery.includes(` ${n} `);
  });

/**
 * Words that point back at something said earlier: "how far is IT", "is THAT
 * one open", "वहाँ कैसे जाएं", "तिथे किती गर्दी आहे".
 */
const FOLLOW_UP_WORDS = [
  // English
  "it", "its", "there", "that", "this", "those", "them", "they", "that one",
  "the first", "the second", "the other", "same place",
  // Hindi
  "वह", "वो", "वहाँ", "वहां", "उसका", "उसकी", "उसके", "उस", "इसका", "इसकी",
  "यह", "ये", "उनमें", "पहला", "दूसरा",
  // Marathi
  "ते", "ती", "तो", "तिथे", "तेथे", "त्याचे", "त्याची", "त्याला", "तिकडे",
  "पहिले", "दुसरे",
];

/** A short question leaning on an earlier turn for its subject. */
export function isFollowUp(query: string): boolean {
  const q = ` ${normalize(query)} `;
  return q.trim().split(" ").length <= 10 && hasAny(q, FOLLOW_UP_WORDS);
}

/**
 * Markers of a question that needs reasoning, not a lookup: comparisons,
 * planning, trade-offs. Any one routes to the stronger model; so does a long
 * or visibly multi-part question.
 */
const COMPLEX_MARKERS = [
  // English
  "compare", "comparison", "versus", "vs", "better", "best way", "difference", "should i", "plan", "itinerary", "step by step",
  "why", "explain", "what if", "pros and cons", "both", "as well as",
  "safest", "cheapest", "fastest",
  // Hindi
  "तुलना", "बेहतर", "फर्क", "योजना", "क्यों", "समझाइए",
  "दोनों", "सबसे सुरक्षित", "या फिर",
  // Marathi
  "चांगले", "फरक", "नियोजन", "समजावून", "दोन्ही",
  "सर्वात सुरक्षित",
];

export type Complexity = "simple" | "complex";

export function classifyComplexity(query: string): Complexity {
  const q = ` ${normalize(query)} `;
  const words = q.trim().split(" ").length;
  const questionMarks = (query.match(/\?/g) ?? []).length;
  // Two questions joined: "where is Ramkund and when is the next snan". A bare
  // "and" is too common ("food and water") to count on its own.
  const joinedQuestions =
    / (where|when|how|what|which|is|can|do) .+ (and|also) .*(where|when|how|what|which|is|can|do) /.test(q) ||
    /(कहाँ|कहां|कब|कैसे|क्या|कितनी).+ और .+(कहाँ|कहां|कब|कैसे|क्या|कितनी)/.test(q) ||
    /(कुठे|कधी|कसे|काय|किती).+ आणि .+(कुठे|कधी|कसे|काय|किती)/.test(q);

  if (questionMarks >= 2 || joinedQuestions || words > 16) return "complex";
  return hasAny(q, COMPLEX_MARKERS) ? "complex" : "simple";
}

/** Topics that are only answerable with live data. */
const LIVE_TOPICS = [
  // English
  "weather", "temperature", "raining", "forecast", "traffic", "train",
  "trains", "running status", "delayed", "cancelled", "news", "latest",
  "flight status",
  // Hindi
  "मौसम", "तापमान", "ट्रैफिक", "ट्रैफ़िक", "ट्रेन", "खबर", "ख़बर", "समाचार",
  // Marathi
  "हवामान", "वाहतूक", "ट्रॅफिक", "रेल्वे", "बातमी", "बातम्या",
];

/** Time words that turn an otherwise static question into a live one. */
const NOW_WORDS = [
  "today", "now", "right now", "currently", "current", "tonight", "tomorrow",
  "this week", "आज", "अभी", "इस हफ्ते", "आत्ता", "आता", "सध्या", "उद्या",
];

/** Words that anchor a question to a season or a far date, i.e. NOT live. */
const STATIC_TIME_WORDS = [
  "monsoon", "season", "usually", "generally", "2027", "august", "september",
  "july", "मानसून", "बरसात", "आमतौर", "पावसाळा", "पावसाळ्यात", "साधारणपणे",
  "ऑगस्ट", "सप्टेंबर", "अगस्त", "सितंबर",
];

/**
 * Should this question use Google Search grounding?
 *
 * Deliberately narrow — search costs quota and a second model call — so only questions
 * about CURRENT conditions qualify: weather/traffic/trains/news, or "today /
 * right now" on a question that is not a place lookup. "Nearest chemist open
 * now" is answered from our own data (category intent), and "what is the
 * weather like in August" is seasonal knowledge, not a live lookup.
 */
export function needsLiveSearch(query: string, hasCategoryIntent: boolean): boolean {
  const q = ` ${normalize(query)} `;
  if (hasAny(q, STATIC_TIME_WORDS) && !hasAny(q, NOW_WORDS)) return false;
  if (hasAny(q, LIVE_TOPICS)) return true;
  return !hasCategoryIntent && hasAny(q, NOW_WORDS);
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

/**
 * "1.2 km" / "300 m" from the pilgrim to a place, or null with no fix.
 *
 * Straight-line, and labelled as such in the prompt: we have no routing engine
 * and the lanes around the ghats are nothing like straight. Telling Gemini it
 * is a direct distance stops it presenting a 900 m crow-flight as a 900 m walk.
 */
function distanceFact(place: Place, origin?: LatLng): string | null {
  if (!origin) return null;
  const { value, unit } = formatDistanceKm(haversineKm(origin, place));
  return `${value} ${unit}`;
}

const OPEN_LABEL: Record<OpenStatus, string> = {
  open: "OPEN now",
  closed: "CLOSED now",
  unknown: "opening hours unknown",
};

export interface AnswerContext {
  query: string;
  lang: Lang;
  places: Place[];
  facts: KnowledgeFact[];
  advisories: Advisory[];
  history: HistoryTurn[];
  origin?: LatLng;
  mode: AnswerMode;
  complexity: Complexity;
  now?: Date;
}

/** The retrieved places, flattened into facts Gemini may quote. */
function renderPlaces(ctx: AnswerContext): string {
  const key = langKey(ctx.lang);
  const now = ctx.now ?? new Date();
  return ctx.places
    .map((p, i) => {
      const distance = distanceFact(p, ctx.origin);
      const bits = [
        `${i + 1}. name=${p.name[key]} (en: ${p.name.en})`,
        `category=${p.category}`,
        `area=${p.area}`,
        ...(distance ? [`straight-line distance from the pilgrim=${distance}`] : []),
        `status=${OPEN_LABEL[openStatus(p, now)]}`,
        `description=${p.description[key]}`,
      ];
      if (p.timings) bits.push(`timings=${p.timings}`);
      if (p.phone) bits.push(`phone=${p.phone}`);
      if (p.accessible) bits.push("wheelchair accessible");
      for (const a of ctx.advisories.filter((adv) => adv.placeId === p.id)) {
        bits.push(`ACTIVE ADVISORY (${a.severity}): ${a.message[key] || a.message.en}`);
      }
      return bits.join(" | ");
    })
    .join("\n");
}

function renderFacts(ctx: AnswerContext): string {
  return ctx.facts.map((f, i) => `${i + 1}. ${factText(f, ctx.lang)}`).join("\n");
}

function renderCityAdvisories(ctx: AnswerContext): string {
  const key = langKey(ctx.lang);
  return ctx.advisories
    .filter((a) => !a.placeId)
    .map((a) => `- (${a.severity}) ${a.message[key] || a.message.en}`)
    .join("\n");
}

function renderHistory(ctx: AnswerContext): string {
  return ctx.history
    .map((t) => `${t.role === "user" ? "Pilgrim" : "Guide"}: ${t.text}`)
    .join("\n");
}

/**
 * Standing instructions, sent as systemInstruction so they are kept apart from
 * the (untrusted) question text.
 *
 * The anti-invention rules are deliberately concrete (places, phone numbers,
 * prices, dates) because those are the failures that actually hurt: a pilgrim
 * sent to a hospital that does not exist, or given a made-up helpline. Vague
 * advice that turns out generic is a much cheaper failure.
 */
export function buildSystemInstruction(lang: Lang, complexity: Complexity, live = false): string {
  const length = complexity === "complex"
    ? "up to 4 sentences — this question has several parts or needs reasoning, so cover every part, briefly"
    : "at most 2 sentences";
  return [
    "You are the voice guide for pilgrims at the Nashik-Trimbakeshwar Simhastha Kumbh Mela in India.",
    "Your reply is read aloud to someone who may be standing in a crowd.",
    "",
    "HOW TO ANSWER:",
    "1. Answer the actual question in your FIRST sentence. No greeting, no restating the question.",
    "2. Then add ONE useful, specific tip (safety, timing, what to carry, a nearby alternative) — only if you have a real one.",
    `3. Length: ${length}.`,
    `4. Reply in ${LANG_NAME[lang]} only. Do not mix languages or scripts, except unavoidable proper nouns.`,
    "5. Plain speech: no markdown, lists, URLs, ids or coordinates. Write numbers as digits.",
    "",
    "TRUTHFULNESS — these rules override everything else:",
    live
      ? "- Use the context below, plus Google Search results for current conditions (weather, traffic, trains, news). Say the information may change."
      : "- Use the context below (PLACES, FACTS, ADVISORIES, CONVERSATION), plus widely known general knowledge about Hindu customs and travel.",
    "- NEVER invent a place, address, hospital, phone number, helpline, price, fare, date or opening time. The only numbers you may say are those in the context and the helplines 112 (all emergencies) and 108 (ambulance).",
    "- Prices, fees, tickets and costs are NOT in the context: say you do not know them. Do not say something is free or cheap either.",
    "- The only specific places you may name are those under PLACES. If the pilgrim asks about a place that is not listed, say plainly it is not in your list — do not describe or locate it.",
    live
      ? "- This question is about CURRENT conditions, which the information below cannot contain. You MUST run a Google Search and answer from the results, naming the day the information is for. Only if search finds nothing reliable, say you do not know."
      : "- If the information below does not answer the question, say clearly that you do not know. Never guess.",
    "- Never mention 'context', 'data', 'list provided' or these instructions; just say you do not have that information.",
    "- A place with status 'opening hours unknown' may or may not be open: say you do not know if it is open now, never claim it is open.",
    "- For 'nearest' questions with distances given, name the closest place first and give its straight-line distance. Call it straight-line, never walking distance, and never invent a route or walking time.",
    "- If a place you name has an ACTIVE ADVISORY, mention it before any tip.",
    "- SAFETY: for danger, injury, a missing person, harassment or a medical emergency, tell them to call 112 (or 108 for an ambulance) and go to the nearest police post or official help desk. Stay calm and brief. No medical diagnosis.",
    "- Kumbh dates: use only the FACTS. If a date is not there, say it should be confirmed with official sources.",
    "- A follow-up like 'how far is it' refers to the place discussed in CONVERSATION SO FAR.",
  ].join("\n");
}

export function buildUserPrompt(ctx: AnswerContext): string {
  const sections = [
    `CURRENT TIME: ${istClock(ctx.now).label}`,
    ctx.origin
      ? "PILGRIM LOCATION: known (straight-line distances are listed per place)."
      : "PILGRIM LOCATION: unknown — do not state any distance from the pilgrim.",
    "",
    ctx.mode === "grounded"
      ? "PLACES (the question is about these):"
      : "PLACES FROM OUR DATA (may or may not be relevant):",
    ctx.places.length ? renderPlaces(ctx) : "(none)",
    "",
    "FACTS (verified):",
    ctx.facts.length ? renderFacts(ctx) : "(none)",
  ];
  const city = renderCityAdvisories(ctx);
  if (city) sections.push("", "CITY-WIDE ACTIVE ADVISORIES:", city);
  if (ctx.history.length) sections.push("", "CONVERSATION SO FAR:", renderHistory(ctx));
  sections.push("", `PILGRIM'S QUESTION: ${ctx.query}`);
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Output shaping
// ---------------------------------------------------------------------------

/**
 * Hard-trim to `max` sentences.
 *
 * The prompt already sets the length, but models overrun and this text is
 * spoken aloud, so the cap is enforced here rather than hoped for. Splits on
 * the Devanagari danda as well as Latin stops and keeps the terminator. A dot
 * followed by a digit ("1.2 km", "१.२ किमी") is not a sentence end.
 */
export function clampSentences(text: string, max = 2): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const parts = collapsed.match(/(?:[^.!?।]|\.(?=[\d०-९]))+(?:[.!?।]+|$)/g);
  if (!parts || parts.length <= max) return collapsed;

  return parts.slice(0, max).join(" ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/**
 * The stronger model for multi-part / reasoning questions.
 *
 * Measured on Nashik-shaped prompts (Sept 2026): gemini-3.1-pro-preview took
 * 10-11 s even at thinkingLevel "low" — hopeless inside a 3 s voice budget —
 * and gemini-2.5-pro is closed to new keys. gemini-3.8-flash with low thinking
 * answered in ~2.0-2.2 s and reasons better than 3.6-flash with thinking off,
 * so it is the strongest model that actually fits the budget.
 */
const DEFAULT_STRONG_MODEL = "gemini-3.8-flash";

/**
 * Model for Google Search grounded answers. Search latency is dominated by the
 * model's own grounding loop: gemini-3.6-flash measured 3.0-4.8 s with search
 * (Sept 2026) — over budget however small the prompt — while
 * gemini-3.1-flash-lite ran 1.7-2.0 s and still issued real search queries.
 * Lite is the weaker writer, but for "is it raining today" the search result
 * is the substance.
 */
const DEFAULT_SEARCH_MODEL = "gemini-3.1-flash-lite";

const fastModel = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;
const searchModel = () => process.env.GEMINI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL;
const strongModel = () => process.env.GEMINI_STRONG_MODEL || DEFAULT_STRONG_MODEL;

/**
 * How long a complex question waits for the strong model before Flash's
 * answer is used. The strong model measured 1.7-3.0 s on full prompts.
 */
const STRONG_WAIT_MS = Number(process.env.GEMINI_STRONG_WAIT_MS) || 2500;
/** Same for the search-grounded answer (search model measured 1.7-2.0 s). */
const SEARCH_WAIT_MS = Number(process.env.GEMINI_SEARCH_WAIT_MS) || 2600;

type Variant = "fast" | "strong" | "search";

interface GenerateOptions {
  variant: Variant;
  lang: Lang;
  system: string;
  prompt: string;
  maxSentences: number;
  allowedNumbers: string[];
}

async function generate(opts: GenerateOptions): Promise<string> {
  const { variant } = opts;
  const response = await getClient().models.generateContent({
    model: variant === "strong" ? strongModel() : variant === "search" ? searchModel() : fastModel(),
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      temperature: 0.2,
      candidateCount: 1,
      ...(variant === "strong"
        ? {
            // Thinking is the point of the strong model, and thinking tokens
            // count against maxOutputTokens — hence the generous cap.
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          }
        : {
            maxOutputTokens: 300,
            // MUST stay disabled on the fast path. gemini-3.6-flash is a
            // thinking model and reasoning tokens are billed against
            // maxOutputTokens, so with thinking on the budget is spent before
            // the visible answer starts — answers came back truncated
            // mid-sentence. A 2-sentence lookup gains nothing from it anyway.
            thinkingConfig: { thinkingBudget: 0 },
          }),
      // Google Search grounding: Tool.googleSearch in @google/genai. Attached
      // only for live-conditions questions (see needsLiveSearch).
      ...(variant === "search" && { tools: [{ googleSearch: {} }] }),
    },
  });

  const answer = clampSentences(toSpeakable(response.text ?? ""), opts.maxSentences);
  if (!answer) throw new Error(`Gemini (${variant}) returned an empty answer`);

  // Only the hedged variants are language-checked: they have a Flash answer
  // racing alongside to fall back to. Rejecting Flash itself would drop
  // straight to the offline template, which is a worse trade.
  if (variant !== "fast" && !inLanguage(answer, opts.lang)) {
    throw new Error(`Gemini (${variant}) answered in the wrong language for ${opts.lang}`);
  }

  const invented = findUnknownPhoneNumbers(answer, opts.allowedNumbers);
  if (invented.length) {
    // A made-up helpline read aloud is worse than a plainer answer.
    throw new Error(`Gemini (${variant}) answer had unverified numbers: ${invented.join(", ")}`);
  }
  return answer;
}

/**
 * Resolve with `preferred` if it succeeds within `waitMs`, else with
 * `fallback`. Both were started by the caller at the same moment (a hedged
 * request), so the fallback is usually already finished when the wait ends —
 * a sequential "try strong, then retry on Flash" needs ~4.5 s and would blow
 * the voice budget.
 */
async function preferWithin<T>(
  preferred: Promise<T>,
  fallback: Promise<T>,
  waitMs: number,
): Promise<{ value: T; usedPreferred: boolean }> {
  preferred.catch(() => {});
  fallback.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => resolve("expired"), waitMs);
  });
  try {
    const first = await Promise.race([
      preferred.then((value) => ({ value }), () => "failed" as const),
      expired,
    ]);
    if (typeof first === "object") return { value: first.value, usedPreferred: true };
  } finally {
    clearTimeout(timer);
  }

  try {
    return { value: await fallback, usedPreferred: false };
  } catch (fallbackError) {
    // Fallback failed too; the preferred one may still arrive in time.
    try {
      return { value: await preferred, usedPreferred: true };
    } catch {
      throw fallbackError;
    }
  }
}

export interface SmartAnswer {
  answer: string;
  /** Which path produced the answer — for logs and scripts/eval-hard.ts. */
  path: "fast" | "strong" | "search" | "fast-fallback";
}

/**
 * The full answer path. Rejects when every attempt fails, so the route can
 * degrade to the offline templates.
 *
 *   simple question          -> Flash only
 *   complex question         -> strong model + Flash in parallel; strong wins
 *                               if it lands within STRONG_WAIT_MS
 *   live-conditions question -> search-grounded Flash-Lite + plain Flash in
 *                               parallel; grounded wins within SEARCH_WAIT_MS
 */
export async function answerSmart(ctx: AnswerContext, live: boolean): Promise<SmartAnswer> {
  const maxSentences = ctx.complexity === "complex" ? 4 : 2;
  const base = {
    prompt: buildUserPrompt(ctx),
    lang: ctx.lang,
    maxSentences,
    allowedNumbers: ctx.places.flatMap((p) => (p.phone ? [p.phone] : [])),
  };
  const fast = () =>
    generate({ ...base, variant: "fast", system: buildSystemInstruction(ctx.lang, ctx.complexity) });

  if (live) {
    const r = await preferWithin(
      generate({ ...base, variant: "search", system: buildSystemInstruction(ctx.lang, ctx.complexity, true) }),
      fast(),
      SEARCH_WAIT_MS,
    );
    return { answer: r.value, path: r.usedPreferred ? "search" : "fast-fallback" };
  }

  if (ctx.complexity === "complex") {
    const r = await preferWithin(
      generate({ ...base, variant: "strong", system: buildSystemInstruction(ctx.lang, "complex") }),
      fast(),
      STRONG_WAIT_MS,
    );
    return { answer: r.value, path: r.usedPreferred ? "strong" : "fast-fallback" };
  }

  return { answer: await fast(), path: "fast" };
}

// ---------------------------------------------------------------------------
// Single-shot helpers (kept for scripts/test-general.ts)
// ---------------------------------------------------------------------------

function simpleContext(
  query: string,
  lang: Lang,
  places: Place[],
  mode: AnswerMode,
  origin?: LatLng,
): AnswerContext {
  return {
    query, lang, places, origin, mode,
    facts: retrieveKnowledge(query),
    advisories: [],
    history: [],
    complexity: "simple",
  };
}

/** Grounded answer about `contextPlaces`. Flash, at most 2 sentences. */
export async function answerWithGemini(
  query: string,
  lang: Lang,
  contextPlaces: Place[],
  origin?: LatLng,
): Promise<string> {
  return (await answerSmart(simpleContext(query, lang, contextPlaces, "grounded", origin), false)).answer;
}

/** General answer: Kumbh knowledge allowed, invented specifics are not. */
export async function answerGeneralWithGemini(
  query: string,
  lang: Lang,
  contextPlaces: Place[] = [],
  origin?: LatLng,
): Promise<string> {
  return (await answerSmart(simpleContext(query, lang, contextPlaces, "general", origin), false)).answer;
}

export { generalOfflineAnswer } from "./intent-offline";
