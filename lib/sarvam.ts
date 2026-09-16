// Thin wrapper around the Sarvam AI speech APIs. Server-only: SARVAM_API_KEY
// must never reach the client, so this module is imported exclusively from
// app/api/ — same rule as lib/gemini.ts.
//
// Sarvam is the PRIMARY voice path whenever the device is online (see
// shouldUseExternalVoice in lib/voice/tts.ts). Web Speech is the offline
// fallback. Sarvam wins online because it covers the two places Web Speech
// fails outright:
//   - speechToText: browsers with no SpeechRecognition (Firefox, iOS WebViews)
//   - textToSpeech: languages with no installed voice — in practice mr-IN,
//     which is missing on nearly every desktop and many Android builds.
// Every function throws on failure; callers are expected to catch and degrade.
import type { Lang } from "@/types";

const BASE_URL = process.env.SARVAM_BASE_URL || "https://api.sarvam.ai";

/** Sarvam's ASR and TTS model ids. Pinned so a silent upstream default change
 *  cannot alter latency or accent mid-Kumbh.
 *
 *  saarika:v2.5 is deprecated upstream — /speech-to-text now defaults to
 *  saaras:v3, and Sarvam's migration note is "use saaras:v3 with
 *  mode=transcribe". Transcribe mode matters: saaras otherwise *translates*
 *  to English, which would silently turn a Marathi question into English and
 *  break the answer-in-the-language-spoken rule (CONTEXT.md). */
const STT_MODEL = "saaras:v3";
const STT_MODE = "transcribe";
/** bulbul:v2 is gone: Sarvam now answers 400 "Model 'bulbul:v2' has been
 *  deprecated. Please use 'bulbul:v3' instead." (verified 2026-09-16, even
 *  though the docs still list v2 as legacy). */
const TTS_MODEL = "bulbul:v3";

/**
 * Per-language speaker. Sarvam's bulbul speakers are language-agnostic but
 * tuned on Indic phonetics. "anushka" was a bulbul:v2 voice and is rejected by
 * v3; "ritu" is the v3 female voice closest to the calm, clear register a
 * pilgrim needs in a crowd. Speaker ids are case-sensitive and model-specific.
 */
const SPEAKER = "ritu";

/** bulbul:v3 rejects TTS input over 2500 characters. Voice answers are capped
 *  at 2 sentences (CONTEXT.md) so this only ever guards against a malformed
 *  answer — truncating beats a 400. */
const MAX_TTS_CHARS = 2500;

/** Budget for either call. A pilgrim never waits more than ~3 s end to end, and
 *  by the time we reach Sarvam some of that budget is already spent. */
const TIMEOUT_MS = Number(process.env.SARVAM_TIMEOUT_MS) || 4000;

if (!process.env.SARVAM_API_KEY) {
  console.warn(
    "[sarvam] SARVAM_API_KEY is not set. Voice falls back to Web Speech, which " +
      "has no mr-IN voice on most devices. Set SARVAM_API_KEY in .env.local or " +
      "the Vercel project environment.",
  );
} else {
  console.info(
    `[sarvam] SARVAM_API_KEY loaded (${process.env.SARVAM_API_KEY.slice(0, 6)}…, ` +
      `${process.env.SARVAM_API_KEY.length} chars); stt ${STT_MODEL} mode=${STT_MODE}, tts ${TTS_MODEL}`,
  );
}

export function isSarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY);
}

/**
 * Sarvam rejected our credentials (401/403).
 *
 * Split out from a generic failure on purpose. An auth failure is PERMANENT
 * and needs a human to rotate the key; a 5xx is transient and will fix itself.
 * Collapsing both into one "Sarvam failed" is exactly what made a dead key look
 * like a flaky API for days — so the routes surface them as different statuses.
 */
export class SarvamAuthError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(
      `Sarvam rejected SARVAM_API_KEY (HTTP ${status}). The key is missing, ` +
        `revoked, or out of credits — rotate it at https://dashboard.sarvam.ai. ` +
        `Upstream said: ${detail}`,
    );
    this.name = "SarvamAuthError";
    this.status = status;
  }
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
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      if (response.status === 401 || response.status === 403) {
        throw new SarvamAuthError(response.status, detail);
      }
      throw new Error(`Sarvam ${path} responded ${response.status}: ${detail}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export interface SarvamTranscript {
  transcript: string;
  /** The language Sarvam HEARD — the one to answer in. */
  lang: Lang;
}

const LANGS: readonly Lang[] = ["en-IN", "hi-IN", "mr-IN"];

/**
 * Transcribe recorded audio. The primary online path — Web Speech only takes
 * over when the device is offline or this call fails.
 *
 * Always auto-detects (language_code "unknown"), never passes the UI toggle.
 * Given a language_code, Sarvam does not transcribe in it — it TRANSLATES into
 * it: English "Where is Ramkund?" sent as mr-IN came back as "कुठे आहे रामकुंद?"
 * (verified 2026-09-16, same for every language pair). The answer then followed
 * the toggle, not the pilgrim. With "unknown" all three languages come back
 * verbatim with the correct detected language_code.
 *
 * `fallbackLang` is used only if Sarvam reports a language we do not serve.
 */
export async function speechToText(audioBlob: Blob, fallbackLang: Lang): Promise<SarvamTranscript> {
  if (audioBlob.size === 0) throw new Error("Sarvam STT received empty audio");

  const form = new FormData();
  // We send standard WAV files encoded directly in the browser because Sarvam
  // strictly rejects WebM/Opus.
  form.append("file", audioBlob, "audio.wav");
  form.append("model", STT_MODEL);
  form.append("mode", STT_MODE);
  form.append("language_code", "unknown");

  const response = await post("/speech-to-text", { body: form });
  const data = (await response.json()) as { transcript?: string; language_code?: string | null };
  const transcript = (data.transcript ?? "").trim();
  if (!transcript) throw new Error("Sarvam STT returned an empty transcript");
  const heard = LANGS.find((l) => l === data.language_code);
  return { transcript, lang: heard ?? fallbackLang };
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
