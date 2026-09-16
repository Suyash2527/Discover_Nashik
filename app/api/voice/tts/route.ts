// POST /api/voice/tts — { text, lang } -> audio/wav bytes.
//
// Reached only when window.speechSynthesis has no voice for the requested
// language (in practice mr-IN). Returns raw audio rather than base64 JSON so
// the client can hand the blob straight to an <audio> element.
import type { NextRequest } from "next/server";
import { isSarvamConfigured, textToSpeech } from "@/lib/sarvam";
import type { Lang } from "@/types";

const LANGS: Lang[] = ["en-IN", "hi-IN", "mr-IN"];

export async function POST(request: NextRequest) {
  if (!isSarvamConfigured()) {
    return Response.json({ error: "Sarvam is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const { text, lang } = (body ?? {}) as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }
  if (typeof lang !== "string" || !LANGS.includes(lang as Lang)) {
    return Response.json({ error: "Invalid lang" }, { status: 400 });
  }

  try {
    const { audioBase64, mimeType } = await textToSpeech(text, lang as Lang);
    const audio = Buffer.from(audioBase64, "base64");
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(audio.byteLength),
        // Same answer, same language -> same audio. Lets a repeated advisory
        // replay without a second Sarvam call.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.warn("[api/voice/tts] Sarvam TTS failed:", (error as Error).message);
    return Response.json({ error: "Synthesis failed" }, { status: 502 });
  }
}
