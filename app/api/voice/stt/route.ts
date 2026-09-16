// POST /api/voice/stt — multipart { audio, lang } -> { transcript }.
//
// The client only reaches this after Web Speech has failed it (unsupported
// browser, or repeated no-speech). 503 means "Sarvam is not available" and is
// a normal, expected answer — the client degrades to a typed question.
import type { NextRequest } from "next/server";
import { isSarvamConfigured, SarvamAuthError, speechToText } from "@/lib/sarvam";
import type { Lang } from "@/types";

const LANGS: Lang[] = ["en-IN", "hi-IN", "mr-IN"];

/** Guard against an oversized upload holding a serverless function open. A
 *  question is a few seconds of opus; 4 MB is generous. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!isSarvamConfigured()) {
    return Response.json({ error: "Sarvam is not configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const audio = form.get("audio");
  const lang = form.get("lang");

  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Missing audio" }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too large" }, { status: 413 });
  }
  if (typeof lang !== "string" || !LANGS.includes(lang as Lang)) {
    return Response.json({ error: "Invalid lang" }, { status: 400 });
  }

  try {
    const transcript = await speechToText(audio, lang as Lang);
    return Response.json({ transcript });
  } catch (error) {
    // See the matching note in ../tts/route.ts: 503 means "do not bother
    // retrying Sarvam", 502 means "Sarvam had a bad moment".
    if (error instanceof SarvamAuthError) {
      console.error("[api/voice/stt]", error.message);
      return Response.json({ error: "Sarvam credentials rejected" }, { status: 503 });
    }
    console.warn("[api/voice/stt] Sarvam STT failed:", (error as Error).message);
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
}
