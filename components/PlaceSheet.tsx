"use client";

import { Place } from "@/types/place";
import { categoryColor, CategoryIcon, MapPinIcon, PhoneIcon, XIcon } from "./icons";

interface Props {
  place: Place;
  onClose: () => void;
  lang: "mr-IN" | "hi-IN" | "en-IN";
}

function timingLabel(place: Place): { text: string; open: boolean } {
  if (place.open24x7) return { text: "24×7 उघडा / Open", open: true };
  if (place.timings)  return { text: place.timings, open: true };
  return { text: "Verify timings", open: false };
}

export default function PlaceSheet({ place, onClose, lang }: Props) {
  const color = categoryColor(place.category);
  const timing = timingLabel(place);

  const namePrimary = lang === "mr-IN" ? place.name.mr : lang === "hi-IN" ? place.name.hi : place.name.en;
  const nameSecond  = lang === "mr-IN" ? place.name.hi : lang === "hi-IN" ? place.name.mr : place.name.hi;
  const nameThird   = place.name.en;

  const descPrimary = lang === "mr-IN" ? place.description.mr : lang === "hi-IN" ? place.description.hi : place.description.en;

  return (
    <div className="flex flex-col bg-white rounded-t-[28px] md:rounded-2xl shadow-2xl overflow-hidden sheet-enter">
      {/* Drag handle (mobile) */}
      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden" />

      <div className="p-5 flex flex-col gap-4">
        {/* Header row */}
        <div className="flex items-start gap-4">
          {/* Category icon */}
          <div
            className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md"
            style={{ backgroundColor: color }}
          >
            <CategoryIcon category={place.category} size={30} />
          </div>

          {/* Names */}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-[#1E3A8A] leading-tight truncate">{namePrimary}</h2>
            {nameSecond !== namePrimary && (
              <p className="text-lg font-bold text-[#1C1917] truncate">{nameSecond}</p>
            )}
            {nameThird !== namePrimary && nameThird !== nameSecond && (
              <p className="text-base font-medium text-[#57534E] truncate">{nameThird}</p>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 transition shrink-0"
            aria-label="Close"
          >
            <XIcon size={20} className="text-[#57534E]" />
          </button>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${
              timing.open
                ? "bg-green-50 text-[#16A34A]"
                : "bg-gray-100 text-[#57534E]"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${timing.open ? "bg-[#16A34A]" : "bg-gray-400"}`} />
            {timing.text}
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold text-[#57534E]">
            <MapPinIcon size={14} className="text-[#EA580C]" />
            {place.area}
          </span>
          {place.accessible && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-50 text-[#1E3A8A]">♿ Accessible</span>
          )}
        </div>

        {/* Description */}
        <p className="text-[15px] text-[#57534E] leading-relaxed">{descPrimary}</p>

        {/* Action buttons */}
        <div className="flex gap-3">
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-[#1E3A8A] text-white rounded-2xl py-4 flex flex-col items-center gap-1.5 font-black text-base shadow-lg shadow-blue-900/25 active:scale-[0.97] transition"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            {lang === "mr-IN" ? "दिशा" : lang === "hi-IN" ? "दिशा" : "Directions"}
          </a>

          {place.phone ? (
            <a
              href={`tel:${place.phone}`}
              className="flex-1 border-2 border-[#1E3A8A] text-[#1E3A8A] rounded-2xl py-4 flex flex-col items-center gap-1.5 font-black text-base active:bg-blue-50 active:scale-[0.97] transition"
            >
              <PhoneIcon size={26} />
              {lang === "mr-IN" ? "फोन" : lang === "hi-IN" ? "फ़ोन" : "Call"}
            </a>
          ) : (
            <div className="flex-1 border-2 border-gray-200 text-gray-300 rounded-2xl py-4 flex flex-col items-center gap-1.5 font-black text-base cursor-not-allowed">
              <PhoneIcon size={26} />
              {lang === "mr-IN" ? "फोन नाही" : lang === "hi-IN" ? "फ़ोन नहीं" : "No phone"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
