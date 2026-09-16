"use client";

import { useEffect, useState } from "react";
import { useVoiceAssistant } from "@/lib/voice";
import { Place } from "@/types/place";

export default function VoiceButton({ 
  onPlaceIds,
  isBottomSheetOpen,
  places = []
}: { 
  onPlaceIds: (ids: string[]) => void;
  isBottomSheetOpen: boolean;
  places?: Place[];
}) {
  const { state, transcript, answer, placeIds, start, stop } = useVoiceAssistant();
  const [isPlaying, setIsPlaying] = useState(false);

  // Send placeIds back to parent when they arrive
  useEffect(() => {
    if (placeIds && placeIds.length > 0) {
       onPlaceIds(placeIds);
    }
  }, [placeIds, onPlaceIds]);

  const isRecording = state === "listening" || state === "thinking" || state === "speaking";
  const hasAnswerCard = (state === "speaking" || state === "error" || state === "idle") && answer;

  const matchedPlace = placeIds && placeIds.length === 1 ? places.find(p => p.id === placeIds[0]) : null;

  return (
    <div className="absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-4 pointer-events-none transition-all duration-500 ease-out">
      
      {/* Answer Card */}
      {hasAnswerCard && (
        <div className="w-[90%] max-w-md bg-white rounded-[24px] shadow-2xl p-5 pointer-events-auto transform transition-all translate-y-0 opacity-100 border border-gray-100 flex flex-col gap-3">
          {state === "error" ? (
            <div className="flex items-center gap-3 text-red-600">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
               <span className="text-lg font-semibold flex-1">काहीतरी चूक झाली / Something went wrong.</span>
               <button onClick={start} className="p-2 bg-red-100 rounded-full hover:bg-red-200 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
               </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-4">
                 <button 
                   className="p-3 bg-blue-50 text-[#1E3A8A] rounded-full shrink-0 mt-1 active:scale-95 transition"
                   onClick={() => {
                     // Fake replay
                     setIsPlaying(true);
                     setTimeout(() => setIsPlaying(false), 2000);
                   }}
                 >
                    {isPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    )}
                 </button>
                 <p className="text-lg font-bold text-[#1F1A14] leading-snug">{answer}</p>
              </div>
              {matchedPlace && (
                <button 
                  onClick={() => onPlaceIds([matchedPlace.id])}
                  className="mt-2 self-start flex items-center gap-2 bg-[#FFF8EE] border border-[#E8740C]/30 text-[#E8740C] px-4 py-2 rounded-full text-sm font-bold active:bg-orange-50 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {matchedPlace.name.mr} / {matchedPlace.name.hi} / {matchedPlace.name.en}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Listening/Thinking Caption */}
      {state === "listening" && (
        <div className="bg-[#1F1A14]/90 text-white px-5 py-3 rounded-full text-base font-medium pointer-events-auto shadow-xl backdrop-blur-md">
          {transcript || "ऐकत आहे... / सुन रहा हूँ... / Listening..."}
        </div>
      )}
      {state === "thinking" && (
        <div className="bg-[#1F1A14]/90 text-white px-5 py-3 rounded-full text-base font-medium pointer-events-auto shadow-xl backdrop-blur-md flex items-center gap-2">
          विचार करत आहे <span className="flex gap-1"><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-100"></span><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-200"></span></span>
        </div>
      )}

      {/* Hero FAB */}
      <div className={`flex flex-col items-center gap-2 transition-transform duration-500 ease-out ${isBottomSheetOpen ? "translate-y-[-240px]" : "translate-y-0"}`}>
        <button 
          onClick={isRecording ? stop : start}
          className={`pointer-events-auto flex items-center justify-center w-[88px] h-[88px] rounded-full shadow-2xl transition-all ${
            state === "listening" ? "bg-[#E8740C] text-white voice-pulsing scale-110" : 
            state === "thinking" ? "bg-[#E8740C] text-white animate-pulse" :
            state === "speaking" ? "bg-[#1E3A8A] text-white" :
            state === "error" ? "bg-[#DC2626] text-white" :
            "bg-[#E8740C] text-white hover:scale-105"
          }`}
        >
          {isRecording ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="12" height="12" x="6" y="6" rx="3"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
          )}
        </button>
        <div className="text-center font-bold text-[#1F1A14] drop-shadow-[0_2px_2px_rgba(255,255,255,0.8)] px-2 py-0.5 rounded-full bg-white/50 backdrop-blur-sm pointer-events-auto">
          बोला / बोलें / Speak
        </div>
      </div>
    </div>
  );
}
