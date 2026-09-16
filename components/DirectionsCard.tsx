"use client";
// Directions for the selected place: distance + time, walk/drive switch, steps,
// a big "Start navigation" hand-off to Google Maps, and — offline or when the
// route fails — a compass arrow with the straight-line distance.
import { useState } from "react";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { formatDistanceKm } from "@/lib/geo";
import { ArrowUpIcon, CarIcon, ChevronLeftIcon, ListIcon, NavigationIcon, RotateCcwIcon, WalkIcon, XIcon } from "./icons";
import { loc, pick } from "./copy";
import { useHeading, type Directions, type TravelMode } from "./useDirections";

interface Props {
  place: Place;
  lang: Lang;
  directions: Directions;
  onBack: () => void;
  onClose: () => void;
}

function distanceLabel(meters: number, lang: Lang): string {
  const d = formatDistanceKm(meters / 1000);
  return `${d.value} ${d.unit === "km" ? pick(lang, "km", "किमी", "किमी") : pick(lang, "m", "मी", "मी")}`;
}

function durationLabel(seconds: number, lang: Lang): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hr = pick(lang, "hr", "घंटे", "तास");
  const min = pick(lang, "min", "मिनट", "मिनिटे");
  return h ? `${h} ${hr}${m ? ` ${m} ${min}` : ""}` : `${m} ${min}`;
}

