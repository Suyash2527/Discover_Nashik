// Speech synthesis. Voice availability is wildly inconsistent across
// platforms — Marathi (mr-IN) is missing on most desktops and on many Android
// builds — so voice selection degrades in documented steps rather than going
// silent.
import type { Lang } from "@/types";

/** Where a chosen voice came from, so callers can warn once about downgrades. */
export type VoiceMatch =
  | { voice: SpeechSynthesisVoice; lang: Lang; exact: true }
  | { voice: SpeechSynthesisVoice; lang: Lang; exact: false; requested: Lang }
  | { voice: null; lang: Lang; exact: false; requested: Lang };

/**
 * Fallback chain per requested language.
 * mr-IN falls back to hi-IN: both are Devanagari, so a Hindi voice reads
 * Marathi text with an accent but remains intelligible. Falling back to an
 * English voice instead would read Devanagari as gibberish or not at all.
 */
const FALLBACKS: Record<Lang, Lang[]> = {
  "en-IN": ["en-IN"],
  "hi-IN": ["hi-IN"],
  "mr-IN": ["mr-IN", "hi-IN"],
};

const base = (tag: string) => tag.toLowerCase().replace("_", "-").split("-")[0];

function findVoiceFor(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const want = lang.toLowerCase();
  // Exact locale first (mr-IN), then any voice for the language (mr-*).
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === want) ??
    voices.find((v) => base(v.lang) === base(want)) ??
    null
  );
}

/**
 * Pick the best available voice for `lang`, walking the fallback chain.
 * Pure and voice-list-injected so it is testable without a browser.
 */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): VoiceMatch {
  for (const candidate of FALLBACKS[lang]) {
    const voice = findVoiceFor(voices, candidate);
    if (voice) {
      return candidate === lang
        ? { voice, lang, exact: true }
        : { voice, lang: candidate, exact: false, requested: lang };
    }
  }
  // Nothing matched. Let the platform choose — some engines still render
  // Devanagari with a default voice.
  return { voice: null, lang, exact: false, requested: lang };
}

/**
 * True when speechSynthesis cannot speak `lang` in `lang` — either no voice at
 * all, or only a fallback voice from a different language (mr-IN read by a
 * Hindi voice). This is the trigger for Sarvam TTS.
 *
 * Pure and voice-list-injected, so the mr-IN case can be tested on a machine
 * that happens to *have* a Marathi voice installed.
 */
export function needsExternalVoice(voices: SpeechSynthesisVoice[], lang: Lang): boolean {
  return !pickVoice(voices, lang).exact;
}

/** Browser-side wrapper: load the voice list, then ask needsExternalVoice(). */
export async function shouldUseExternalVoice(lang: Lang): Promise<boolean> {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!isOffline) return true; // Online: always use Sarvam TTS

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return true;
  return needsExternalVoice(await loadVoices(window.speechSynthesis), lang);
}

/**
 * getVoices() is async on Chromium: it returns [] until the voiceschanged
 * event fires. Resolves early when voices are already warm.
 */
export function loadVoices(synth: SpeechSynthesis, timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const ready = synth.getVoices();
  if (ready.length > 0) return Promise.resolve(ready);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish);
  });
}

export interface SpeakHandle { cancel: () => void }

/**
 * Speak `text` in `lang`, resolving when playback ends (or fails).
 * Never rejects: TTS is a nice-to-have, and a synthesis error must not push the
 * assistant into an error state after a perfectly good answer.
 */
export async function speak(
  text: string,
  lang: Lang,
  options: { onWarn?: (message: string) => void } = {},
): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    options.onWarn?.("speechSynthesis is unavailable; answer shown as text only");
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) return;

  const synth = window.speechSynthesis;
  synth.cancel(); // Never let two answers overlap.

  const voices = await loadVoices(synth);
  const match = pickVoice(voices, lang);

  if (!match.voice) {
    options.onWarn?.(
      `No speechSynthesis voice for ${lang} (or its fallbacks). Using the platform default — ` +
        `install a ${lang} voice, or wire up Sarvam TTS.`,
    );
  } else if (!match.exact) {
    options.onWarn?.(
      `No ${match.requested} voice installed; speaking with the ${match.lang} voice ` +
        `"${match.voice.name}". Devanagari stays intelligible but the accent is wrong — ` +
        `Sarvam TTS would fix this.`,
    );
  }

  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.lang = match.voice?.lang ?? lang;
  if (match.voice) utterance.voice = match.voice;
  utterance.rate = 0.95; // Slightly slow: read aloud in a noisy crowd.

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      // "interrupted"/"canceled" are normal (a new question arrived).
      const reason = (event as SpeechSynthesisErrorEvent).error;
      if (reason && reason !== "interrupted" && reason !== "canceled") {
        options.onWarn?.(`speechSynthesis failed: ${reason}`);
      }
      finish();
    };
    synth.speak(utterance);
  });
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
