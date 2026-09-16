// Thin wrapper around @google/genai. Server-only: GEMINI_API_KEY must never
// reach the client, so this module is imported exclusively from app/api/.
import { GoogleGenAI } from "@google/genai";
import type { Lang, Place } from "@/types";

const DEFAULT_MODEL = "gemini-2.0-flash";

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

/** The retrieved places, flattened into the only facts Gemini may use. */
function renderContext(places: Place[], lang: Lang): string {
  const key = lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en";
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

function buildPrompt(query: string, lang: Lang, places: Place[]): string {
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
    `- Reply in ${LANG_NAME[lang]} only. Do not mix languages or scripts.`,
    "- At most 2 sentences. Be direct — this is read aloud.",
    "- Plain speech only: no markdown, no bullet points, no ids, no coordinates.",
    "- If the PLACES do not answer the question, say so in one short sentence.",
  ].join("\n");
}

/**
 * Ask Gemini to phrase an answer from the retrieved places.
 * Rejects on missing key, network failure, or an empty candidate — the caller
 * (app/api/ask) falls back to the offline templates.
 */
export async function answerWithGemini(
  query: string,
  lang: Lang,
  contextPlaces: Place[],
): Promise<string> {
  const response = await getClient().models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: buildPrompt(query, lang, contextPlaces),
    config: {
      temperature: 0.2,
      maxOutputTokens: 160,
      candidateCount: 1,
    },
  });

  const answer = (response.text ?? "").replace(/\s+/g, " ").trim();
  if (!answer) throw new Error("Gemini returned an empty answer");
  return answer;
}
