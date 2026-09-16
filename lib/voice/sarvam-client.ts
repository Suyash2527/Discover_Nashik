"use client";
// Browser half of the Sarvam fallback. Talks to /api/voice/* — never to Sarvam
// directly, because SARVAM_API_KEY is server-only (see lib/sarvam.ts).
//
// Everything here is best-effort: each entry point resolves to a "did not
// work" value instead of throwing, so a missing key or a dead API can never
// take the assistant down. Web Speech remains the primary path.
import type { Lang } from "@/types";

/** Longest single utterance we will record before giving up on silence. */
const MAX_RECORD_MS = 8000;
/** Quiet stretch (after speech was heard) that ends the recording. Tuned long
 *  for a Kumbh crowd: ambient noise keeps the floor high, and cutting a
 *  pilgrim off mid-question is worse than a second of dead air. */
const SILENCE_MS = 1500;
/** RMS below this counts as silence. Deliberately generous for crowd noise. */
const SILENCE_RMS = 0.02;

export interface RecordingHandle {
  /** Resolves with the recorded audio, or null if nothing usable was captured. */
  done: Promise<Blob | null>;
  /** Stop early (the pilgrim tapped the mic again). */
  stop: () => void;
}

function encodeWAV(chunks: Float32Array[], sampleRate: number): Blob {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + totalLength * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + totalLength * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, totalLength * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    (typeof window.AudioContext !== "undefined" || typeof (window as any).webkitAudioContext !== "undefined") &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Capture one utterance from the microphone, auto-stopping on silence.
 *
 * Web Speech does this internally; when it is unavailable we have to do it by
 * hand, because Sarvam needs a finished recording rather than a live stream.
 */
export function recordUtterance(): RecordingHandle {
  let stopFn = () => {};
  const done = (async (): Promise<Blob | null> => {
    if (!isRecordingSupported()) return null;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.warn("[voice] microphone unavailable:", error);
      return null;
    }

    // Capture raw PCM with a ScriptProcessorNode (MediaRecorder gives WebM,
    // which Sarvam STT rejects).
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);

    // 1. Recording
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const audioChunks: Float32Array[] = [];
    processor.onaudioprocess = (e) => {
      audioChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    // Connect to destination via 0-gain to keep the processor running in Chrome
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    processor.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 2. Silence detection
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    let heardSpeech = false;
    let quietSince = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(monitor);
      clearTimeout(deadline);
      
      processor.disconnect();
      gainNode.disconnect();
      source.disconnect();
      
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close().catch(() => {});
    };
    stopFn = finish;

    const monitor = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);

      if (rms >= SILENCE_RMS) {
        heardSpeech = true;
        quietSince = 0;
        return;
      }
      if (!heardSpeech) return; // Still waiting for the pilgrim to start.
      quietSince ||= Date.now();
      if (Date.now() - quietSince >= SILENCE_MS) finish();
    }, 100);

    const deadline = setTimeout(finish, MAX_RECORD_MS);

    // Wait until `finish()` runs (either from silence timeout or max duration)
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => {
        if (finished) {
          clearInterval(wait);
          resolve();
        }
      }, 50);
    });

    // Nothing above the noise floor: treat as no-speech rather than shipping
    // a second of crowd hiss to Sarvam.
    if (!heardSpeech || audioChunks.length === 0) return null;

    return encodeWAV(audioChunks, audioContext.sampleRate);
  })();

  return { done, stop: () => stopFn() };
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------
// shouldUseExternalVoice() (lib/voice/tts.ts) returns true for EVERY online
// request, so when the server answers 503 "credentials rejected" — a permanent
// fault — every subsequent voice answer still pays a full failed round-trip to
// /api/voice/* before falling back to Web Speech. On a dead key that is dead
// latency added to every single answer, against a <3 s budget (CONTEXT.md).
//
// 503 from our own route means "Sarvam is unavailable, do not retry".
// 502 means "Sarvam had a bad moment" and IS worth retrying.

/** Set when a route reported 503 (unconfigured or rejected credentials). */
let sarvamDownSince = 0;

function noteSarvamStatus(status: number): void {
  if (status === 503) sarvamDownSince = Date.now();
  else if (status < 400) sarvamDownSince = 0; // Recovered.
}

/**
 * True when we should skip Sarvam entirely and go straight to Web Speech.
 *
 * Policy: 60 s cooldown. `sarvamDownSince` is the ms timestamp of the last 503
 * (0 = never, which is always outside the window).
 *
 * Why a cooldown and not the alternatives, for a pilgrim in a crowd:
 *  - Never retrying (`return sarvamDownSince > 0`) is fastest, but one blip at
 *    app start permanently downgrades Marathi to a Hindi-accented voice for the
 *    whole session — the exact bug Sarvam was added to fix.
 *  - Retrying after a cooldown (e.g. `Date.now() - sarvamDownSince > 60_000`)
 *    self-heals when a key is rotated mid-session, at the cost of one slow
 *    answer per cooldown window.
 *  - Always retrying (`return false`) is today's behaviour: correct, but slow
 *    on every answer while the key is dead.
 */
function isSarvamKnownDown(): boolean {
  return Date.now() - sarvamDownSince < 60_000;
}

/** Transcribe via /api/voice/stt. Returns "" when unavailable. */
export async function transcribeViaSarvam(audio: Blob, lang: Lang): Promise<string> {
  if (isSarvamKnownDown()) return "";
  try {
    const form = new FormData();
    form.append("audio", audio, "audio.wav");
    form.append("lang", lang);

    const response = await fetch("/api/voice/stt", { method: "POST", body: form });
    noteSarvamStatus(response.status);
    if (!response.ok) {
      console.warn(`[voice] Sarvam STT unavailable (${response.status})`);
      return "";
    }
    const data = (await response.json()) as { transcript?: string };
    return (data.transcript ?? "").trim();
  } catch (error) {
    console.warn("[voice] Sarvam STT request failed:", error);
    return "";
  }
}

let current: HTMLAudioElement | null = null;

/**
 * Speak `text` through Sarvam. Resolves true only if audio actually played, so
 * the caller knows whether it still has to fall back to speechSynthesis.
 */
export async function speakViaSarvam(text: string, lang: Lang): Promise<boolean> {
  if (isSarvamKnownDown()) return false;
  let url: string;
  try {
    const response = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    noteSarvamStatus(response.status);
    if (!response.ok) {
      console.warn(`[voice] Sarvam TTS unavailable (${response.status})`);
      return false;
    }
    url = URL.createObjectURL(await response.blob());
  } catch (error) {
    console.warn("[voice] Sarvam TTS request failed:", error);
    return false;
  }

  try {
    const audio = new Audio(url);
    current = audio;
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio playback failed"));
      // play() rejects without a user gesture; the mic tap counts as one, but
      // an auto-spoken advisory may not.
      audio.play().catch(reject);
    });
    return true;
  } catch (error) {
    console.warn("[voice] Sarvam audio playback failed:", error);
    return false;
  } finally {
    if (current?.src === url) current = null;
    URL.revokeObjectURL(url);
  }
}

export function cancelSarvamSpeech(): void {
  current?.pause();
  current = null;
}
