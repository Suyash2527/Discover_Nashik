"use client";

import { useEffect, useState, useCallback } from "react";
import { useVoiceAssistant } from "@/lib/voice";
import { Place } from "@/types/place";
import {
  MicIcon,
  SpeakerIcon,
  AlertCircleIcon,
  RotateCcwIcon,
  MapPinIcon,
  categoryColor,
  CategoryIcon,
} from "./icons";

interface Props {
  onPlaceIds: (ids: string[]) => void;
  onSelectPlace: (place: Place) => void;
  places: Place[];
  lang: "mr-IN" | "hi-IN" | "en-IN";
}

export default function VoicePanel({ onPlaceIds, onSelectPlace, places, lang }: Props) {
  const { state, transcript, answer, placeIds, start, stop } = useVoiceAssistant();
  const [isReplaying, setIsReplaying] = useState(false);
  const [shownAnswer, setShownAnswer] = useState("");

  // Propagate placeIds up
  useEffect(() => {
    if (placeIds?.length) onPlaceIds(placeIds);
  }, [placeIds, onPlaceIds]);

  // Keep last answer visible even after state goes idle
  useEffect(() => {
    if (answer) setShownAnswer(answer);
  }, [answer]);

  const matchedPlaces = (placeIds ?? [])
    .map((id) => places.find((p) => p.id === id))
    .filter(Boolean) as Place[];

  const isActive = state === "listening" || state === "thinking" || state === "speaking";

  const handleMic = useCallback(() => {
    if (isActive) stop();
    else start();
  }, [isActive, start, stop]);

  const stateLabel =
    state === "listening"
      ? (transcript || (lang === "mr-IN" ? "ऐकत आहे…" : lang === "hi-IN" ? "सुन रहा हूँ…" : "Listening…"))
      : state === "thinking"
      ? (lang === "mr-IN" ? "विचार करत आहे" : lang === "hi-IN" ? "सोच रहा हूँ" : "Thinking…")
      : state === "speaking"
      ? (lang === "mr-IN" ? "सांगत आहे" : lang === "hi-IN" ? "बता रहा हूँ" : "Speaking…")
      : null;

  return (
    <div className="flex flex-col gap-3 w-full">

      {/* Status pill — shows when active */}
      {stateLabel && (
        <div
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-base font-semibold text-white shadow-lg ${
            state === "error" ? "bg-[#DC2626]" : "bg-[#1C1917]/90 backdrop-blur-sm"
          }`}
        >
          {state === "thinking" && (
            <span className="flex gap-1 mr-1">
              <span className="w-2 h-4 rounded-sm bg-white dot-bounce" />
              <span className="w-2 h-4 rounded-sm bg-white dot-bounce" />
              <span className="w-2 h-4 rounded-sm bg-white dot-bounce" />
            </span>
          )}
          {state === "listening" && (
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] animate-pulse shrink-0" />
          )}
          <span className="truncate">{stateLabel}</span>
        </div>
      )}

      {/* Answer card */}
      {shownAnswer && state !== "listening" && state !== "thinking" && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 flex flex-col gap-3">
          {state === "error" ? (
            <div className="flex items-center gap-3 text-[#DC2626]">
              <AlertCircleIcon size={28} className="shrink-0" />
              <span className="text-base font-semibold flex-1">
                {lang === "mr-IN" ? "काहीतरी चूक झाली." : lang === "hi-IN" ? "कुछ गलत हुआ।" : "Something went wrong."}
              </span>
              <button
                onClick={handleMic}
                className="p-2 bg-red-100 rounded-full hover:bg-red-200 active:scale-95 transition"
                aria-label="Retry"
              >
                <RotateCcwIcon size={20} className="text-[#DC2626]" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <button
                  onClick={() => {
                    setIsReplaying(true);
                    setTimeout(() => setIsReplaying(false), 2500);
                  }}
                  className="p-2.5 bg-blue-50 text-[#1E3A8A] rounded-full shrink-0 hover:bg-blue-100 active:scale-95 transition"
                  aria-label="Play again"
                >
                  <SpeakerIcon size={22} className={isReplaying ? "animate-pulse" : ""} />
                </button>
                <p className="text-[17px] font-semibold text-[#1C1917] leading-snug pt-1">{shownAnswer}</p>
              </div>

              {matchedPlaces.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  {matchedPlaces.slice(0, 3).map((place) => (
                    <button
                      key={place.id}
                      onClick={() => {
                        onSelectPlace(place);
                        onPlaceIds([place.id]);
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition text-left"
                    >
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: categoryColor(place.category) }}
                      >
                        <CategoryIcon category={place.category} size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-[#1C1917] truncate">{place.name.mr}</p>
                        <p className="text-sm text-[#57534E] truncate">{place.name.en} • {place.area}</p>
                      </div>
                      <MapPinIcon size={18} className="text-[#EA580C] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
