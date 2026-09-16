"use client";
// Real implementation of the VoiceAssistant contract (types/voice.ts).
// The exported signature is frozen — UI depends on it — so everything here is
// internal.
//
// Pipeline:
//   start() -> SpeechRecognition (listening)
//     -> final transcript -> detectLang() -> correctTranscript() -> ask()
//   ask()  -> POST /api/ask (thinking) -> answer + placeIds
//     -> speechSynthesis (speaking) -> idle
//
// Sarvam AI is a fallback on both ends, never the primary path:
//   - listening: only when SpeechRecognition is absent, or has returned
//     no-speech NO_SPEECH_LIMIT times in a row
//   - speaking: only when speechSynthesis has no voice for the current
//     language (the mr-IN case — see lib/voice/tts.ts)
// If SARVAM_API_KEY is unset or the API is down, both routes answer and every
// path here degrades back to exactly the previous Web Speech behaviour.
//
// The language sent to /api/ask is the language DETECTED in the utterance, not
// the one on the UI toggle — see applyDetectedLang() and lib/voice/detect-lang.ts.
//
// Every question also carries the pilgrim's coordinates when we have them, so
// "how far is Ramkund" gets an actual distance instead of a description. The fix
// is started on the mic tap and merely collected here — see lib/geolocation.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AskRequest, AskResponse, Lang, VoiceAssistant, VoiceState } from "@/types";
import {
  getSpeechRecognitionCtor,
  readResults,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionLike,
} from "./speech-recognition";
import {
  cancelSarvamSpeech,
  isRecordingSupported,
  recordUtterance,
  speakViaSarvam,
  transcribeViaSarvam,
  type RecordingHandle,
} from "./sarvam-client";
import { getUserPosition, warmUserPosition } from "../geolocation";
import { detectLang } from "./detect-lang";
import { correctTranscript } from "./stt-corrections";
import { cancelSpeech, shouldUseExternalVoice, speak } from "./tts";
import { retrieveScored } from "../rag";
import { answerOffline, generalOfflineAnswer } from "../intent-offline";

const DEFAULT_LANG: Lang = "mr-IN";

/** Consecutive no-speech results after which we stop trusting the browser
 *  recogniser and record for Sarvam instead. Two, not one: a single no-speech
 *  is usually just a pilgrim who tapped the mic before they were ready. */
const NO_SPEECH_LIMIT = 2;

/** Recogniser failures that are the user's environment, not a bug. */
const ERROR_MESSAGES: Record<string, Record<"en" | "hi" | "mr", string>> = {
  "not-allowed": {
    en: "Microphone permission is blocked. Allow it in your browser settings and try again.",
    hi: "माइक्रोफ़ोन की अनुमति नहीं है। कृपया ब्राउज़र सेटिंग में अनुमति दें।",
    mr: "मायक्रोफोनची परवानगी नाही. कृपया ब्राउझर सेटिंगमध्ये परवानगी द्या.",
  },
  "service-not-allowed": {
    en: "Speech recognition is blocked on this device. Please type your question instead.",
    hi: "इस डिवाइस पर वाक् पहचान अवरुद्ध है। कृपया प्रश्न लिखकर पूछें।",
    mr: "या डिव्हाइसवर वाणी ओळख बंद आहे. कृपया प्रश्न टाइप करा.",
  },
  "no-speech": {
    en: "I did not hear anything. Please tap the mic and speak again.",
    hi: "मुझे कुछ सुनाई नहीं दिया। कृपया माइक दबाकर फिर बोलें।",
    mr: "मला काही ऐकू आले नाही. कृपया माइक दाबून पुन्हा बोला.",
  },
  "audio-capture": {
    en: "No microphone was found. Please check your device.",
    hi: "कोई माइक्रोफ़ोन नहीं मिला। कृपया डिवाइस जाँचें।",
    mr: "मायक्रोफोन सापडला नाही. कृपया डिव्हाइस तपासा.",
  },
  network: {
    en: "Speech recognition needs a connection. You can still type your question.",
    hi: "वाक् पहचान के लिए इंटरनेट चाहिए। आप प्रश्न लिख भी सकते हैं।",
    mr: "वाणी ओळखीसाठी इंटरनेट लागते. तुम्ही प्रश्न टाइपही करू शकता.",
  },
  unsupported: {
    en: "This browser cannot listen. Please type your question, or try Chrome.",
    hi: "यह ब्राउज़र सुन नहीं सकता। कृपया प्रश्न लिखें, या Chrome आज़माएँ।",
    mr: "हा ब्राउझर ऐकू शकत नाही. कृपया प्रश्न टाइप करा, किंवा Chrome वापरा.",
  },
  failed: {
    en: "Something went wrong. Please try again.",
    hi: "कुछ गड़बड़ हुई। कृपया पुनः प्रयास करें।",
    mr: "काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.",
  },
};

