"use client";

import { useState } from "react";

const STORAGE_KEY = "discover-nashik-hint-seen";

// One screen, three lines, all three scripts. Pilgrims shouldn't page through a tour.
const LINES = [
  { n: "१", mr: "केशरी माईक बटण दाबा आणि बोला", hi: "केसरिया माइक बटन दबाकर बोलिए", en: "Press the orange mic button and speak" },
  { n: "२", mr: "वरच्या नावांवर टॅप करून ठिकाणं निवडा", hi: "ऊपर के नाम दबाकर जगह चुनें", en: "Tap the names on top to filter" },
  { n: "३", mr: "संकटात लाल SOS दाबा", hi: "मुसीबत में लाल SOS दबाएं", en: "In trouble, press the red SOS" },
];

export default function HintOverlay() {
  // MapClient is loaded with ssr:false, so localStorage is safe to read on first render.
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false; // storage blocked — skip the guide
    }
  });

  if (!visible) return null;

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/55 md:items-center" role="dialog" aria-modal="true">
      <div className="rise w-full rounded-t-xl bg-card px-6 pt-6 pb-7 md:max-w-md md:rounded-xl">
        <p className="kicker">नाशिक · कुंभ</p>
        <h2 className="mt-1 font-display text-[30px] leading-tight">नमस्कार. Welcome.</h2>

        <ol className="mt-5 border-t border-rule">
          {LINES.map((l) => (
            <li key={l.n} className="flex gap-4 border-b border-rule py-3">
              <span className="font-display text-[26px] leading-none text-haldi">{l.n}</span>
              <span>
                <span className="block text-[18px] font-semibold leading-snug">{l.mr}</span>
                <span className="block text-[15px] text-ink-2">{l.hi}</span>
                <span className="block text-[14px] text-muted">{l.en}</span>
              </span>
            </li>
          ))}
        </ol>

        <button onClick={close} className="mt-6 h-[54px] w-full rounded-md bg-ink text-[18px] font-semibold text-paper active:opacity-90">
          समजलं · ठीक है · Got it
        </button>
      </div>
    </div>
  );
}
