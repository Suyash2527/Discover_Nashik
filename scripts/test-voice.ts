// Unit tests for the browser-free parts of lib/voice.
//   npx tsx scripts/test-voice.ts
//
// SpeechRecognition and speechSynthesis cannot run here (or in jsdom), so the
// hook itself is verified manually in a real browser. What IS testable without
// a browser is tested here: the STT correction table and voice selection,
// including the mr-IN -> hi-IN fallback, and spoken-language detection.
import { detectLang } from "../lib/voice/detect-lang";
import { correctTranscript } from "../lib/voice/stt-corrections";
import { pickVoice, shouldUseExternalVoice } from "../lib/voice/tts";
import { isSpeechRecognitionSupported } from "../lib/voice/speech-recognition";
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
console.log("Spoken-language detection");
// ---------------------------------------------------------------------------
// The hook used to send the UI toggle's language to /api/ask no matter what was
// said. `fallback` below is that toggle: every case asserts what detectLang
// does when the toggle DISAGREES with the utterance, because agreeing is the
// case that was never broken.
const DETECT_CASES: Array<{
  input: string;
  fallback: Lang;
  expected: Lang;
  confident: boolean;
  note: string;
}> = [
  // --- Clear Hindi -----------------------------------------------------------
  { input: "रामकुंड कहाँ है", fallback: "en-IN", expected: "hi-IN", confident: true, note: "kahan hai" },
  { input: "क्या भीड़ सुरक्षित है", fallback: "mr-IN", expected: "hi-IN", confident: true, note: "kya ... hai" },
  { input: "मुझे नज़दीक अस्पताल चाहिए", fallback: "mr-IN", expected: "hi-IN", confident: true, note: "mujhe/chahiye" },
  { input: "त्र्यंबकेश्वर कैसे जाऊं", fallback: "en-IN", expected: "hi-IN", confident: true, note: "kaise" },
  { input: "यहाँ शौचालय कहाँ है", fallback: "mr-IN", expected: "hi-IN", confident: true, note: "yahan/kahan" },

  // --- Clear Marathi ---------------------------------------------------------
  { input: "रामकुंड कुठे आहे", fallback: "en-IN", expected: "mr-IN", confident: true, note: "kuthe aahe" },
  { input: "जवळचे हॉस्पिटल कुठे आहे", fallback: "hi-IN", expected: "mr-IN", confident: true, note: "javalche" },
  { input: "मला पाणी पाहिजे", fallback: "hi-IN", expected: "mr-IN", confident: true, note: "mala/pahije" },
  { input: "कुंभमेळा म्हणजे काय", fallback: "en-IN", expected: "mr-IN", confident: true, note: "kay" },
  // ळ alone is decisive: no verb, no interrogative, still unmistakably Marathi.
  { input: "काळाराम मंदिर", fallback: "hi-IN", expected: "mr-IN", confident: true, note: "LLA character" },

  // --- Clear English ---------------------------------------------------------
  { input: "where is Ramkund", fallback: "mr-IN", expected: "en-IN", confident: true, note: "Latin" },
  { input: "what should I wear for the holy bath", fallback: "hi-IN", expected: "en-IN", confident: true, note: "Latin" },
  { input: "nearest toilet in Panchavati", fallback: "mr-IN", expected: "en-IN", confident: true, note: "Latin" },
  { input: "Is it safe to bring kids", fallback: "hi-IN", expected: "en-IN", confident: true, note: "Latin" },

  // --- Mixed script: a Latin token leaking into Devanagari must not flip it ---
  { input: "Trimbakeshwar कुठे आहे", fallback: "hi-IN", expected: "mr-IN", confident: true, note: "mixed, Devanagari-dominant" },
  { input: "Ramkund कहाँ है", fallback: "mr-IN", expected: "hi-IN", confident: true, note: "mixed, Devanagari-dominant" },

  // --- Ambiguous: MUST keep the UI language rather than guess ---------------
  // Bare noun phrases carry no grammar, so there is nothing to score.
  { input: "त्र्यंबकेश्वर मंदिर", fallback: "hi-IN", expected: "hi-IN", confident: false, note: "no markers" },
  { input: "त्र्यंबकेश्वर मंदिर", fallback: "mr-IN", expected: "mr-IN", confident: false, note: "no markers" },
  // Devanagari with the toggle on English: script rules en-IN out, Hindi is the
  // safer of the two remaining.
  { input: "गोदावरी", fallback: "en-IN", expected: "hi-IN", confident: false, note: "Devanagari, toggle was en" },
  // Code-mixed, markers on both sides -> tie -> keep the toggle.
  { input: "हॉस्पिटल कुठे है", fallback: "hi-IN", expected: "hi-IN", confident: false, note: "tie" },
  { input: "हॉस्पिटल कुठे है", fallback: "mr-IN", expected: "mr-IN", confident: false, note: "tie" },
  // Nothing to judge at all.
  { input: "", fallback: "mr-IN", expected: "mr-IN", confident: false, note: "empty" },
  { input: "   ", fallback: "en-IN", expected: "en-IN", confident: false, note: "blank" },
  { input: "123 456", fallback: "hi-IN", expected: "hi-IN", confident: false, note: "no letters" },
];

