"use client";

import { useMemo } from "react";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { formatDistanceKm, haversineKm, type LatLng } from "@/lib/geo";
import { PhoneIcon, XIcon } from "./icons";
import { loc, pick } from "./copy";

interface Props {
  lang: Lang;
  places: Place[];
  userPos: LatLng | null;
  onClose: () => void;
  onSelectPlace: (p: Place) => void;
}

const NASHIK: LatLng = { lat: 20.0059, lng: 73.791 };

function nearest(places: Place[], from: LatLng, category: "hospital" | "police") {
  let best: { place: Place; km: number } | null = null;
  for (const p of places) {
    if (p.category !== category) continue;
    const km = haversineKm(from, p);
    if (!best || km < best.km) best = { place: p, km };
  }
  return best;
}

export default function SosSheet({ lang, places, userPos, onClose, onSelectPlace }: Props) {
  const from = userPos ?? NASHIK;
  const rows = useMemo(
    () => [
      { label: pick(lang, "Nearest hospital", "नज़दीकी अस्पताल", "जवळचे रुग्णालय"), hit: nearest(places, from, "hospital") },
      { label: pick(lang, "Nearest police", "नज़दीकी पुलिस", "जवळचे पोलीस"), hit: nearest(places, from, "police") },
    ],
    [lang, places, from]
  );

  const numbers = [
    { label: pick(lang, "Ambulance", "एम्बुलेंस", "रुग्णवाहिका"), num: "108" },
    { label: pick(lang, "Police", "पुलिस", "पोलीस"), num: "100" },
    { label: pick(lang, "Fire", "अग्निशमन", "अग्निशमन"), num: "101" },
    { label: pick(lang, "Women helpline", "महिला हेल्पलाइन", "महिला हेल्पलाइन"), num: "1091" },
  ];

  const here = `https://maps.google.com/?q=${from.lat.toFixed(5)},${from.lng.toFixed(5)}`;
  const sms = encodeURIComponent(`I need help. My location in Nashik: ${here}`);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="rise max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-card md:max-w-md md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-[26px] text-kumkum">{pick(lang, "Get help now", "तुरंत मदद", "लगेच मदत")}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full active:bg-paper-2">
            <XIcon size={20} />
          </button>
        </header>

        <div className="px-5">
          <a
            href="tel:112"
            className="flex h-[64px] items-center justify-between rounded-md bg-kumkum px-5 text-paper active:opacity-90"
          >
            <span className="text-[18px] font-semibold">{pick(lang, "Call emergency", "आपातकाल कॉल", "आपत्कालीन कॉल")}</span>
            <span className="tnum font-display text-[32px] leading-none">112</span>
          </a>
        </div>

        <ul className="mx-5 mt-4 border-t border-rule">
          {rows.map(({ label, hit }) =>
            hit ? (
              <li key={label} className="border-b border-rule py-3">
                <p className="kicker">
                  {label} · <span className="tnum">{formatDistanceKm(hit.km).value} {formatDistanceKm(hit.km).unit}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-3">
                  <button
                    onClick={() => { onSelectPlace(hit.place); onClose(); }}
                    className="min-w-0 flex-1 truncate text-left text-[18px] font-semibold underline decoration-rule underline-offset-4"
                  >
                    {loc(lang, hit.place.name)}
                  </button>
                  {hit.place.phone && (
                    <a
                      href={`tel:${hit.place.phone}`}
                      aria-label={`Call ${hit.place.name.en}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink active:bg-paper-2"
                    >
                      <PhoneIcon size={17} />
                    </a>
                  )}
                </div>
              </li>
            ) : null
          )}
        </ul>

        <div className="mx-5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-rule bg-rule">
          {numbers.map((n) => (
            <a key={n.num} href={`tel:${n.num}`} className="flex items-baseline justify-between bg-card px-3 py-3 active:bg-paper-2">
              <span className="text-[15px] text-ink-2">{n.label}</span>
              <span className="tnum text-[20px] font-semibold">{n.num}</span>
            </a>
          ))}
        </div>

        <a
          href={`sms:?body=${sms}`}
          className="mx-5 mt-4 mb-6 flex h-[50px] items-center justify-center rounded-md border border-ink text-[16px] font-semibold active:bg-paper-2"
        >
          {pick(lang, "Text my location to family", "परिवार को लोकेशन भेजें", "घरच्यांना लोकेशन पाठवा")}
        </a>
      </div>
    </div>
  );
}
