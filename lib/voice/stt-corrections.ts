// Repair common speech-to-text mishears of Nashik place names before the query
// reaches retrieval.
//
// Why this lives in code and not in data/places.raw.csv: these strings are not
// places or even aliases of places — they are artefacts of the recogniser
// ("tribakeshwar", "ram cond"). The CSV holds curated facts about real places;
// this holds recogniser noise, and must work even for a name the dataset has
// not been filled in with yet.
import { normalize, similarity } from "../text";
import type { Lang } from "@/types";

type LangKey = "en" | "hi" | "mr";

const langKey = (lang: Lang): LangKey =>
  lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en";

export interface CorrectionEntry {
  /** What to write back, per output language. */
  canonical: Record<LangKey, string>;
  /** Mishears and spelling variants, any script. Matched case/diacritic-insensitively. */
  variants: string[];
}

/**
 * Curated mishear table for the names pilgrims say most.
 * Devanagari variants matter as much as Latin ones: Chrome's hi-IN/mr-IN models
 * routinely return त्रंबकेश्वर or ट्रिंबकेश्वर for त्र्यंबकेश्वर.
 */
export const CORRECTIONS: CorrectionEntry[] = [
  {
    canonical: { en: "Trimbakeshwar", hi: "त्र्यंबकेश्वर", mr: "त्र्यंबकेश्वर" },
    variants: [
      "trimbakeshwar", "trambakeshwar", "trimbakeshwer", "trimbakeshvar",
      "tryambakeshwar", "triambakeshwar", "tribakeshwar", "trimbakeswar",
      "thrimbakeshwar", "trimbak eshwar", "trambak eshwar",
      "त्र्यंबकेश्वर", "त्रंबकेश्वर", "त्रिंबकेश्वर", "त्रयंबकेश्वर",
      "ट्रिंबकेश्वर", "त्रिम्बकेश्वर",
    ],
  },
  {
    canonical: { en: "Trimbak", hi: "त्र्यंबक", mr: "त्र्यंबक" },
    variants: ["trimbak", "trambak", "tribak", "thrimbak", "त्रंबक", "त्रिंबक", "ट्रिंबक"],
  },
  {
    canonical: { en: "Ramkund", hi: "रामकुंड", mr: "रामकुंड" },
    variants: [
      "ramkund", "ram kund", "raamkund", "raam kund", "ramkunda", "ramkond",
      "ram cond", "ram cund", "ramcund", "ram khund", "ramkhund", "ram gund",
      "रामकुंड", "राम कुंड", "रामकुण्ड", "रामकूंड",
    ],
  },
  {
    canonical: { en: "Panchavati", hi: "पंचवटी", mr: "पंचवटी" },
    variants: [
      "panchavati", "panchvati", "panch vati", "pancha vati", "punchavati",
      "panchawati", "panchvathi", "panchavathi", "punch vati",
      "पंचवटी", "पञ्चवटी", "पंचवटि",
    ],
  },
  {
    canonical: { en: "Tapovan", hi: "तपोवन", mr: "तपोवन" },
    variants: [
      "tapovan", "tapowan", "tapoban", "tap ovan", "tapovana", "thapovan",
      "तपोवन", "तापोवन",
    ],
  },
  {
    canonical: { en: "Kalaram", hi: "कालाराम", mr: "काळाराम" },
    variants: [
      "kalaram", "kala ram", "kaalaram", "kaala ram", "kalaaram", "kalarm",
      "kalaram mandir", "kalla ram", "काळाराम", "कालाराम", "काला राम", "कळाराम",
    ],
  },
  {
    canonical: { en: "Kapaleshwar", hi: "कपालेश्वर", mr: "कपालेश्वर" },
    variants: ["kapaleshwar", "kapleshwar", "kapaleshwer", "kapileshwar", "कपालेश्वर", "कपलेश्वर"],
  },
  {
    canonical: { en: "Muktidham", hi: "मुक्तिधाम", mr: "मुक्तिधाम" },
    variants: ["muktidham", "mukti dham", "muktidam", "mukthidham", "मुक्तिधाम", "मुक्ती धाम"],
  },
  {
    canonical: { en: "Sita Gufa", hi: "सीता गुफा", mr: "सीता गुंफा" },
    variants: ["sita gufa", "sita gupha", "seeta gufa", "sita guha", "सीता गुफा", "सीता गुंफा"],
  },
  {
    canonical: { en: "Saptashrungi", hi: "सप्तश्रृंगी", mr: "सप्तशृंगी" },
    variants: [
      "saptashrungi", "saptashringi", "sapta shrungi", "saptshrungi",
      "septashrungi", "सप्तशृंगी", "सप्तश्रृंगी", "सप्तशृंगि",
    ],
  },
  {
    canonical: { en: "Godavari", hi: "गोदावरी", mr: "गोदावरी" },
    variants: ["godavari", "godawari", "goda vari", "godaveri", "gowdavari", "गोदावरी", "गोदावरि"],
  },
  {
    canonical: { en: "Nashik", hi: "नासिक", mr: "नाशिक" },
    variants: ["nashik", "nasik", "naashik", "nashique", "nashikh", "नाशिक", "नासिक"],
  },
];

