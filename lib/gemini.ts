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
import { normalize } from "./text";

const DEFAULT_MODEL = "gemini-2.0-flash";

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
  return looksGeneral(query) ? "general" : "grounded";
}

// ---------------------------------------------------------------------------
// Prompting
// ---------------------------------------------------------------------------

/** The retrieved places, flattened into facts Gemini may quote. */
function renderContext(places: Place[], lang: Lang): string {
  const key = langKey(lang);
  return places
    .map((p, i) => {
      const bits = [
        `${i + 1}. id=${p.id}`,
        `name=${p.name[key]} (en: ${p.name.en})`,
        `category=${p.category}`,
        `area=${p.area}`,
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

function buildGroundedPrompt(query: string, lang: Lang, places: Place[]): string {
  return [
    "You are the voice guide for Kumbh pilgrims in Nashik, India.",
    "",
    "PLACES (the only facts you may use):",
    places.length ? renderContext(places, lang) : "(none)",
    "",
    `PILGRIM'S QUESTION: ${query}`,
    "",
    "RULES — follow all of them:",
    "- Answer ONLY using the PLACES listed above. Use no other knowledge.",
    "- NEVER invent, guess or mention a place that is not in the list above.",
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
function buildGeneralPrompt(query: string, lang: Lang, places: Place[]): string {
  return [
    "You are a helpful assistant for pilgrims at the Kumbh Mela in Nashik, India.",
    "",
    places.length
      ? "PLACES FROM OUR DATA (you may mention these by name; they may not be relevant):"
      : "PLACES FROM OUR DATA: (none matched this question)",
    places.length ? renderContext(places, lang) : "",
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
): Promise<string> {
  return generate(buildGroundedPrompt(query, lang, contextPlaces));
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
): Promise<string> {
  return generate(buildGeneralPrompt(query, lang, contextPlaces));
}

// ---------------------------------------------------------------------------
// Offline counterpart for general questions
// ---------------------------------------------------------------------------

/**
 * Lives here rather than in lib/intent-offline.ts because it is the direct
 * counterpart of answerGeneralWithGemini: a general question cannot be answered
 * from data/places.json at all, so there is no template to fall back to — only
 * an honest "I need the network for this one".
 *
 * This must NOT read like "place not found": the pilgrim asked about customs or
 * safety, not about a place, and a "not in my list" reply would be a
 * non-sequitur.
 */
const GENERAL_OFFLINE: Record<LangKey, string> = {
  en: "I need an internet connection to answer that one. You can still ask me to find places nearby — that works offline.",
  hi: "इसका उत्तर देने के लिए मुझे इंटरनेट की आवश्यकता है। आप मुझसे आस-पास की जगहें अब भी पूछ सकते हैं — वह ऑफ़लाइन काम करता है।",
  mr: "याचे उत्तर देण्यासाठी मला इंटरनेट लागेल. जवळची ठिकाणे तुम्ही आताही विचारू शकता — ते ऑफलाइन चालते.",
};

export function generalOfflineAnswer(lang: Lang): string {
  return GENERAL_OFFLINE[langKey(lang)];
}
