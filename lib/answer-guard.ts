// Post-generation checks on a model answer. Used by lib/gemini.ts to reject an
// answer before a pilgrim hears it, and by scripts/eval-hard.ts to score answers.

/** Verified helplines from data/kumbh-knowledge.json — safe to say aloud. */
export const KNOWN_HELPLINES = ["112", "108", "1098", "181", "139", "100", "101", "102"];

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

function asciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/**
 * Phone-like numbers in `answer` that are not in `allowed`.
 *
 * A phone is a run of 6+ digits (spaces/dashes allowed inside, "+91" optional),
 * or a 3-5 digit number right after a calling word — "call 1077", "हेल्पलाइन
 * 1800". Bare short numbers are left alone: "28 km", "2027", "11 September".
 */
export function findUnknownPhoneNumbers(answer: string, allowed: string[] = []): string[] {
  const text = asciiDigits(answer);
  const ok = new Set([...KNOWN_HELPLINES, ...allowed].map((n) => n.replace(/\D/g, "")));
  const found = new Set<string>();

  for (const m of text.matchAll(/(?:\+?91[\s-]?)?\d[\d\s-]{4,}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 6) found.add(digits.replace(/^91(?=\d{10}$)/, ""));
  }
  const callWords = /(?:call|dial|helpline|phone|number|कॉल|फोन|फ़ोन|नंबर|हेल्पलाइन|क्रमांक|संपर्क)\D{0,12}(\d{3,5})\b(?![\s-]?\d)/gi;
  for (const m of text.matchAll(callWords)) found.add(m[1]);

  return [...found].filter((n) => !ok.has(n) && ![...ok].some((a) => a.length >= 6 && a.endsWith(n)));
}

/** Share of letters that are Devanagari, 0..1. */
export function devanagariRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[ऀ-ॿ]/.test(c)).length / letters.length;
}

/** Hindi vs Marathi from very common function words; "?" when unclear. */
export function hindiOrMarathi(text: string): "hi" | "mr" | "?" {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const hi = count(/(^|\s)(है|हैं|में|नहीं|करें|की|का|के|और|आप)(?=\s|[।,.?!]|$)/g);
  const mr = count(/(^|\s)(आहे|आहेत|मध्ये|नाही|करा|आणि|तुम्ही|व|चे|ची)(?=\s|[।,.?!]|$)/g);
  return hi === mr ? "?" : hi > mr ? "hi" : "mr";
}

/**
 * Is `answer` plausibly in `lang`? Deliberately lenient — proper nouns like
 * "Ramkund" in a Hindi answer are fine — it only catches a wholesale switch,
 * such as a search-grounded model echoing a Marathi news source to a Hindi
 * question.
 */
export function inLanguage(answer: string, lang: "en-IN" | "hi-IN" | "mr-IN"): boolean {
  const ratio = devanagariRatio(answer);
  if (lang === "en-IN") return ratio < 0.2;
  if (ratio < 0.6) return false;
  const guess = hindiOrMarathi(answer);
  return guess === "?" || guess === (lang === "hi-IN" ? "hi" : "mr");
}

/** Spoken output must be plain text: strip markdown and citation debris. */
export function toSpeakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\d+(?:,\s*\d+)*\]/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
