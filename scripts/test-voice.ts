// Unit tests for the browser-free parts of lib/voice.
//   npx tsx scripts/test-voice.ts
//
// SpeechRecognition and speechSynthesis cannot run here (or in jsdom), so the
// hook itself is verified manually in a real browser. What IS testable without
// a browser is tested here: the STT correction table and voice selection,
// including the mr-IN -> hi-IN fallback.
import { correctTranscript } from "../lib/voice/stt-corrections";
import { pickVoice } from "../lib/voice/tts";
import type { Lang } from "../types";

let failures = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got      "${actual}"\n        expected "${expected}"`);
}

// ---------------------------------------------------------------------------
console.log("STT alias correction");
// ---------------------------------------------------------------------------
const STT_CASES: Array<{ input: string; lang: Lang; expected: string }> = [
  // Latin mishears -> canonical English
  { input: "how do I get to tribakeshwar", lang: "en-IN", expected: "how do I get to Trimbakeshwar" },
  { input: "trambakeshwar temple", lang: "en-IN", expected: "Trimbakeshwar temple" },
  { input: "where is ram cond", lang: "en-IN", expected: "where is Ramkund" },
  { input: "ram kund", lang: "en-IN", expected: "Ramkund" },
  { input: "nearest toilet in panchvati", lang: "en-IN", expected: "nearest toilet in Panchavati" },
  { input: "kala ram mandir", lang: "en-IN", expected: "Kalaram mandir" },
  { input: "tapowan ghat", lang: "en-IN", expected: "Tapovan ghat" },
  { input: "godawari river", lang: "en-IN", expected: "Godavari river" },
  { input: "muktidam", lang: "en-IN", expected: "Muktidham" },
  { input: "saptashringi", lang: "en-IN", expected: "Saptashrungi" },

  // Longest-window-first: the Trimbakeshwar entry must beat the Trimbak entry.
  { input: "trimbakeshwar", lang: "en-IN", expected: "Trimbakeshwar" },
  { input: "trimbak", lang: "en-IN", expected: "Trimbak" },

  // Devanagari mishears -> canonical, per output language
  { input: "त्रंबकेश्वर कुठे आहे", lang: "mr-IN", expected: "त्र्यंबकेश्वर कुठे आहे" },
  { input: "ट्रिंबकेश्वर कहाँ है", lang: "hi-IN", expected: "त्र्यंबकेश्वर कहाँ है" },
  { input: "राम कुंड कुठे आहे", lang: "mr-IN", expected: "रामकुंड कुठे आहे" },
  { input: "काला राम मंदिर", lang: "mr-IN", expected: "काळाराम मंदिर" },
  { input: "काला राम मंदिर", lang: "hi-IN", expected: "कालाराम मंदिर" },

  // Cross-script: a Latin mishear while the UI is in Marathi writes Devanagari.
  { input: "ramkond", lang: "mr-IN", expected: "रामकुंड" },

  // Must NOT corrupt input it does not recognise.
  { input: "nearest hospital", lang: "en-IN", expected: "nearest hospital" },
  { input: "जवळचे हॉस्पिटल", lang: "mr-IN", expected: "जवळचे हॉस्पिटल" },
  { input: "where can I park my car", lang: "en-IN", expected: "where can I park my car" },
  { input: "", lang: "en-IN", expected: "" },
  { input: "   ", lang: "en-IN", expected: "" },
];

for (const c of STT_CASES) {
  check(`[${c.lang}] "${c.input}"`, correctTranscript(c.input, c.lang), c.expected);
}

// ---------------------------------------------------------------------------
console.log("");
console.log("TTS voice selection");
// ---------------------------------------------------------------------------
const voice = (lang: string, name = `voice-${lang}`) =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

function checkVoice(label: string, actual: string, expected: string) {
  check(label, actual, expected);
}

const FULL = [voice("en-IN"), voice("hi-IN"), voice("mr-IN")];
const NO_MARATHI = [voice("en-IN"), voice("hi-IN")];
const ENGLISH_ONLY = [voice("en-US"), voice("en-GB")];

checkVoice("mr-IN with a Marathi voice -> exact", describe(pickVoice(FULL, "mr-IN")), "mr-IN exact voice-mr-IN");
checkVoice(
  "mr-IN without Marathi -> Hindi fallback",
  describe(pickVoice(NO_MARATHI, "mr-IN")),
  "hi-IN fallback voice-hi-IN",
);
checkVoice("hi-IN with a Hindi voice -> exact", describe(pickVoice(FULL, "hi-IN")), "hi-IN exact voice-hi-IN");
checkVoice("en-IN with an Indian English voice -> exact", describe(pickVoice(FULL, "en-IN")), "en-IN exact voice-en-IN");
// en-US/en-GB are not en-IN, but they are English: base-language match.
checkVoice("en-IN falls back to any English voice", describe(pickVoice(ENGLISH_ONLY, "en-IN")), "en-IN exact voice-en-US");
// Marathi must never be read by an English voice — no voice is safer.
checkVoice("mr-IN with only English voices -> no voice", describe(pickVoice(ENGLISH_ONLY, "mr-IN")), "mr-IN none");
checkVoice("empty voice list -> no voice", describe(pickVoice([], "hi-IN")), "hi-IN none");

function describe(match: ReturnType<typeof pickVoice>): string {
  if (!match.voice) return `${match.lang} none`;
  return `${match.lang} ${match.exact ? "exact" : "fallback"} ${match.voice.name}`;
}

// ---------------------------------------------------------------------------
console.log("");
console.log(failures === 0 ? "All voice unit tests passed." : `${failures} test(s) FAILED.`);
if (failures > 0) process.exit(1);