function ModeSwitch({ mode, setMode, lang }: { mode: TravelMode; setMode: (m: TravelMode) => void; lang: Lang }) {
  const options: { value: TravelMode; label: string; icon: React.ReactNode }[] = [
    { value: "walk", label: pick(lang, "Walk", "पैदल", "चालत"), icon: <WalkIcon size={20} /> },
    { value: "drive", label: pick(lang, "Drive", "गाड़ी", "गाडी"), icon: <CarIcon size={20} /> },
  ];
  return (
    <div role="radiogroup" aria-label={pick(lang, "Travel mode", "यात्रा का तरीका", "प्रवासाचा प्रकार")} className="grid grid-cols-2 gap-1 rounded-xl bg-paper-2 p-1">
      {options.map((o) => {
        const on = o.value === mode;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => setMode(o.value)}
            className={`flex h-12 items-center justify-center gap-2 rounded-lg text-[17px] font-bold transition-colors ${
              on ? "bg-maroon text-white shadow-[0_4px_12px_-6px_rgba(123,27,42,.8)]" : "text-ink-2 active:bg-rule"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Compass({ bearing, distanceMeters, lang }: { bearing: number; distanceMeters: number | null; lang: Lang }) {
  const { heading, needsPermission, requestPermission } = useHeading(true);
  const rotation = heading === null ? bearing : bearing - heading;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-rule bg-paper p-4">
      <div className="relative flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full border-4 border-rule bg-card">
        <span className="absolute top-1 text-[12px] font-bold text-muted" aria-hidden>
          {heading === null ? pick(lang, "N", "उ", "उ") : ""}
        </span>
        <span
          className="text-haldi transition-transform duration-200 ease-out"
          style={{ transform: `rotate(${Math.round(rotation)}deg)` }}
          aria-hidden
        >
          <ArrowUpIcon size={64} />
        </span>
      </div>
      <div className="min-w-0">
        <p className="font-display text-[26px] leading-tight text-ink">
          {pick(lang, "Head this way", "इस दिशा में जाएं", "या दिशेने जा")}
        </p>
        {distanceMeters !== null && (
          <p className="tnum text-[17px] font-semibold text-ink-2">
            {distanceLabel(distanceMeters, lang)} {pick(lang, "in a straight line", "सीधी दूरी", "सरळ रेषेत")}
          </p>
        )}
        {heading === null && !needsPermission && (
          <p className="text-[14px] text-muted">{pick(lang, "North is up", "ऊपर उत्तर है", "वर उत्तर आहे")}</p>
        )}
        {needsPermission && (
          <button onClick={requestPermission} className="mt-1 text-[15px] font-bold text-maroon underline underline-offset-4">
            {pick(lang, "Use phone compass", "फोन का कंपास चालू करें", "फोनचा कंपास वापरा")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function DirectionsCard({ place, lang, directions, onBack, onClose }: Props) {
  const { status, mode, setMode, route, straightLine, retry } = directions;
  const [showSteps, setShowSteps] = useState(false);
  const travelmode = mode === "drive" ? "driving" : "walking";
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=${travelmode}`;
  const busy = status === "locating" || status === "loading";

  return (
    <article className="rise bg-card" aria-live="polite">
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          onClick={onBack}
          aria-label={pick(lang, "Back to place", "जगह पर वापस", "ठिकाणावर परत")}
          className="flex h-11 items-center gap-1 rounded-full pr-3 pl-1 text-[15px] font-semibold text-ink-2 active:bg-paper-2"
        >
          <ChevronLeftIcon size={22} />
          {pick(lang, "Back", "वापस", "मागे")}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="kicker">{pick(lang, "Directions to", "रास्ता", "रस्ता")}</p>
          <h2 className="truncate font-display text-[22px] leading-tight text-ink">{loc(lang, place.name)}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label={pick(lang, "Close", "बंद करें", "बंद करा")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 active:bg-paper-2"
        >
          <XIcon size={20} />
        </button>
      </div>

      <div className="space-y-2.5 px-4 pt-2 pb-4 md:space-y-3 md:px-5 md:pb-5">
        <ModeSwitch mode={mode} setMode={setMode} lang={lang} />

        {busy && (
          <div className="flex h-[88px] items-center justify-center gap-3 rounded-xl bg-paper text-[17px] font-semibold text-ink-2">
            <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-rule border-t-haldi" aria-hidden />
            {status === "locating"
              ? pick(lang, "Finding your location…", "आपकी लोकेशन ढूंढ रहे हैं…", "तुमचे ठिकाण शोधत आहोत…")
              : pick(lang, "Finding the best route…", "सबसे अच्छा रास्ता ढूंढ रहे हैं…", "उत्तम मार्ग शोधत आहोत…")}
          </div>
        )}

        {status === "route" && route && (
          <>
            <div className="flex items-end justify-between gap-3 rounded-xl bg-paper px-4 py-2.5">
              <div>
                <p className="kicker">{pick(lang, "Time", "समय", "वेळ")}</p>
                <p className="tnum font-display text-[32px] leading-none text-maroon">{durationLabel(route.durationSeconds, lang)}</p>
              </div>
              <div className="text-right">
                <p className="kicker">{pick(lang, "Distance", "दूरी", "अंतर")}</p>
                <p className="tnum text-[24px] leading-none font-bold text-ink">{distanceLabel(route.distanceMeters, lang)}</p>
              </div>
            </div>

            {route.steps.length > 0 && (
              <div className="rounded-xl border border-rule">
                <button
                  onClick={() => setShowSteps((s) => !s)}
                  aria-expanded={showSteps}
                  className="flex h-12 w-full items-center gap-2 px-4 text-[17px] font-bold text-ink active:bg-paper-2"
                >
                  <ListIcon size={20} />
                  {pick(lang, "Steps", "कदम", "पायऱ्या")} ({route.steps.length})
                  <span className="ml-auto text-[14px] font-semibold text-maroon">
                    {showSteps ? pick(lang, "Hide", "छिपाएं", "लपवा") : pick(lang, "Show", "दिखाएं", "दाखवा")}
                  </span>
                </button>
                {showSteps && (
                  <ol className="max-h-[32dvh] overflow-y-auto border-t border-rule md:max-h-none">
                    {route.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
                        <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper-2 text-[13px] font-bold text-ink-2">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[16px] leading-snug whitespace-pre-line text-ink">{step.instruction}</p>
                          {step.distanceText && <p className="tnum text-[14px] text-muted">{step.distanceText}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </>
        )}

        {status === "fallback" && straightLine && (
          <>
            <Compass bearing={straightLine.bearingDeg} distanceMeters={straightLine.distanceMeters} lang={lang} />
            <p className="flex items-center gap-2 text-[14px] text-muted">
              {typeof navigator !== "undefined" && !navigator.onLine
                ? pick(lang, "You are offline. Route will load when you reconnect.", "आप ऑफ़लाइन हैं। नेटवर्क आने पर रास्ता दिखेगा।", "तुम्ही ऑफलाइन आहात. नेटवर्क आल्यावर मार्ग दिसेल.")
                : pick(lang, "Route not available right now.", "अभी रास्ता उपलब्ध नहीं है।", "सध्या मार्ग उपलब्ध नाही.")}
              <button onClick={retry} className="ml-auto flex h-10 shrink-0 items-center gap-1 rounded-full px-3 font-bold text-maroon active:bg-paper-2">
                <RotateCcwIcon size={16} />
                {pick(lang, "Retry", "फिर से", "पुन्हा")}
              </button>
            </p>
          </>
        )}

        {status === "no-location" && (
          <div className="rounded-xl bg-paper p-4">
            <p className="text-[17px] font-semibold text-ink">
              {pick(lang, "Turn on location to see the way.", "रास्ता देखने के लिए लोकेशन चालू करें।", "मार्ग पाहण्यासाठी लोकेशन सुरू करा.")}
            </p>
            <button onClick={retry} className="mt-2 flex h-11 items-center gap-2 rounded-full border-2 border-maroon px-4 text-[16px] font-bold text-maroon active:bg-paper-2">
              <RotateCcwIcon size={16} />
              {pick(lang, "Try again", "फिर कोशिश करें", "पुन्हा प्रयत्न करा")}
            </button>
          </div>
        )}

        {/* Pinned so it stays reachable while the steps list is open. */}
        <div className="sticky bottom-0 -mx-4 bg-card px-4 py-1 md:-mx-5 md:px-5 md:pb-3">
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[60px] w-full items-center justify-center gap-3 rounded-xl bg-haldi text-[20px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(226,106,18,.8)] active:opacity-90"
          >
            <NavigationIcon size={22} />
            {pick(lang, "Start navigation", "नेविगेशन शुरू करें", "नेव्हिगेशन सुरू करा")}
          </a>
        </div>
      </div>
    </article>
  );
}
