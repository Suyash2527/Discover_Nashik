"use client";

import type { VoiceState, Lang } from "@/types/voice";
import { MicIcon } from "./icons";
import { pick } from "./copy";

interface Props {
  lang: Lang;
  state: VoiceState;
  onStart: () => void;
  onStop: () => void;
}

export default function MicFab({ lang, state, onStart, onStop }: Props) {
  const busy = state === "listening" || state === "thinking" || state === "speaking";
  const label = busy ? pick(lang, "Stop", "रोकें", "थांबवा") : pick(lang, "Ask", "पूछें", "विचारा");

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={busy ? onStop : onStart}
        aria-label={label}
        className={`relative flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-card text-white shadow-[0_8px_20px_-6px_rgba(226,106,18,.75)] transition-transform active:scale-95 ${
          state === "listening" ? "mic-ring bg-maroon" : state === "error" ? "bg-kumkum" : "bg-haldi"
        }`}
      >
        {state === "thinking" ? (
          <span className="bars flex items-end gap-[3px]" aria-hidden>
            <span /><span /><span />
          </span>
        ) : busy ? (
          <span className="block h-[18px] w-[18px] rounded-[3px] bg-current" aria-hidden />
        ) : (
          <MicIcon size={30} />
        )}
      </button>
      <span className="text-[14px] font-bold text-ink">{label}</span>
    </div>
  );
}
