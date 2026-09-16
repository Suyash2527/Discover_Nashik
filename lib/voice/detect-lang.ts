// Detect the language a pilgrim actually SPOKE, independent of the language
// toggle in the UI.
//
// Why this exists: the hook used to send `lang` straight from React state to
// both SpeechRecognition and /api/ask. Whatever the pilgrim said, the reply and
// the TTS came back in whatever the toggle happened to be on — and worse, the
// STT correction table rewrote place names into the wrong script. Somebody
// speaking Marathi to a phone left on English got an English answer read by an
// English voice.
//
// This is deliberately a heuristic, not a model: it must run in the browser,
// synchronously, on a 3-10 word utterance, with no network and no bundle cost.
// See DETECTION ACCURACY at the bottom for what it does and does not get right.
import type { Lang } from "@/types";

/** Devanagari block. */
const DEVANAGARI_G = /[ऀ-ॿ]/g;
const LATIN_G = /[A-Za-z]/g;

/**
 * Whole words that are strongly Marathi and essentially absent from Hindi.
 * Function words and copulas only — never content words, which travel freely
 * between the two languages (both say मंदिर, both say पाणी).
 */
const MARATHI_WORDS = new Set([
  // copula / negation — the single most reliable discriminator
  "आहे", "आहेत", "आहेस", "नाही", "नाहीत", "नव्हते", "होते", "होता", "असेल",
  // interrogatives
  "कुठे", "कुठं", "काय", "कसे", "कसं", "कशी", "कधी", "किती", "कोणते", "कोणता",
  // pronouns / particles
  "मला", "माझा", "माझी", "माझे", "तुम्ही", "तुला", "आम्ही", "आपण", "त्याला",
  "पाहिजे", "जवळ", "जवळचे", "जवळचं", "ठिकाण", "आणि", "पण",
  "मध्ये", "पासून", "पर्यंत", "साठी", "किंवा", "इथे", "तिथे", "सांगा",
]);

/**
 * Whole words that are strongly Hindi and essentially absent from Marathi.
 * Same rule: grammar, not vocabulary.
 */
const HINDI_WORDS = new Set([
  // copula / negation
  "है", "हैं", "हूँ", "हूं", "था", "थी", "थे", "नहीं", "नही", "होगा",
  // interrogatives
  "कहाँ", "कहां", "क्या", "कैसे", "कैसा", "कब", "कितना", "कितनी", "कौन", "कौनसा",
  // pronouns / particles
  "मुझे", "मेरा", "मेरी", "मेरे", "आप", "हम", "उसे", "उसका",
  "चाहिए", "पास", "नज़दीक", "नजदीक", "जगह", "और", "लेकिन",
  "में", "पर", "से", "तक", "लिए", "या", "यहाँ", "वहाँ", "बताइए", "बताओ",
]);

/**
 * Characters that betray the language regardless of which words were used.
 * ळ (LLA) and ऱ (RRA) are standard Marathi orthography and do not occur in
 * standard Hindi — one of these outweighs a whole sentence of shared vocabulary
 * (काळाराम is Marathi even with no verb in the utterance).
 */
const MARATHI_CHARS = /[ळऱ]/;
/**
 * Nuqta forms (क़ ज़ ड़ फ़ …) are a Hindi/Urdu borrowing convention Marathi does
 * not use.
 *
 * Matched as the combining nuqta U+093C plus the precomposed U+0958-U+095F
 * block, NOT as a character class of pre-typed digraphs: `[क़ज़ड़]` is really
 * [क ़ ज ़ ड ़] to the regex engine, which then matches the bare क in
 * त्र्यंबकेश्वर and scores half the corpus as Hindi.
 */
const HINDI_CHARS = /[क़-य़़]/;

/** Weight of a character-level hit relative to a single word hit. */
const CHAR_WEIGHT = 2;

/**
 * Minimum lead one language needs over the other to override the UI toggle.
 * 1 — a single unambiguous marker ("कुठे आहे" with nothing Hindi) is enough,
 * because the alternative is answering in a language the pilgrim did not speak.
 * A tie, or no markers at all, keeps the toggle.
 */
const MIN_MARGIN = 1;

/**
 * Share of cased characters that must be Devanagari before we call an utterance
 * Devanagari. Chrome's hi-IN/mr-IN recognisers routinely leak a Latin token
 * ("Trimbakeshwar", "OK") into an otherwise Devanagari sentence, so a simple
 * "any Devanagari" test is too eager and a "no Latin" test too strict.
 *
 * Low (a quarter) because the leaked token is usually a long proper noun:
 * "Trimbakeshwar कुठे आहे" is 13 Latin letters against 8 Devanagari ones and is
 * unambiguously a Marathi question.
 */