/** Longest variant first, so "trimbakeshwar" wins over the "trimbak" entry. */
interface IndexedVariant { normalized: string; words: number; entry: CorrectionEntry }

const VARIANT_INDEX: IndexedVariant[] = CORRECTIONS.flatMap((entry) =>
  entry.variants.map((variant) => {
    const normalized = normalize(variant);
    return { normalized, words: normalized.split(" ").length, entry };
  }),
)
  .filter((v) => v.normalized.length > 0)
  .sort((a, b) => b.normalized.length - a.normalized.length);

const MAX_WINDOW = Math.max(...VARIANT_INDEX.map((v) => v.words));

/**
 * Minimum similarity for a fuzzy (non-exact) correction.
 *
 * Tuned conservatively on purpose: this rewrites what the pilgrim said, so a
 * false positive silently sends them to the wrong temple. 0.82 accepts one or
 * two dropped/swapped characters in a long name and rejects short-word
 * coincidences. Raise it if you see over-correction in the field.
 */
export const FUZZY_THRESHOLD = 0.82;

/** Shortest string we will fuzzy-match at all; below this, only exact hits. */
const MIN_FUZZY_LENGTH = 6;

function findMatch(phrase: string, windowWords: number): CorrectionEntry | null {
  let best: { entry: CorrectionEntry; score: number } | null = null;

  for (const variant of VARIANT_INDEX) {
    if (variant.words !== windowWords) continue;
    if (variant.normalized === phrase) return variant.entry;

    if (phrase.length >= MIN_FUZZY_LENGTH && variant.normalized.length >= MIN_FUZZY_LENGTH) {
      const score = similarity(phrase, variant.normalized);
      if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
        best = { entry: variant.entry, score };
      }
    }
  }
  return best?.entry ?? null;
}

/**
 * Rewrite recognised place names to their canonical form in `lang`.
 *
 * Greedy longest-window-first over the raw words, so a multi-word mishear
 * ("ram cond", "kala ram") is corrected as a unit. Words that match nothing are
 * passed through untouched — this must never drop what the pilgrim said.
 */
export function correctTranscript(transcript: string, lang: Lang): string {
  const key = langKey(lang);
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched = false;

    for (let size = Math.min(MAX_WINDOW, words.length - i); size >= 1 && !matched; size--) {
      const phrase = normalize(words.slice(i, i + size).join(" "));
      if (!phrase) continue;

      const entry = findMatch(phrase, size);
      if (entry) {
        out.push(entry.canonical[key]);
        i += size;
        matched = true;
      }
    }

    if (!matched) out.push(words[i++]);
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}
