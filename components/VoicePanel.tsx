"use client";

import type { Place } from "@/types/place";
import type { Lang, VoiceAssistant } from "@/types/voice";
import { CategoryIcon, categoryColor, RotateCcwIcon } from "./icons";
import { pick, placeName } from "./copy";

interface Props {
  voice: VoiceAssistant;
  places: Place[];
  lang: Lang;
  onSelectPlace: (p: Place) => void;
  onDismiss?: () => void;
  /** "float" sits over the map on phones; "inline" lives in the desktop rail. */
  variant: "float" | "inline";
}

/** Transcript → answer → matched places. Renders nothing while idle with no answer. */
export default function VoicePanel({ voice, places, lang, onSelectPlace, onDismiss, variant }: Props) {
  const { state, transcript, answer, placeIds } = voice;
  const matched = placeIds.map((id) => places.find((p) => p.id === id)).filter(Boolean) as Place[];

  const live = state === "listening" || state === "thinking";
  if (!live && state !== "error" && !answer) return null;

  const shell =
    variant === "float"
      ? "rise mx-3 rounded-lg border border-rule bg-card shadow-[0_6px_24px_-12px_rgba(29,25,21,0.45)]"
      : "border-y border-rule bg-card";

  return (
    <section className={shell} aria-live="polite">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="kicker">
            {state === "listening"
              ? pick(lang, "Listening", "सुन रहे हैं", "ऐकत आहे")
              : state === "thinking"
              ? pick(lang, "Looking it up", "ढूंढ रहे हैं", "शोधत आहे")
              : state === "error"
              ? pick(lang, "Didn't catch that", "समझ नहीं आया", "नीट ऐकू आलं नाही")
              : pick(lang, "Answer", "जवाब", "उत्तर")}
          </span>
          {onDismiss && !live && (
            <button onClick={onDismiss} className="text-[13px] font-semibold text-muted underline-offset-4 hover:underline">
              {pick(lang, "Hide", "छिपाएं", "लपवा")}
            </button>
          )}
        </div>

        {state === "listening" && (
          <p className="mt-1 text-[19px] leading-snug text-ink-2">
            {transcript ? `“${transcript}”` : pick(lang, "Say a place, or ask a question…", "कोई जगह बोलिए…", "ठिकाणाचं नाव सांगा…")}
          </p>
        )}

        {state === "error" && (
          <button onClick={voice.start} className="mt-2 flex items-center gap-2 text-[16px] font-semibold text-kumkum">
            <RotateCcwIcon size={18} />
            {pick(lang, "Try again", "फिर से बोलें", "पुन्हा बोला")}
          </button>
        )}

        {!live && state !== "error" && answer && (
          <p className="mt-1 font-display text-[21px] leading-[1.35] text-ink">{answer}</p>
        )}
      </div>

      {!live && matched.length > 0 && (
        <ul className="border-t border-rule">
          {matched.slice(0, 3).map((p) => (
            <li key={p.id} className="border-b border-rule last:border-b-0">
              <button
                onClick={() => onSelectPlace(p)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-paper-2"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: categoryColor(p.category) }}
                >
                  <CategoryIcon category={p.category} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{placeName(lang, p)}</span>
                  <span className="block truncate text-[13px] text-muted">{p.area}</span>
                </span>
                <span className="text-muted" aria-hidden>→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
