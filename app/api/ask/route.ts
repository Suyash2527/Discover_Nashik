// POST /api/ask — AskRequest -> AskResponse.
//
// Retrieval is always local and always runs first:
//   places     — data/places.json (lib/rag.ts), nearest-first for category asks
//   facts      — data/kumbh-knowledge.json (lib/knowledge.ts), top 3
//   advisories — active Firestore advisories (lib/advisories.ts), best-effort
//   history    — optional previous turns, so "how far is it?" has a subject
//
// Then Gemini answers (lib/gemini.ts answerSmart): Flash for simple questions,
// a stronger model hedged with Flash for complex ones, and Google Search
// grounding only for current-conditions questions. Mode still decides what
// Gemini may do with the places:
//
//   grounded — retrieval found a place the pilgrim named (or referred back to).
//   general  — no place named; Kumbh knowledge + verified facts, no invented
//              places, numbers, prices or dates.
//
// Gemini gets a hard deadline, else we degrade offline: grounded falls back to
// the local templates, general to the best matching verified fact, or to an
// honest "needs a connection" line.
//
// REQUEST EXTENSION (not in /types, which is locked): the body may carry an
// optional `history: { role: "user" | "assistant"; text: string }[]` — see
// lib/history.ts. Clients that omit it get exactly the previous behaviour.
import type { NextRequest } from "next/server";
import { getActiveAdvisories } from "@/lib/advisories";
import {
  answerSmart,
  classifyAnswerMode,
  classifyComplexity,
  generalOfflineAnswer,
  isFollowUp,
  isGeminiConfigured,
  NAME_MATCH_FLOOR,
  needsLiveSearch,
  type AnswerMode,
} from "@/lib/gemini";
import { parseHistory, type HistoryTurn } from "@/lib/history";
import { answerOffline } from "@/lib/intent-offline";
import { factText, isSafetyFact, OFFLINE_FACT_SCORE, retrieveKnowledgeScored, type ScoredFact } from "@/lib/knowledge";
import { detectCategoryIntents, PLACES, queryNamesPlace, retrieveScored, retrieveScoredNear, type ScoredPlace } from "@/lib/rag";
import { normalize } from "@/lib/text";
import type { Advisory, AskRequest, AskResponse, Lang, Place } from "@/types";

const LANGS: Lang[] = ["en-IN", "hi-IN", "mr-IN"];

/** AskRequest plus the optional, route-local conversation memory. */
type AskRequestWithHistory = AskRequest & { history?: HistoryTurn[] };

/**
 * Budget for a simple question. CONTEXT.md caps a voice answer at ~3 s end to
 * end, so 2.5 s leaves room for STT handoff and TTS start. Env-overridable to
 * tune the field without a redeploy (and to exercise the fallback in tests).
 */
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 2500;

/**
 * Budget for complex and live-conditions questions. The stronger model and
 * search grounding each cost ~0.5 s more, and a pilgrim asking a two-part
 * question tolerates a beat longer than one asking "where is Ramkund".
 */
const GEMINI_COMPLEX_TIMEOUT_MS = Number(process.env.GEMINI_COMPLEX_TIMEOUT_MS) || 3000;

/** Advisories are a nice-to-have; never let them eat the answer budget. */
const ADVISORY_WAIT_MS = 400;

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(body: unknown): AskRequestWithHistory | null {
  if (typeof body !== "object" || body === null) return null;
  const { query, lang, lat, lng, history } = body as Record<string, unknown>;

  if (typeof query !== "string" || !query.trim()) return null;
  if (typeof lang !== "string" || !LANGS.includes(lang as Lang)) return null;

  const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const parsedLat = coord(lat);
  const parsedLng = coord(lng);
  const turns = parseHistory(history);

  return {
    query: query.trim().slice(0, 500),
    lang: lang as Lang,
    ...(parsedLat !== undefined && { lat: parsedLat }),
    ...(parsedLng !== undefined && { lng: parsedLng }),
    ...(turns.length > 0 && { history: turns }),
  };
}

