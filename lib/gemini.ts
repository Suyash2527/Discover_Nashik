// Thin wrapper around @google/genai. Server-only: GEMINI_API_KEY must never
// reach the client, so this module is imported exclusively from app/api/.
//
// Two answering modes:
//   grounded — retrieval found places. Gemini may use NOTHING else.
//   general  — retrieval found nothing relevant. Gemini may use its own
//              knowledge about Kumbh Mela / Nashik / pilgrimage, but still may
//              not invent place names, addresses or phone numbers.
// Both modes are capped at 2 sentences and pinned to the request language.
import { GoogleGenAI } from "@google/genai";
import type { Lang, Place } from "@/types";
import { formatDistanceKm, haversineKm, type LatLng } from "./geo";
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

/** The retrieved places, flattened into facts Gemini may quote. */
function renderContext(places: Place[], lang: Lang, origin?: LatLng): string {
  const key = langKey(lang);
  return places
    .map((p, i) => {
      const distance = distanceFact(p, origin);
      const bits = [
        `${i + 1}. id=${p.id}`,
        `name=${p.name[key]} (en: ${p.name.en})`,
        `category=${p.category}`,
        `area=${p.area}`,
        ...(distance ? [`straight-line distance from the pilgrim=${distance}`] : []),
        `description=${p.description[key]}`,
      ];
      if (p.timings) bits.push(`timings=${p.timings}`);
      if (p.open24x7) bits.push("open 24x7");
      if (p.phone) bits.push(`phone=${p.phone}`);
      if (p.accessible) bits.push("wheelchair accessible");
      return bits.join(" | ");
    })
    .join("\n");
}

/** Shared tail: the rules that apply to every answer, in every mode. */
function commonRules(lang: Lang): string[] {
  return [
    `- Reply in ${LANG_NAME[lang]} only. Do not mix languages or scripts.`,
    "- At most 2 sentences. Be direct — this is read aloud to someone walking.",
    "- Plain speech only: no markdown, no bullet points, no ids, no coordinates.",
  ];
}

/**
 * How to talk about distance — only ever added when we actually have a fix.
 *
 * "How far is it" is one of the most common things a pilgrim asks, and until
 * the hook started sending coordinates there was simply no number to answer it
 * with. With no fix these rules are omitted entirely rather than softened: a
 * prompt that mentions distance while the context has none invites the model to
 * estimate one, and a confidently invented "about 2 km" is exactly the failure
 * this file's other rules exist to prevent.
 */
function distanceRules(places: Place[], origin?: LatLng): string[] {
  if (!origin || places.length === 0) return [];
  return [
    "- The pilgrim's location is known. If they ask how far, how near, or how",
    "  to reach a place, LEAD with the straight-line distance given above.",
    "- Call it a straight-line or direct distance, never a walking distance,",
    "  and do NOT invent a walking time, a route, turns, or street names.",
  ];
}

function buildGroundedPrompt(
  query: string,
  lang: Lang,
  places: Place[],
  origin?: LatLng,
): string {
  return [
    "You are the voice guide for Kumbh pilgrims in Nashik, India.",
    "",
    "PLACES (the only facts you may use):",
    places.length ? renderContext(places, lang, origin) : "(none)",
    "",
    `PILGRIM'S QUESTION: ${query}`,
    "",
    "RULES — follow all of them:",
    "- Answer ONLY using the PLACES listed above. Use no other knowledge.",
    "- NEVER invent, guess or mention a place that is not in the list above.",
    ...distanceRules(places, origin),
    ...commonRules(lang),
    "- If the PLACES do not answer the question, say so in one short sentence.",
  ].join("\n");
}

/**
 * General mode. Knowledge is allowed; fabricated specifics are not.
 *
 * The anti-invention rules are deliberately concrete (place names, addresses,
 * phone numbers, timings) because those are the failures that actually hurt: a
 * pilgrim sent to a hospital that does not exist, or given a made-up helpline.
 * Vague advice that turns out to be generic is a much cheaper failure.
 */
