// Minimal typings + feature detection for the Web Speech recognition API.
//
// lib.dom.d.ts ships SpeechRecognitionResult/ResultList/Alternative but NOT
// SpeechRecognition itself (still prefixed in Chromium, absent in Firefox), so
// the constructor surface is declared locally. Deliberately NOT a global
// `declare global { interface Window }` augmentation: that would collide the
// day TypeScript adds the real thing.

export interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onaudiostart: ((event: Event) => void) | null;
  onspeechend: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The vendor-prefixed and standard constructors, if this browser has either. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
  if (!isOffline) return true; // Online: always supported via Sarvam STT
  return getSpeechRecognitionCtor() !== null;
}

/**
 * Flatten a result event into the best final transcript and the running
 * interim text. `continuous:false` still emits multiple results per session,
 * so both halves have to be accumulated rather than read from index 0.
 */
export function readResults(event: SpeechRecognitionEventLike): {
  final: string;
  interim: string;
} {
  let final = "";
  let interim = "";
  for (let i = 0; i < event.results.length; i++) {
    const result = event.results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) final += text;
    else interim += text;
  }
  return { final: final.trim(), interim: interim.trim() };
}