const DEVANAGARI_SHARE = 0.25;

export interface LangDetection {
  /** What to use downstream. Equals `fallback` when detection was ambiguous. */
  lang: Lang;
  /** False when we could not tell and kept the UI's language. */
  confident: boolean;
  /** Human-readable why, for the console line in lib/voice/index.ts. */
  reason: string;
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * Split on anything that is not a letter of either script, so that punctuation
 * and the danda do not fuse onto a marker word ("आहे?" must still match आहे).
 */
function words(text: string): string[] {
  return text.split(/[^ऀ-ॿA-Za-z]+/).filter(Boolean);
}

function scoreDevanagari(text: string): { mr: number; hi: number } {
  let mr = 0;
  let hi = 0;

  for (const word of words(text)) {
    if (MARATHI_WORDS.has(word)) mr++;
    if (HINDI_WORDS.has(word)) hi++;
  }

  if (MARATHI_CHARS.test(text)) mr += CHAR_WEIGHT;
  if (HINDI_CHARS.test(text)) hi += CHAR_WEIGHT;

  return { mr, hi };
}

/**
 * Decide which language `transcript` is in, falling back to `fallback` (the
 * UI's current selection) whenever the evidence does not clearly favour one.
 *
 * Falling back rather than guessing is the whole point: a wrong guess answers
 * a Marathi speaker in Hindi, which is worse than honouring the toggle they set
 * themselves.
 */
export function detectLang(transcript: string, fallback: Lang): LangDetection {
  const text = transcript.trim();
  if (!text) return { lang: fallback, confident: false, reason: "empty transcript" };

  const devanagari = count(text, DEVANAGARI_G);
  const latin = count(text, LATIN_G);
  const total = devanagari + latin;
  if (total === 0) {
    return { lang: fallback, confident: false, reason: "no letters to judge" };
  }

  // Latin script -> English. There is no third Latin-script option here, so
  // unlike the Hindi/Marathi split this needs no word evidence.
  if (devanagari / total < DEVANAGARI_SHARE) {
    return { lang: "en-IN", confident: true, reason: "Latin script" };
  }

  const { mr, hi } = scoreDevanagari(text);

  if (mr - hi >= MIN_MARGIN) {
    return { lang: "mr-IN", confident: true, reason: `Marathi markers ${mr} vs Hindi ${hi}` };
  }
  if (hi - mr >= MIN_MARGIN) {
    return { lang: "hi-IN", confident: true, reason: `Hindi markers ${hi} vs Marathi ${mr}` };
  }

  // Devanagari, but nothing told us which. Keep the toggle — unless it says
  // English, which the script has already ruled out; then Hindi is the safer
  // default of the two (wider comprehension among Kumbh pilgrims, and the
  // platform always has a Hindi TTS voice where it may lack a Marathi one).
  const lang: Lang = fallback === "en-IN" ? "hi-IN" : fallback;
  return {
    lang,
    confident: false,
    reason: `Devanagari but ambiguous (mr ${mr}, hi ${hi}); kept ${lang}`,
  };
}

// ---------------------------------------------------------------------------
// DETECTION ACCURACY — read before trusting this
// ---------------------------------------------------------------------------
// This is a word-list heuristic, so it is reliable exactly where the pilgrim
// used a function word and unreliable where they did not:
//
//   Reliable    "रामकुंड कुठे आहे" / "रामकुंड कहाँ है" — verb + interrogative.
//               Anything with ळ or a nuqta. Any Latin-script utterance.
//   Unreliable  Bare noun phrases ("त्र्यंबकेश्वर मंदिर", "जवळचे हॉस्पिटल"
//               minus the Marathi जवळचे) carry no grammar, so nothing to score.
//               Hindi-Marathi code-mixing, which is normal speech in Nashik,
//               can produce markers on both sides and score near-tied.
//               Romanised Hindi/Marathi typed into the text box ("ramkund
//               kuthe aahe") is called English — it is Latin script.
//
// All three of those land on the fallback (or on en-IN), i.e. the UI toggle the
// pilgrim chose, which is the same behaviour as before this file existed. The
// upside is one-sided: clear utterances now get the right language, ambiguous
// ones are no worse off. If field logs show a specific mishear repeating, add
// the offending word to the sets above rather than lowering MIN_MARGIN.