/** Reject after `ms` so a slow Gemini can never hold the response open. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Every spoken name of a place, normalised, long enough to match safely. */
function needles(place: Place): string[] {
  return [place.name.en, place.name.hi, place.name.mr, ...place.aliases]
    .map((n) => normalize(n))
    .filter((needle) => needle.length >= 3);
}

/**
 * Which retrieved places the answer actually talks about.
 *
 * Gemini picks which places to mention, so we match names/aliases against the
 * answer text. If nothing matches (a short answer, or a paraphrased name) we
 * fall back to everything retrieved — the map showing a few extra candidate
 * pins beats it showing none.
 *
 * Mentioned places are ordered by where they appear in the answer, not by
 * retrieval rank: the UI treats placeIds[0] as the primary pin, so it must be
 * the place the pilgrim just heard named first.
 */
function referencedPlaceIds(answer: string, places: Place[]): string[] {
  const haystack = ` ${normalize(answer)} `;

  const mentioned = places
    .map((place) => {
      const positions = needles(place).map((n) => haystack.indexOf(n)).filter((at) => at >= 0);
      return { place, at: positions.length ? Math.min(...positions) : -1 };
    })
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);

  return (mentioned.length ? mentioned.map((m) => m.place) : places).map((p) => p.id);
}

/**
 * Places the answer text actually names — no padding.
 *
 * The "all retrieved" fallback above is wrong in general mode: a reply about
 * crowd safety would pin whatever a category word happened to match.
 */
function mentionedPlaceIds(answer: string, places: Place[]): string[] {
  const haystack = ` ${normalize(answer)} `;
  return places
    .filter((place) => needles(place).some((n) => haystack.includes(n)))
    .map((p) => p.id);
}

function placeIdsFor(mode: AnswerMode, answer: string, places: Place[]): string[] {
  return mode === "grounded"
    ? referencedPlaceIds(answer, places)
    : mentionedPlaceIds(answer, places);
}

/**
 * Resolve "how far is it?" against the conversation.
 *
 * The place the guide last NAMED wins (the pilgrim asked "nearest chemist",
 * the guide said "Wellness Forever" — "it" is Wellness Forever, not every
 * chemist). Failing that, re-run retrieval on the pilgrim's previous question.
 * Only used when the current question names no place of its own.
 */
function placesFromHistory(history: HistoryTurn[], lang: Lang): ScoredPlace[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role === "assistant") {
      const haystack = ` ${normalize(turn.text)} `;
      const named = PLACES
        .map((place) => ({
          place,
          // Names only: aliases include category words ("chemist") that would
          // match every place of that kind.
          at: Math.min(
            ...[place.name.en, place.name.hi, place.name.mr]
              .map((n) => haystack.indexOf(` ${normalize(n)}`))
              .filter((at) => at >= 0),
            Infinity,
          ),
        }))
        .filter((m) => m.at !== Infinity)
        .sort((a, b) => a.at - b.at)
        .map((m) => ({ place: m.place, score: NAME_MATCH_FLOOR }));
      if (named.length) return named.slice(0, 3);
    } else {
      const scored = retrieveScored(turn.text, lang);
      if (scored.length) return scored;
    }
  }
  return [];
}

/**
 * Offline degradation, per mode.
 *
 * A strongly matched SAFETY fact wins over everything: "my son is lost near
 * Ramkund" names a place, but "Ramkund is in Panchavati, open 24 hours" is the
 * wrong thing to say to a parent — "call 112, go to the police post" is right.
 *
 * Otherwise grounded keeps the local distance/timings templates — genuinely
 * useful with no network. General answers from the best verified fact when one matched
 * ("what is 112" still works with Gemini down), else says plainly that it
 * needs a connection.
 */