function buildGeneralPrompt(
  query: string,
  lang: Lang,
  places: Place[],
  origin?: LatLng,
): string {
  return [
    "You are a helpful assistant for pilgrims at the Kumbh Mela in Nashik, India.",
    "",
    places.length
      ? "PLACES FROM OUR DATA (you may mention these by name; they may not be relevant):"
      : "PLACES FROM OUR DATA: (none matched this question)",
    places.length ? renderContext(places, lang, origin) : "",
    "",
    `PILGRIM'S QUESTION: ${query}`,
    "",
    "RULES — follow all of them:",
    "- You MAY use your general knowledge about the Kumbh Mela, Nashik, Hindu",
    "  pilgrimage customs, ritual bathing, crowd safety, health precautions,",
    "  seasonal weather and practical travel advice.",
    "- NEVER invent a specific place name, address, landmark, hospital, hotel,",
    "  phone number, helpline, price, or opening time. The ONLY specific places",
    "  you may name are those listed above under PLACES FROM OUR DATA.",
    "- If the pilgrim asks about a specific place you do not see listed above,",
    "  say plainly that you do not have that place in your list. Do NOT guess",
    "  where it is, and do NOT describe it.",
    "- Do not give medical diagnosis or emergency instructions beyond advising",
    "  they seek help; for an emergency, tell them to contact on-site officials.",
    ...distanceRules(places, origin),
    ...commonRules(lang),
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Output shaping
// ---------------------------------------------------------------------------

/**
 * Hard-trim to `max` sentences.
 *
 * The prompt already asks for two, but models overrun and this text is spoken
 * aloud — CONTEXT.md caps voice answers at 2 sentences, so the cap is enforced
 * here rather than hoped for. Splits on the Devanagari danda as well as Latin
 * stops, and keeps the terminator.
 */
export function clampSentences(text: string, max = 2): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  const parts = collapsed.match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g);
  if (!parts || parts.length <= max) return collapsed;

  return parts.slice(0, max).join(" ").replace(/\s+/g, " ").trim();
}

async function generate(prompt: string): Promise<string> {
  const response = await getClient().models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 200,
      candidateCount: 1,
      // MUST stay disabled. gemini-3.6-flash is a thinking model and reasoning
      // tokens are billed against maxOutputTokens, so with thinking on the
      // budget is spent before the visible answer starts — answers came back
      // truncated mid-sentence ("Kumbh Mela is") or leaking prompt fragments.
      // Raising the cap to ~800 also fixes it but costs ~4 s, over the 2.5 s
      // GEMINI_TIMEOUT_MS budget in app/api/ask. A 2-sentence grounded answer
      // gains nothing from chain-of-thought anyway.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const answer = clampSentences(response.text ?? "");
  if (!answer) throw new Error("Gemini returned an empty answer");
  return answer;
}

/**
 * Grounded answer: phrase a reply using ONLY `contextPlaces`.
 * Rejects on missing key, network failure, or an empty candidate — the caller
 * (app/api/ask) falls back to the offline templates.
 */
export async function answerWithGemini(
  query: string,
  lang: Lang,
  contextPlaces: Place[],
  origin?: LatLng,
): Promise<string> {
  return generate(buildGroundedPrompt(query, lang, contextPlaces, origin));
}

/**
 * General answer: Kumbh/Nashik knowledge allowed, invented specifics are not.
 * `contextPlaces` is optional supporting data, not a restriction.
 * Rejects like answerWithGemini, so the caller can fall back offline.
 */
export async function answerGeneralWithGemini(
  query: string,
  lang: Lang,
  contextPlaces: Place[] = [],
  origin?: LatLng,
): Promise<string> {
  return generate(buildGeneralPrompt(query, lang, contextPlaces, origin));
}

export { generalOfflineAnswer } from "./intent-offline";
