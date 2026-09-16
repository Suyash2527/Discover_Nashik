// Shared text normalisation for voice queries (en / hi / mr).

/**
 * Lowercase, drop punctuation, collapse whitespace.
 *
 * Diacritic stripping is deliberately limited to the Latin combining range
 * (U+0300–U+036F). A blanket `\p{M}` strip would destroy Devanagari matras —
 * "हॉस्पिटल" would become "हासपटल" — so Indic marks are preserved as-is.
 */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    // \p{M} must stay in the allow-list: Devanagari vowel signs (ा ि ो ्) are
    // Marks, not Letters, so dropping marks here would shred "दवाखाना" into
    // "दव ख न". Latin diacritics were already folded away by the NFD pass.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(" ") : [];
}

/** Levenshtein edit distance (iterative, single row — fine for short strings). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** 0..1 similarity. 1 = identical. Tolerates STT/spelling noise like "ramkond". */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}
