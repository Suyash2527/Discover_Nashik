// POST /api/ask — AskRequest -> AskResponse.
//
// Retrieval is always local and always runs first. What changes is what Gemini
// is then allowed to do with the result:
//
//   grounded — retrieval found a place the pilgrim named. Gemini may use
//              NOTHING but those places (unchanged behaviour).
//   general  — retrieval found nothing, or only a category word on an
//              advice-shaped question. Gemini answers as a Kumbh/Nashik
//              assistant from its own knowledge, but still may not invent
//              place names, addresses or phone numbers.
//
// Either way Gemini gets GEMINI_TIMEOUT_MS to reply, else we degrade offline:
// grounded falls back to the local templates, general to an honest
// "needs a connection" line. A pilgrim in a crowd never waits more than ~2.5 s.
import type { NextRequest } from "next/server";
import {
  answerGeneralWithGemini,
  answerWithGemini,
  classifyAnswerMode,
  generalOfflineAnswer,
  isGeminiConfigured,
  type AnswerMode,
} from "@/lib/gemini";
import { answerOffline } from "@/lib/intent-offline";
import { retrieveScored } from "@/lib/rag";
import { normalize } from "@/lib/text";
import type { AskRequest, AskResponse, Lang, Place } from "@/types";

const LANGS: Lang[] = ["en-IN", "hi-IN", "mr-IN"];

/**
 * Budget for the Gemini call. CONTEXT.md caps a voice answer at 3 s end to end,
 * so 2.5 s leaves room for STT handoff and TTS start. Env-overridable to tune
 * the field without a redeploy (and to exercise the fallback in tests).
 */
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 2500;

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(body: unknown): AskRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { query, lang, lat, lng } = body as Record<string, unknown>;

  if (typeof query !== "string" || !query.trim()) return null;
  if (typeof lang !== "string" || !LANGS.includes(lang as Lang)) return null;

  const coord = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const parsedLat = coord(lat);
  const parsedLng = coord(lng);

  return {
    query: query.trim().slice(0, 500),
    lang: lang as Lang,
    ...(parsedLat !== undefined && { lat: parsedLat }),
    ...(parsedLng !== undefined && { lng: parsedLng }),
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

/**
 * Which retrieved places the answer actually talks about.
 *
 * Gemini is told to use only these places but picks which ones to mention, so
 * we match names/aliases against the answer text. If nothing matches (a short
 * answer, or a paraphrased name) we fall back to everything retrieved — the map
 * showing a few extra candidate pins beats it showing none.
 *
 * Mentioned places are ordered by where they appear in the answer, not by
 * retrieval rank: both answer layers may re-rank (the offline templates sort by
 * distance for "nearest" queries), and the UI treats placeIds[0] as the primary
 * pin — so it must be the place the pilgrim just heard named first.
 */
function referencedPlaceIds(answer: string, places: Place[]): string[] {
  const haystack = ` ${normalize(answer)} `;

  const mentioned = places
    .map((place) => {
      const positions = [place.name.en, place.name.hi, place.name.mr, ...place.aliases]
        .map((n) => normalize(n))
        .filter((needle) => needle.length >= 3)
        .map((needle) => haystack.indexOf(needle))
        .filter((at) => at >= 0);
      return { place, at: positions.length ? Math.min(...positions) : -1 };
    })
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);

  return (mentioned.length ? mentioned.map((m) => m.place) : places).map((p) => p.id);
}

/**
 * Places the answer text actually names — no padding.
 *
 * referencedPlaceIds() deliberately falls back to "all retrieved" so a grounded
 * answer always lights up the map. That fallback is wrong in general mode: a
 * reply about crowd safety would pin whatever a category word happened to
 * match, sending the pilgrim to an unrelated pin.
 */
function mentionedPlaceIds(answer: string, places: Place[]): string[] {
  const haystack = ` ${normalize(answer)} `;
  return places
    .filter((place) =>
      [place.name.en, place.name.hi, place.name.mr, ...place.aliases].some((n) => {
        const needle = normalize(n);
        return needle.length >= 3 && haystack.includes(needle);
      }),
    )
    .map((p) => p.id);
}

function placeIdsFor(mode: AnswerMode, answer: string, places: Place[]): string[] {
  return mode === "grounded"
    ? referencedPlaceIds(answer, places)
    : mentionedPlaceIds(answer, places);
}

/**
 * Offline degradation, per mode.
 *
 * Grounded keeps the local distance/timings templates — those are genuinely
 * useful with no network. General has nothing to template from (the question
 * was not about a place), so it says so plainly instead of returning the
 * "not in my offline list" line, which would be a non-sequitur.
 */
function offlineAnswer(
  mode: AnswerMode,
  query: string,
  lang: Lang,
  places: Place[],
  origin?: { lat: number; lng: number },
): string {
  if (mode === "grounded" && places.length > 0) {
    return answerOffline(query, lang, places, origin);
  }
  return generalOfflineAnswer(lang);
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("Body must be valid JSON");
  }

  const parsed = parseBody(raw);
  if (!parsed) return badRequest("Expected { query: string, lang: 'en-IN'|'hi-IN'|'mr-IN' }");

  const { query, lang, lat, lng } = parsed;
  const origin = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;

  const scored = retrieveScored(query, lang);
  const places = scored.map((s) => s.place);
  const mode = classifyAnswerMode(query, scored[0]?.score ?? 0);

  let answer: string;
  let source: AskResponse["source"] = "offline";

  if (isGeminiConfigured()) {
    try {
      answer = await withTimeout(
        mode === "grounded"
          ? answerWithGemini(query, lang, places)
          : answerGeneralWithGemini(query, lang, places),
        GEMINI_TIMEOUT_MS,
      );
      source = "gemini";
    } catch (error) {
      console.warn(
        `[api/ask] Gemini unavailable (${mode}), answering offline:`,
        (error as Error).message,
      );
      answer = offlineAnswer(mode, query, lang, places, origin);
    }
  } else {
    answer = offlineAnswer(mode, query, lang, places, origin);
  }

  const response: AskResponse = {
    answer,
    placeIds: placeIdsFor(mode, answer, places),
    source,
  };
  return Response.json(response);
}
