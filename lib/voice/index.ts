"use client";
// Real implementation of the VoiceAssistant contract (types/voice.ts).
// The exported signature is frozen — UI depends on it — so everything here is
// internal.
//
// Pipeline:
//   start() -> SpeechRecognition (listening)
//     -> final transcript -> correctTranscript() -> ask()
//   ask()  -> POST /api/ask (thinking) -> answer + placeIds
//     -> speechSynthesis (speaking) -> idle
import { useCallback, useEffect, useRef, useState } from "react";
import type { AskRequest, AskResponse, Lang, VoiceAssistant, VoiceState } from "@/types";
import {
  getSpeechRecognitionCtor,
  readResults,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionLike,
} from "./speech-recognition";
import { correctTranscript } from "./stt-corrections";
import { cancelSpeech, speak } from "./tts";

const DEFAULT_LANG: Lang = "mr-IN";

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

  /** Typed-input path, and the destination of every recognised utterance. */
  const ask = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return;

      setTranscript(query);
      setState("thinking");
      setAnswer("");
      setPlaceIds([]);

      const activeLang = langRef.current;
      let result: AskResponse;

      try {
        const body: AskRequest = { query, lang: activeLang };
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`/api/ask responded ${response.status}`);
        result = (await response.json()) as AskResponse;
      } catch (error) {
        console.error("[voice] ask failed:", error);
        fail("failed");
        return;
      }

      if (!mountedRef.current) return;

      setAnswer(result.answer);
      setPlaceIds(result.placeIds ?? []);
      setState("speaking");

      await speak(result.answer, activeLang, {
        onWarn: (message) => console.warn("[voice]", message),
      });

      // Only fall back to idle if nothing else has taken over — a new question
      // may have arrived while we were speaking.
      if (mountedRef.current) setState((prev) => (prev === "speaking" ? "idle" : prev));
    },
    [fail],
  );

  // Assigned in an effect, not during render: a render-phase ref write is
  // unsafe under concurrent rendering / StrictMode. Recogniser callbacks only
  // read this after mount, so the effect always lands first.
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      fail("unsupported");
      return;
    }

    cancelSpeech();
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
      const corrected = correctTranscript(final, langRef.current);
      if (corrected !== final) {
        console.info(`[voice] STT correction: "${final}" -> "${corrected}"`);
      }
      setTranscript(corrected);
      recognition.stop(); // continuous:false, but stop() releases the mic now.
      void askRef.current(corrected);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      // A deliberate stop() with nothing said surfaces as "aborted"/"no-speech";
      // neither is worth showing the pilgrim.
      if (event.error === "aborted") return;
      if (abortedRef.current && event.error === "no-speech") return;
      console.warn("[voice] recognition error:", event.error, event.message ?? "");
      fail(event.error);
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;
      // Ended with no final result and no error: nothing was heard.
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
  }, [fail]);

  const stop = useCallback(() => {
    abortedRef.current = true;
    recognitionRef.current?.abort();
    cancelSpeech();
    if (mountedRef.current) setState("idle");
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recognitionRef.current?.abort();
      cancelSpeech();
    };
  }, []);

  return { state, transcript, answer, placeIds, lang, setLang, start, stop, ask };
}