function offlineAnswer(
  mode: AnswerMode,
  query: string,
  lang: Lang,
  places: Place[],
  facts: ScoredFact[],
  placeNamed: boolean,
  origin?: { lat: number; lng: number },
): string {
  const safety = facts.find((f) => isSafetyFact(f.fact) && f.score >= OFFLINE_FACT_SCORE);
  if (safety) return factText(safety.fact, lang);
  // A place matched without being named ("Amrit SNAN dates" -> ghats) loses
  // to a strongly matching fact: the pilgrim asked about the fact.
  if (facts[0] && facts[0].score >= OFFLINE_FACT_SCORE && !placeNamed) {
    return factText(facts[0].fact, lang);
  }
  if (mode === "grounded" && places.length > 0) {
    return answerOffline(query, lang, places, origin);
  }
  if (facts[0] && facts[0].score >= OFFLINE_FACT_SCORE) return factText(facts[0].fact, lang);
  return generalOfflineAnswer(lang);
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Body must be valid JSON");
  }

  const parsed = parseBody(raw);
  if (!parsed) return badRequest("Expected { query: string, lang: 'en-IN'|'hi-IN'|'mr-IN' }");

  const { query, lang, lat, lng, history = [] } = parsed;
  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;

  // Start the (network) advisory read first so it runs alongside retrieval.
  const advisoriesPromise: Promise<Advisory[]> = withTimeout(getActiveAdvisories(), ADVISORY_WAIT_MS)
    .catch(() => []);

  let scored = retrieveScoredNear(query, lang, origin, NAME_MATCH_FLOOR);
  let topScore = scored[0]?.score ?? 0;
  let previousQuestion = "";

  const followUp = history.length > 0 && topScore < NAME_MATCH_FLOOR && isFollowUp(query);
  if (followUp) {
    const fromHistory = placesFromHistory(history, lang);
    if (fromHistory.length) {
      scored = fromHistory;
      topScore = Math.max(NAME_MATCH_FLOOR, fromHistory[0].score);
    }
    previousQuestion = [...history].reverse().find((t) => t.role === "user")?.text ?? "";
  }

  const places = scored.map((s) => s.place);
  // A follow-up's places came from the conversation, which counts as named.
  const placeNamed = followUp && places.length > 0 || places.some((p) => queryNamesPlace(query, p));
  const mode = classifyAnswerMode(query, topScore);
  const scoredFacts = retrieveKnowledgeScored(previousQuestion ? `${query} ${previousQuestion}` : query);
  const facts = scoredFacts.map((s) => s.fact);
  const complexity = classifyComplexity(query);
  // A question about a specific place ("is it open right now?") is answered
  // from our data, not the web — only LIVE_TOPICS words can still force search.
  const live = needsLiveSearch(query, detectCategoryIntents(query).size > 0 || mode === "grounded");

  let answer: string;
  let source: AskResponse["source"] = "offline";
  let path = "offline";

  if (isGeminiConfigured()) {
    const advisories = await advisoriesPromise;
    const budget = complexity === "complex" || live ? GEMINI_COMPLEX_TIMEOUT_MS : GEMINI_TIMEOUT_MS;
    try {
      const smart = await withTimeout(
        answerSmart({ query, lang, places, facts, advisories, history, origin, mode, complexity }, live),
        budget,
      );
      answer = smart.answer;
      path = smart.path;
      source = "gemini";
    } catch (error) {
      console.warn(
        `[api/ask] Gemini unavailable (${mode}/${complexity}${live ? "/live" : ""}), answering offline:`,
        (error as Error).message,
      );
      answer = offlineAnswer(mode, query, lang, places, scoredFacts, placeNamed, origin);
    }
  } else {
    answer = offlineAnswer(mode, query, lang, places, scoredFacts, placeNamed, origin);
  }

  console.info(
    `[api/ask] ${mode}/${complexity}${live ? "/live" : ""}${followUp ? "/follow-up" : ""} ` +
      `path=${path} facts=${facts.map((f) => f.id).join(",") || "-"} ${Date.now() - started}ms`,
  );

  const response: AskResponse = {
    answer,
    placeIds: placeIdsFor(mode, answer, places),
    source,
  };
  return Response.json(response);
}
