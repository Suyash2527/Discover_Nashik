// Thin wrapper around the Sarvam AI speech APIs. Server-only: SARVAM_API_KEY
// must never reach the client, so this module is imported exclusively from
// app/api/ — same rule as lib/gemini.ts.
//
// Sarvam is a *fallback*, never the primary path. Web Speech is free, instant
// and already works; Sarvam covers the two places it does not:
//   - speechToText: browsers with no SpeechRecognition (Firefox, iOS WebViews)
//   - textToSpeech: languages with no installed voice — in practice mr-IN,
//     which is missing on nearly every desktop and many Android builds.
// Every function throws on failure; callers are expected to catch and degrade.
import type { Lang } from "@/types";

const BASE_URL = process.env.SARVAM_BASE_URL || "https://api.sarvam.ai";

/** Sarvam's ASR and TTS model ids. Pinned so a silent upstream default change
 *  cannot alter latency or accent mid-Kumbh. */
const STT_MODEL = "saarika:v2.5";
const TTS_MODEL = "bulbul:v2";

/**
 * Per-language speaker. Sarvam's bulbul speakers are language-agnostic but
 * tuned on Indic phonetics; "anushka" reads Devanagari cleanly and is the
 * closest to the calm, clear register a pilgrim needs in a crowd.
 */
const SPEAKER = "anushka";

/** Sarvam rejects TTS input over 500 characters. Voice answers are capped at
 *  2 sentences (CONTEXT.md) so this only ever guards against a malformed
 *  answer — truncating beats a 400. */
const MAX_TTS_CHARS = 500;

/** Budget for either call. A pilgrim never waits more than ~3 s end to end, and
 *  by the time we reach Sarvam some of that budget is already spent. */
const TIMEOUT_MS = Number(process.env.SARVAM_TIMEOUT_MS) || 4000;

export function isSarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY);
}

function apiKey(): string {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set");
  return key;
}

/** fetch with a hard deadline, so a hung Sarvam cannot hold a route open. */
async function post(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      method: "POST",
      signal: controller.signal,
      headers: { ...init.headers, "api-subscription-key": apiKey() },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Sarvam ${path} responded ${response.status}: ${detail.slice(0, 200)}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Transcribe recorded audio.
 *
 * Used ONLY when the browser has no SpeechRecognition, or when it keeps
 * returning no-speech-detected — never in place of a working recogniser.
 */
export async function speechToText(audioBlob: Blob, lang: Lang): Promise<string> {
  if (audioBlob.size === 0) throw new Error("Sarvam STT received empty audio");

  const form = new FormData();
  // Sarvam infers the container from the filename extension; MediaRecorder on
  // Chromium produces webm/opus, which Sarvam accepts.
  form.append("file", audioBlob, "audio.webm");
  form.append("model", STT_MODEL);
  form.append("language_code", lang);

  const response = await post("/speech-to-text", { body: form });
  const data = (await response.json()) as { transcript?: string };
  const transcript = (data.transcript ?? "").trim();
  if (!transcript) throw new Error("Sarvam STT returned an empty transcript");
  return transcript;
}

export interface SarvamSpeech {
  /** Base64-encoded WAV, exactly as Sarvam returns it. */
  audioBase64: string;
  mimeType: "audio/wav";
}

/**
 * Synthesise `text`. This is the real Marathi fix: speechSynthesis has no
 * mr-IN voice on most devices, so Web Speech either reads Marathi with a Hindi
 * accent or renders nothing at all.
 */
export async function textToSpeech(text: string, lang: Lang): Promise<SarvamSpeech> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Sarvam TTS received empty text");

  const response = await post("/text-to-speech", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: trimmed.slice(0, MAX_TTS_CHARS),
      target_language_code: lang,
      speaker: SPEAKER,
      model: TTS_MODEL,
      // Expands digits, dates and English words into Devanagari-readable
      // forms — "7 AM" is otherwise read as English inside a Marathi sentence.
      enable_preprocessing: true,
    }),
  });

  const data = (await response.json()) as { audios?: string[] };
  const audioBase64 = data.audios?.[0];
  if (!audioBase64) throw new Error("Sarvam TTS returned no audio");
  return { audioBase64, mimeType: "audio/wav" };
}
