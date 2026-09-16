// Offline retrieval over data/kumbh-knowledge.json — short, sourced facts about
// the Kumbh itself (customs, safety, helplines, transport, weather).
//
// Same spirit as lib/rag.ts: keyword + fuzzy, no embeddings, no network, JSON
// inlined at build time. The difference is the corpus: these are sentences, not
// names, so common words ("है", "आहे", "the") would match everything. Each token
// is therefore weighted by inverse document frequency — a word that appears in
// most facts contributes almost nothing, "112" or "akhada" contributes a lot —
// which saves maintaining a stop-word list in three languages.
import knowledgeData from "@/data/kumbh-knowledge.json";
import type { Lang } from "@/types";
import { normalize, similarity, tokens } from "./text";

export interface KnowledgeFact {
  id: string;
  topic: string;
  text_en: string;
  text_hi: string;
  text_mr: string;
  source_url: string;
}

export const KNOWLEDGE = knowledgeData as KnowledgeFact[];

/** Facts handed to Gemini per question. */
export const KNOWLEDGE_TOP_K = 3;

/**
 * Minimum score for a fact to be worth sending. One distinctive token hit
 * (idf ≈ log(25/1) ≈ 3.2) clears it; a lone common word does not.
 */
const MIN_SCORE = 2;

/**
 * Score at which a single fact is trustworthy enough to be SPOKEN on its own
 * by the offline fallback. Prompt context can afford a loose match; a pilgrim
 * hearing an unrelated fact read out cannot.
 */
export const OFFLINE_FACT_SCORE = 4;

/**
 * Function words. IDF already discounts them, but in a 25-fact corpus a word
 * like "far" or "is" can still look rare, and the question words carry no topic.
 */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "am", "was", "be", "it", "its", "i", "me", "my",
  "we", "you", "your", "to", "of", "in", "on", "at", "for", "and", "or", "do",
  "does", "can", "should", "what", "whats", "how", "when", "where", "why",
  "which", "who", "there", "this", "that", "far", "near", "tell", "about", "please",
  "है", "हैं", "क्या", "का", "की", "के", "में", "से", "को", "और", "मैं", "मुझे",
  "कहाँ", "कहां", "कैसे", "आहे", "आहेत", "काय", "का", "ची", "चे", "चा", "मध्ये",
  "आणि", "मी", "मला", "कुठे", "कसे", "किती", "कितना", "कितनी",
]);

export interface ScoredFact { fact: KnowledgeFact; score: number }

interface IndexedFact {
  fact: KnowledgeFact;
  /** Topic tokens count double: they are the curated keywords. */
  topic: Set<string>;
  body: Set<string>;
}

const INDEX: IndexedFact[] = KNOWLEDGE.map((fact) => ({
  fact,
  topic: new Set(tokens(fact.topic)),
  body: new Set(tokens(`${fact.text_en} ${fact.text_hi} ${fact.text_mr}`)),
}));

const IDF: Map<string, number> = (() => {
  const df = new Map<string, number>();
  for (const { topic, body } of INDEX) {
    for (const t of new Set([...topic, ...body])) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = INDEX.length;
  return new Map([...df].map(([t, d]) => [t, Math.log((n + 1) / d)]));
})();

const VOCAB = [...IDF.keys()];

/**
 * Best vocabulary match for a query token: exact, else prefix, else fuzzy.
 * Fuzzy catches STT noise ("akhara"/"akhada", "trimbak"/"trimbakeshwar").
 */
function expand(queryToken: string): Array<{ term: string; factor: number }> {
  if (IDF.has(queryToken)) return [{ term: queryToken, factor: 1 }];
  if (queryToken.length < 4) return [];

  const out: Array<{ term: string; factor: number }> = [];
  for (const term of VOCAB) {
    if (term.length < 4) continue;
    if (term.startsWith(queryToken) || queryToken.startsWith(term)) {
      out.push({ term, factor: 0.7 });
    } else if (similarity(term, queryToken) >= 0.8) {
      out.push({ term, factor: 0.6 });
    }
  }
  return out;
}

/** Scored facts for a question, best first. Language-agnostic like rag.ts. */
export function retrieveKnowledgeScored(query: string, k = KNOWLEDGE_TOP_K): ScoredFact[] {
  const queryTokens = [...new Set(tokens(normalize(query)))].filter((t) => !STOP_WORDS.has(t));
  if (!queryTokens.length) return [];

  const expanded = queryTokens.map(expand);

  return INDEX.map(({ fact, topic, body }) => {
    let score = 0;
    for (const matches of expanded) {
      // Each query token counts once, via its best-scoring vocabulary match.
      let best = 0;
      for (const { term, factor } of matches) {
        const weight = topic.has(term) ? 2 : body.has(term) ? 1 : 0;
        best = Math.max(best, weight * factor * (IDF.get(term) ?? 0));
      }
      score += best;
    }
    return { fact, score: Math.round(score * 100) / 100 };
  })
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id))
    .slice(0, k);
}

export function retrieveKnowledge(query: string, k = KNOWLEDGE_TOP_K): KnowledgeFact[] {
  return retrieveKnowledgeScored(query, k).map((s) => s.fact);
}

/**
 * Facts a pilgrim in trouble needs more than any place template: when one of
 * these matches strongly, the offline fallback speaks it first.
 */
export function isSafetyFact(fact: KnowledgeFact): boolean {
  return /^(emergency|lost|crowd)-/.test(fact.id);
}

export function factText(fact: KnowledgeFact, lang: Lang): string {
  return lang === "hi-IN" ? fact.text_hi : lang === "mr-IN" ? fact.text_mr : fact.text_en;
}
