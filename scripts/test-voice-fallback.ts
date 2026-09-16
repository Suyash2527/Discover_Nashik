// Tests for the Sarvam fallback: `npm run test:voice`.
//
// No test runner in this project (zero-dependency rule), so this is a plain
// tsx script with a tiny assert harness. It covers the two decisions that
// actually matter and that nobody can verify by hand on a laptop that happens
// to have the right voices installed:
//   1. WHEN we reach for Sarvam (the missing-voice case, mocked)
//   2. WHAT we send it, and that every failure degrades instead of throwing
import { needsExternalVoice, pickVoice } from "../lib/voice/tts";
import type { Lang } from "../types";

let passed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${(error as Error).message}`);
    console.log(`FAIL  ${name}\n      ${(error as Error).message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, what: string) {
  assert(
    actual === expected,
    `${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

async function rejects(promise: Promise<unknown>, what: string) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(`${what}: expected a rejection, but it resolved`);
}

/** A SpeechSynthesisVoice is a host object; only .lang and .name are read. */
const voice = (lang: string, name = `${lang} voice`) =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

// --- 1. When does Web Speech hand off to Sarvam? -------------------------
// This is the real Marathi bug, mocked: a device with Hindi and English voices
// but no Marathi one, which is nearly every desktop and many Android builds.
const MISSING_MR = [voice("hi-IN"), voice("en-IN"), voice("en-US")];
const HAS_MR = [voice("mr-IN"), ...MISSING_MR];

async function testVoiceSelection() {
  console.log("\nvoice selection (which engine speaks)");

  await check("mr-IN with no Marathi voice -> Sarvam", () => {
    assert(needsExternalVoice(MISSING_MR, "mr-IN"), "expected Sarvam to be needed");
  });

  await check("mr-IN with no Marathi voice still has a Hindi last resort", () => {
    const match = pickVoice(MISSING_MR, "mr-IN");
    equal(match.exact, false, "match.exact");
    equal(match.voice?.lang, "hi-IN", "fallback voice lang");
  });

  await check("mr-IN with a Marathi voice -> Web Speech (Sarvam not called)", () => {
    assert(!needsExternalVoice(HAS_MR, "mr-IN"), "expected Web Speech to be kept");
  });

  await check("hi-IN and en-IN keep using Web Speech", () => {
    assert(!needsExternalVoice(MISSING_MR, "hi-IN"), "hi-IN should not need Sarvam");
    assert(!needsExternalVoice(MISSING_MR, "en-IN"), "en-IN should not need Sarvam");
  });

  await check("no voices at all (voice list not yet loaded) -> Sarvam", () => {
    for (const lang of ["mr-IN", "hi-IN", "en-IN"] as Lang[]) {
      assert(needsExternalVoice([], lang), `${lang} should need Sarvam with no voices`);
    }
  });
}

// --- 2. The Sarvam wrapper ------------------------------------------------
// fetch is stubbed so the suite is offline and burns no API quota.
type Call = { url: string; init: RequestInit };

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function testSarvamWrapper() {
  console.log("\nlib/sarvam.ts (what we send, and how failure degrades)");
  const realFetch = globalThis.fetch;
  process.env.SARVAM_API_KEY = "test-key";
  const { isSarvamConfigured, speechToText, textToSpeech } = await import("../lib/sarvam");

  await check("isSarvamConfigured() follows SARVAM_API_KEY", () => {
    assert(isSarvamConfigured(), "expected configured with a key set");
    delete process.env.SARVAM_API_KEY;
    assert(!isSarvamConfigured(), "expected unconfigured with no key");
    process.env.SARVAM_API_KEY = "test-key";
  });

  await check("textToSpeech posts the right body and returns base64 wav", async () => {
    const calls = stubFetch(() => json({ audios: ["QUJD"] }));
    const result = await textToSpeech("मंदिर जवळ आहे.", "mr-IN");

    equal(calls.length, 1, "fetch call count");
    equal(calls[0].url, "https://api.sarvam.ai/text-to-speech", "url");
    const headers = calls[0].init.headers as Record<string, string>;
    equal(headers["api-subscription-key"], "test-key", "auth header");
    const body = JSON.parse(calls[0].init.body as string);
    equal(body.target_language_code, "mr-IN", "target_language_code");
    equal(body.text, "मंदिर जवळ आहे.", "text");
    assert(body.model, "a model must be pinned");
    equal(result.audioBase64, "QUJD", "audioBase64");
    equal(result.mimeType, "audio/wav", "mimeType");
  });

  await check("textToSpeech truncates over-long text instead of 400ing", async () => {
    // bulbul:v2's documented input limit is 1500 characters, so probe above it.
    const calls = stubFetch(() => json({ audios: ["QUJD"] }));
    await textToSpeech("क".repeat(2000), "mr-IN");
    const body = JSON.parse(calls[0].init.body as string);
    equal(body.text.length, 1500, "truncated length");
  });

  await check("textToSpeech throws on empty text, HTTP error, and empty audio", async () => {
    stubFetch(() => json({ audios: ["QUJD"] }));
    await rejects(textToSpeech("   ", "mr-IN"), "empty text");
    stubFetch(() => json({ error: "nope" }, 429));
    await rejects(textToSpeech("नमस्कार", "mr-IN"), "rate limited");
    stubFetch(() => json({ audios: [] }));
    await rejects(textToSpeech("नमस्कार", "mr-IN"), "no audio returned");
  });

  await check("speechToText posts multipart audio and returns the transcript", async () => {
    const calls = stubFetch(() => json({ transcript: "  राम कुंड कुठे आहे  " }));
    const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
    const transcript = await speechToText(audio, "mr-IN");

    equal(calls[0].url, "https://api.sarvam.ai/speech-to-text", "url");
    const form = calls[0].init.body as FormData;
    equal(form.get("language_code"), "mr-IN", "language_code");
    assert(form.get("model"), "a model must be pinned");
    assert(form.get("file") instanceof Blob, "file must be a Blob");
    equal(transcript, "राम कुंड कुठे आहे", "trimmed transcript");
  });

  await check("speechToText throws on empty audio, HTTP error, and empty transcript", async () => {
    stubFetch(() => json({ transcript: "x" }));
    await rejects(speechToText(new Blob([]), "mr-IN"), "empty audio");
    stubFetch(() => json({ error: "nope" }, 500));
    await rejects(speechToText(new Blob([new Uint8Array([1])]), "mr-IN"), "server error");
    stubFetch(() => json({ transcript: "   " }));
    await rejects(speechToText(new Blob([new Uint8Array([1])]), "mr-IN"), "empty transcript");
  });

  globalThis.fetch = realFetch;
}

// --- 3. The routes the browser actually calls -----------------------------
async function testRoutes() {
  console.log("\napp/api/voice/* (the browser-facing contract)");
  const realFetch = globalThis.fetch;
  const { POST: ttsRoute } = await import("../app/api/voice/tts/route");
  const { POST: sttRoute } = await import("../app/api/voice/stt/route");

  // The routes type their parameter as NextRequest but only use the standard
  // Request surface (json/formData), so a plain Request drives them fine.
  const asNextRequest = (request: Request) => request as unknown as Parameters<typeof ttsRoute>[0];

  const ttsRequest = (body: unknown) =>
    asNextRequest(
      new Request("http://localhost/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const sttRequest = (form: FormData) =>
    asNextRequest(new Request("http://localhost/api/voice/stt", { method: "POST", body: form }));

  await check("no SARVAM_API_KEY -> 503, and nothing is called", async () => {
    delete process.env.SARVAM_API_KEY;
    const calls = stubFetch(() => json({}));
    const response = await ttsRoute(ttsRequest({ text: "नमस्कार", lang: "mr-IN" }));
    equal(response.status, 503, "status");
    equal(calls.length, 0, "upstream calls");
    process.env.SARVAM_API_KEY = "test-key";
  });

  await check("tts route returns audio/wav bytes", async () => {
    stubFetch(() => json({ audios: [Buffer.from("RIFFfake").toString("base64")] }));
    const response = await ttsRoute(ttsRequest({ text: "नमस्कार", lang: "mr-IN" }));
    equal(response.status, 200, "status");
    equal(response.headers.get("Content-Type"), "audio/wav", "content type");
    equal(Buffer.from(await response.arrayBuffer()).toString(), "RIFFfake", "audio bytes");
  });

  await check("tts route rejects a bad lang and missing text", async () => {
    stubFetch(() => json({ audios: ["QUJD"] }));
    equal((await ttsRoute(ttsRequest({ text: "hi", lang: "fr-FR" }))).status, 400, "bad lang");
    equal((await ttsRoute(ttsRequest({ lang: "mr-IN" }))).status, 400, "missing text");
  });

  await check("tts route turns an upstream failure into 502, not a crash", async () => {
    stubFetch(() => json({ error: "boom" }, 500));
    equal((await ttsRoute(ttsRequest({ text: "नमस्कार", lang: "mr-IN" }))).status, 502, "status");
  });

  await check("stt route transcribes a recorded blob", async () => {
    stubFetch(() => json({ transcript: "शौचालय कुठे आहे" }));
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "a.webm");
    form.append("lang", "mr-IN");
    const response = await sttRoute(sttRequest(form));
    equal(response.status, 200, "status");
    const body = (await response.json()) as { transcript: string };
    equal(body.transcript, "शौचालय कुठे आहे", "transcript");
  });

  await check("stt route rejects a request with no audio", async () => {
    stubFetch(() => json({ transcript: "x" }));
    const form = new FormData();
    form.append("lang", "mr-IN");
    equal((await sttRoute(sttRequest(form))).status, 400, "status");
  });

  globalThis.fetch = realFetch;
}

// Wrapped rather than top-level await: this project compiles scripts as CJS.
async function main() {
  await testVoiceSelection();
  await testSarvamWrapper();
  await testRoutes();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
}

void main();
