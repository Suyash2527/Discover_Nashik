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

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
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

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    // Silence detection. An AnalyserNode is cheap and, unlike a fixed-length
    // recording, lets a short question ("शौचालय कुठे?") finish in ~2 s.
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    let heardSpeech = false;
    let quietSince = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(monitor);
      clearTimeout(deadline);
      if (recorder.state !== "inactive") recorder.stop();
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

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
      };
      recorder.start();
    });

    finish();
    // Nothing above the noise floor: treat as no-speech rather than shipping
    // a second of crowd hiss to Sarvam.
    return heardSpeech && blob && blob.size > 0 ? blob : null;
  })();

  return { done, stop: () => stopFn() };
}

/** Transcribe via /api/voice/stt. Returns "" when unavailable. */
export async function transcribeViaSarvam(audio: Blob, lang: Lang): Promise<string> {
  try {
    const form = new FormData();
    form.append("audio", audio, "audio.webm");
    form.append("lang", lang);

    const response = await fetch("/api/voice/stt", { method: "POST", body: form });
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
  let url: string;
  try {
    const response = await fetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
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
