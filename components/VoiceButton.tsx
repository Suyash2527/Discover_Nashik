"use client";

import { useEffect } from "react";
import { useVoiceAssistant } from "@/lib/voice";

export default function VoiceButton({ 
  onPlaceIds,
  isBottomSheetOpen
}: { 
  onPlaceIds: (ids: string[]) => void;
  isBottomSheetOpen: boolean;
}) {
  const { state, transcript, answer, placeIds, start, stop } = useVoiceAssistant();

  // Send placeIds back to parent when they arrive
  useEffect(() => {
    if (placeIds && placeIds.length > 0) {
       onPlaceIds(placeIds);
    }
  }, [placeIds, onPlaceIds]);

  const isRecording = state === "listening" || state === "thinking" || state === "speaking";

  return (
    <div 
      className={`absolute right-6 z-30 flex flex-col items-end gap-3 pointer-events-none transition-all duration-300 ${
        isBottomSheetOpen ? "bottom-[280px]" : "bottom-6"
      }`}
    >
      {/* Captions */}
      {state === "listening" && transcript && (
        <div className="bg-black/75 text-white px-4 py-2.5 rounded-2xl max-w-[280px] text-sm pointer-events-auto shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          {transcript}
        </div>
      )}
      {(state === "speaking" || state === "error") && answer && (
        <div className="bg-blue-600/95 text-white px-4 py-2.5 rounded-2xl max-w-[280px] text-sm pointer-events-auto shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          {answer}
        </div>
      )}

      {/* FAB */}
      <button 
        onClick={isRecording ? stop : start}
        className={`pointer-events-auto flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all ${
          state === "listening" ? "bg-red-500 animate-pulse text-white scale-110" : 
          state === "thinking" ? "bg-yellow-500 animate-bounce text-white" :
          state === "speaking" ? "bg-blue-500 text-white" :
          state === "error" ? "bg-red-600 text-white" :
          "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105"
        }`}
      >
        {isRecording ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="12" height="12" x="6" y="6" rx="2"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        )}
      </button>
    </div>
  );
}