const langKey = (lang: Lang) => (lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en");

function errorMessage(code: string, lang: Lang): string {
  return (ERROR_MESSAGES[code] ?? ERROR_MESSAGES.failed)[langKey(lang)];
}

/**
 * Speak an answer, preferring Sarvam only where Web Speech cannot do the job.
 * Never throws: a silent answer still shows on screen.
 */
async function speakAnswer(text: string, lang: Lang): Promise<void> {
  if (await shouldUseExternalVoice(lang)) {
    console.info(`[voice] no ${lang} speechSynthesis voice; trying Sarvam TTS`);
    if (await speakViaSarvam(text, lang)) return;
    // Sarvam missing or down — fall through to whatever the platform offers,
    // which for mr-IN means the Hindi voice. Wrong accent beats silence.
  }
  await speak(text, lang, { onWarn: (message) => console.warn("[voice]", message) });
}

export function useVoiceAssistant(): VoiceAssistant {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const langRef = useRef<Lang>(lang);
  // Recogniser callbacks fire outside the React lifecycle; these refs let them
  // read current values and skip work after unmount without re-binding.
  const mountedRef = useRef(true);
  const askRef = useRef<(text: string) => Promise<void>>(async () => {});
  /** Set when the user pressed stop, so onend does not report "no-speech". */
  const abortedRef = useRef(false);
  /** Guards the final-result handler: one ask() per listening session. */
  const handledFinalRef = useRef(false);
  /** Consecutive no-speech results from the browser recogniser. */
  const noSpeechStreakRef = useRef(0);
  /** Live Sarvam recording, so stop() can end it. */
  const recordingRef = useRef<RecordingHandle | null>(null);

  useEffect(() => {
    langRef.current = lang;
    if (recognitionRef.current) recognitionRef.current.lang = lang;
  }, [lang]);

  const fail = useCallback((code: string) => {
    if (!mountedRef.current) return;
    setAnswer(errorMessage(code, langRef.current));
    setPlaceIds([]);
    setState("error");
  }, []);

  /**
   * Everything between "we have a raw transcript" and "ask the server".
   *
   * Order matters: detect on the RAW transcript, then correct. correctTranscript
   * writes place names in the script of the language it is given, so correcting
   * first with a stale UI language can flip "रामकुंड" to "Ramkund" and destroy
   * the very evidence the detector reads.
   *
   * langRef is written synchronously so ask() — which reads langRef.current —
   * sees the detected language on this very call; setLang() then moves the UI
   * toggle so the reply, the TTS voice and the next utterance all agree.
   */
  const applyDetectedLang = useCallback((raw: string): string => {
    const uiLang = langRef.current;
    const detection = detectLang(raw, uiLang);

    if (!detection.confident) {
      console.warn(
        `[voice] language detection ambiguous for "${raw}" — guessing ${detection.lang} (fallback ${uiLang}): ${detection.reason}`,
      );
    }

    if (detection.lang !== uiLang) {
      console.info(
        `[voice] language ${uiLang} -> ${detection.lang} (${detection.reason})`,
      );
      langRef.current = detection.lang;
      if (mountedRef.current) setLang(detection.lang);
    }

    const corrected = correctTranscript(raw, detection.lang);
    if (corrected !== raw) {
      console.info(`[voice] STT correction: "${raw}" -> "${corrected}"`);
    }
    return corrected;
  }, []);

  /** Typed-input path, and the destination of every recognised utterance. */
  const ask = useCallback(
    async (text: string) => {
      const raw = text.trim();
      if (!raw) return;

      const query = applyDetectedLang(raw);

      setTranscript(query);
      setState("thinking");
      setAnswer("");
      setPlaceIds([]);

      const activeLang = langRef.current;
      let result: AskResponse;

      // Whatever warmUserPosition() managed to acquire while they were talking.
      // null is routine (permission refused, no fix indoors) and simply costs
      // the distance phrasing — /api/ask treats origin as optional throughout.
      const here = await getUserPosition();
      if (!mountedRef.current) return;

      const getOfflineAnswer = (): AskResponse => {
        const scored = retrieveScored(query, activeLang);
        const places = scored.map((s) => s.place);
        const topScore = scored[0]?.score ?? 0;
        const isGrounded = topScore > 0;
        const ans = isGrounded && places.length > 0
          ? answerOffline(query, activeLang, places, here ?? undefined)
          : generalOfflineAnswer(activeLang);

        return {
          answer: ans,
          placeIds: isGrounded ? places.map((p) => p.id) : [],
          source: "offline",
        };
      };

      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

      if (isOffline) {
        console.info("[voice] Fully offline — serving local offline template");
        result = getOfflineAnswer();
      } else {
        try {
          const body: AskRequest = {
            query,
            lang: activeLang,
            ...(here && { lat: here.lat, lng: here.lng }),
          };
          const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!response.ok) throw new Error(`/api/ask responded ${response.status}`);
          result = (await response.json()) as AskResponse;
        } catch (error) {
          console.warn("[voice] ask fetch failed offline, serving local answer:", error);
          result = getOfflineAnswer();
        }
      }

      if (!mountedRef.current) return;

      setAnswer(result.answer);
      setPlaceIds(result.placeIds ?? []);
      setState("speaking");

      await speakAnswer(result.answer, activeLang);

      // Only fall back to idle if nothing else has taken over — a new question
      // may have arrived while we were speaking.
      if (mountedRef.current) setState((prev) => (prev === "speaking" ? "idle" : prev));
    },
    [applyDetectedLang, fail],
  );

  // Assigned in an effect, not during render: a render-phase ref write is
  // unsafe under concurrent rendering / StrictMode. Recogniser callbacks only
  // read this after mount, so the effect always lands first.
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  /**
   * Record the utterance ourselves and send it to Sarvam.
   *
   * Only reached when the browser recogniser cannot help. Goes straight to
   * "listening" so the UI is identical either way — the pilgrim never learns
   * which engine heard them.
   */
  const startSarvamListening = useCallback(async () => {
    if (!isRecordingSupported()) {
      fail("unsupported");
      return;
    }

    setTranscript("");
    setAnswer("");
    setPlaceIds([]);
    setState("listening");

    const handle = recordUtterance();
    recordingRef.current = handle;

    const audio = await handle.done;
    if (!mountedRef.current || recordingRef.current !== handle) return;
    recordingRef.current = null;

    if (abortedRef.current) return;
    if (!audio) {
      fail("no-speech");
      return;
    }

    setState("thinking");
    const activeLang = langRef.current;
    const transcribed = await transcribeViaSarvam(audio, activeLang);
    if (!mountedRef.current || abortedRef.current) return;

    if (!transcribed) {
      // Sarvam was our last resort; tell the pilgrim to type instead of
      // looping on a recogniser that has already failed twice.
      fail("unsupported");
      return;
    }

    noSpeechStreakRef.current = 0;
    void askRef.current(transcribed);
  }, [fail]);

  const start = useCallback(() => {
    // On the tap, not on mount: a permission prompt the pilgrim can connect to
    // something they just pressed is understandable, and the 3-6 s a cold GPS
    // fix takes then runs concurrently with them speaking, so it costs the
    // answer nothing. By the time the transcript is final, ask() usually just
    // reads it out of the cache.
    warmUserPosition();

    const Ctor = getSpeechRecognitionCtor();
    // No recogniser at all, or one that has repeatedly heard nothing.
    if (!Ctor || noSpeechStreakRef.current >= NO_SPEECH_LIMIT) {
      if (Ctor) {
        console.info(
          `[voice] recogniser returned no-speech ${noSpeechStreakRef.current}x; switching to Sarvam STT`,
        );
      }
      abortedRef.current = false;
      cancelSpeech();
      cancelSarvamSpeech();
      void startSarvamListening();
      return;
    }

    cancelSpeech();
    cancelSarvamSpeech();
    recognitionRef.current?.abort();

    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    abortedRef.current = false;
    handledFinalRef.current = false;

    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setTranscript("");
      setAnswer("");
      setPlaceIds([]);
      setState("listening");
    };

    recognition.onresult = (event) => {
      if (!mountedRef.current) return;
      const { final, interim } = readResults(event);

      // Show interim text live so the pilgrim can see they are being heard.
      if (!final && interim) {
        setTranscript(interim);
        return;
      }
      if (!final || handledFinalRef.current) return;

      handledFinalRef.current = true;
      noSpeechStreakRef.current = 0;
      recognition.stop(); // continuous:false, but stop() releases the mic now.
      void askRef.current(final);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      // A deliberate stop() with nothing said surfaces as "aborted"/"no-speech";
      // neither is worth showing the pilgrim.
      if (event.error === "aborted") return;
      if (abortedRef.current && event.error === "no-speech") return;
      if (event.error === "no-speech") noSpeechStreakRef.current += 1;
      console.warn("[voice] recognition error:", event.error, event.message ?? "");
      fail(event.error);
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;
      // Ended with no final result and no error: nothing was heard.
      if (!handledFinalRef.current && !abortedRef.current) noSpeechStreakRef.current += 1;
      setState((prev) => (prev === "listening" && !handledFinalRef.current ? "idle" : prev));
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      // start() throws InvalidStateError if called while already running.
      console.warn("[voice] recognition.start() failed:", error);
      fail("failed");
    }
  }, [applyDetectedLang, fail, startSarvamListening]);

  const stop = useCallback(() => {
    abortedRef.current = true;
    recognitionRef.current?.abort();
    recordingRef.current?.stop();
    recordingRef.current = null;
    cancelSpeech();
    cancelSarvamSpeech();
    if (mountedRef.current) setState("idle");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      recordingRef.current?.stop();
      cancelSpeech();
      cancelSarvamSpeech();
    };
  }, []);

  return { state, transcript, answer, placeIds, lang, setLang, start, stop, ask };
}
