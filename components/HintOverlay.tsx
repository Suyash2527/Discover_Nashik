"use client";

import { useState, useEffect } from "react";
import { MicIcon, MapPinIcon, AlertCircleIcon } from "./icons";

const STEPS = [
  {
    icon: <MicIcon size={56} className="text-[#EA580C]" />,
    title: "Speak to search",
    titleMr: "बोला आणि शोधा",
    titleHi: "बोलकर खोजें",
    body: "Tap the big orange button and speak in Marathi, Hindi or English.",
    bodyMr: "मोठ्या केशरी बटणावर टॅप करा आणि बोला.",
    bodyHi: "बड़े नारंगी बटन को दबाएं और बोलें।",
  },
  {
    icon: <div className="w-14 h-14 rounded-2xl bg-[#0284C7] flex items-center justify-center text-white">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18 H21"/><path d="M5 15 H19"/><path d="M7 12 H17"/><path d="M2 20 C5 18.5 8 20.5 11 19.5 S17 18 22 20" strokeWidth={1.5}/>
            </svg>
          </div>,
    title: "Tap a picture to filter",
    titleMr: "फिल्टर करण्यासाठी चित्रावर टॅप करा",
    titleHi: "फ़िल्टर करने के लिए चित्र दबाएं",
    body: "The coloured tiles show different types of places. Tap them on or off.",
    bodyMr: "रंगीत चौकोन वेगवेगळ्या ठिकाणांचे प्रकार दाखवतात.",
    bodyHi: "रंगीन टाइलें विभिन्न प्रकार के स्थान दिखाती हैं।",
  },
  {
    icon: <AlertCircleIcon size={56} className="text-[#DC2626]" />,
    title: "Red button for help",
    titleMr: "मदतीसाठी लाल बटण",
    titleHi: "मदद के लिए लाल बटन",
    body: 'For any emergency, tap the red "SOS" button at the bottom left.',
    bodyMr: 'आपत्कालीन मदतीसाठी, खाली डाव्या कोपऱ्यातील लाल SOS बटण दाबा.',
    bodyHi: 'किसी भी आपात स्थिति में नीचे बाएं "SOS" बटन दबाएं।',
  },
];

const STORAGE_KEY = "discover-nashik-hint-seen";

function getHintSeen(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function setHintSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export default function HintOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!getHintSeen()) setVisible(true);
  }, []);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const advance = () => {
    if (isLast) {
      setHintSeen();
      setVisible(false);
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm hint-enter"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome guide"
    >
      <div className="mx-4 w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6">
        {/* Step dots */}
        <div className="flex gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === step ? "w-6 h-2.5 bg-[#EA580C]" : "w-2.5 h-2.5 bg-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex items-center justify-center">{current.icon}</div>

        {/* Text */}
        <div className="text-center space-y-1">
          <p className="text-xl font-bold text-[#1C1917]">{current.titleMr}</p>
          <p className="text-lg font-semibold text-[#57534E]">{current.titleHi}</p>
          <p className="text-base text-[#57534E] mt-2">{current.body}</p>
        </div>

        {/* CTA */}
        <button
          onClick={advance}
          className="w-full bg-[#EA580C] text-white text-xl font-bold py-4 rounded-2xl active:scale-95 transition-all shadow-lg shadow-orange-500/30"
        >
          {isLast ? "OK, समजले! / OK!" : "पुढे / आगे / Next →"}
        </button>
      </div>
    </div>
  );
}
