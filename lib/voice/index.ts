"use client";
// MOCK implementation of the VoiceAssistant contract so UI can build now.
// Claude Code replaces internals in H6–12; the signature must not change.
import { useCallback, useState } from "react";
import type { Lang, VoiceAssistant, VoiceState } from "@/types";

export function useVoiceAssistant(): VoiceAssistant {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [lang, setLang] = useState<Lang>("mr-IN");

  const ask = useCallback(async (text: string) => {
    setTranscript(text);
    setState("thinking");
    await new Promise((r) => setTimeout(r, 600));
    setAnswer("रामकुंड पंचवटीमध्ये गोदावरी नदीवर आहे. येथून काळाराम मंदिर जवळ आहे.");
    setPlaceIds(["ramkund", "kalaram-mandir"]);
    setState("speaking");
    setTimeout(() => setState("idle"), 1500);
  }, []);

  const start = useCallback(() => {
    setState("listening");
    setTimeout(() => void ask("रामकुंड कुठे आहे?"), 1200);
  }, [ask]);

  const stop = useCallback(() => setState("idle"), []);

  return { state, transcript, answer, placeIds, lang, setLang, start, stop, ask };
}