for (const c of DETECT_CASES) {
  const got = detectLang(c.input, c.fallback);
  check(
    `[toggle ${c.fallback}] "${c.input}" (${c.note})`,
    `${got.lang} ${got.confident ? "confident" : "fallback"}`,
    `${c.expected} ${c.confident ? "confident" : "fallback"}`,
  );
}

// The real pipeline order: detect on the RAW transcript, then correct with the
// DETECTED language. Correcting first with the stale toggle would rewrite
// "रामकुंड" to "Ramkund" and destroy the evidence the detector reads.
// ---------------------------------------------------------------------------
console.log("");
console.log("Detection + correction, in pipeline order");
// ---------------------------------------------------------------------------
const PIPELINE_CASES: Array<{ raw: string; toggle: Lang; lang: Lang; corrected: string }> = [
  // UI on English, pilgrim speaks Marathi: answer must be Marathi AND the
  // mishear must be repaired in Devanagari, not romanised.
  { raw: "राम कुंड कुठे आहे", toggle: "en-IN", lang: "mr-IN", corrected: "रामकुंड कुठे आहे" },
  // UI on Marathi, pilgrim speaks Hindi.
  { raw: "ट्रिंबकेश्वर कहाँ है", toggle: "mr-IN", lang: "hi-IN", corrected: "त्र्यंबकेश्वर कहाँ है" },
  // UI on Hindi, pilgrim speaks English.
  { raw: "where is ram cond", toggle: "hi-IN", lang: "en-IN", corrected: "where is Ramkund" },
  // Agreement case: unchanged behaviour.
  { raw: "काला राम मंदिर कुठे आहे", toggle: "mr-IN", lang: "mr-IN", corrected: "काळाराम मंदिर कुठे आहे" },
];

for (const c of PIPELINE_CASES) {
  const detected = detectLang(c.raw, c.toggle).lang;
  check(`[toggle ${c.toggle}] "${c.raw}" -> lang`, detected, c.lang);
  check(`[toggle ${c.toggle}] "${c.raw}" -> text`, correctTranscript(c.raw, detected), c.corrected);
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
console.log("Online vs Offline Routing");
// ---------------------------------------------------------------------------

// Helper to manipulate globals safely in Node
function setGlobals(onLine: boolean, withSynth: boolean, withStt: boolean) {
  Object.defineProperty(global, 'navigator', {
    value: { onLine },
    writable: true,
    configurable: true
  });
  
  const synth = withSynth ? {
    getVoices: () => [voice("en-IN")], // Only en-IN, so mr-IN fails exact match
    addEventListener: (e: any, cb: any) => setTimeout(cb, 0),
    removeEventListener: () => {}
  } : undefined;

  Object.defineProperty(global, 'window', {
    value: {
      ...(withSynth ? { speechSynthesis: synth } : {}),
      ...(withStt ? { SpeechRecognition: class {} } : {})
    },
    writable: true,
    configurable: true
  });
}

const originalNavigator = (global as any).navigator;
const originalWindow = (global as any).window;

// 1. Online: Always use Sarvam
setGlobals(true, true, true);
shouldUseExternalVoice("mr-IN").then(res => {
  check("Online TTS always uses external (Sarvam)", res.toString(), "true");
  check("Online STT always supported (Sarvam)", isSpeechRecognitionSupported().toString(), "true");

  // 2. Offline: Fall back to Web Speech
  setGlobals(false, true, true);
  shouldUseExternalVoice("mr-IN").then(resOffline => {
    check("Offline TTS evaluates fallback (needs mr-IN, has en-IN -> true)", resOffline.toString(), "true");
    check("Offline STT relies on Web Speech (available -> true)", isSpeechRecognitionSupported().toString(), "true");
    
    // 3. Offline without Web Speech
    setGlobals(false, false, false);
    shouldUseExternalVoice("hi-IN").then(resNoSynth => {
      check("Offline TTS without synth (true)", resNoSynth.toString(), "true");
      check("Offline STT without Web Speech (false)", isSpeechRecognitionSupported().toString(), "false");
      
      // Restore
      Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true });
      Object.defineProperty(global, 'window', { value: originalWindow, writable: true, configurable: true });

      console.log("");
      console.log(failures === 0 ? "All voice unit tests passed." : `${failures} test(s) FAILED.`);
      if (failures > 0) process.exit(1);
    });
  });
});
