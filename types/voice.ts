// LOCKED CONTRACT — do not edit without team agreement.
export type Lang = "en-IN" | "hi-IN" | "mr-IN";

export interface AskRequest { query: string; lang: Lang; lat?: number; lng?: number }

export interface AskResponse {
  answer: string;        // max 2 sentences, in request lang
  placeIds: string[];    // pins for the UI to highlight
  source: "gemini" | "offline";
}

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface VoiceAssistant {
  state: VoiceState;
  transcript: string;
  answer: string;
  placeIds: string[];
  lang: Lang;
  setLang: (l: Lang) => void;
  start: () => void;
  stop: () => void;
  ask: (text: string) => Promise<void>; // typed-input path
}
