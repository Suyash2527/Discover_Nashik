"use client";

import { useVoiceAssistant } from "@/lib/voice";
import { MicIcon } from "./icons";

interface Props {
  lang: "mr-IN" | "hi-IN" | "en-IN";
}

const SPEAK_LABEL: Record<string, string> = {
  "mr-IN": "बोला",
  "hi-IN": "बोलें",
  "en-IN": "Speak",
};

export default function MicFab({ lang }: Props) {
  const { state, start, stop } = useVoiceAssistant();

  const isActive = state === "listening" || state === "thinking" || state === "speaking";
  const isListening = state === "listening";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={isActive ? stop : start}
        className={`
          w-[64px] h-[64px] rounded-full
          flex items-center justify-center
          shadow-xl transition-all duration-200 active:scale-95
          ${isListening
            ? "bg-[#EA580C] text-white voice-pulsing"
            : state === "thinking"
            ? "bg-[#EA580C]/80 text-white animate-pulse"
            : state === "speaking"
            ? "bg-[#1E3A8A] text-white"
            : state === "error"
            ? "bg-[#DC2626] text-white"
            : "bg-[#EA580C] text-white hover:bg-orange-600"
          }
        `}
        aria-label={isActive ? "Stop" : SPEAK_LABEL[lang] ?? "Speak"}
      >
        {isActive ? (
          /* Stop square when recording */
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <MicIcon size={30} />
        )}
      </button>
      <span className="text-[13px] font-bold text-[#1C1917] bg-white/80 px-2 py-0.5 rounded-full leading-none">
        {SPEAK_LABEL[lang] ?? "Speak"}
      </span>
    </div>
  );
}
