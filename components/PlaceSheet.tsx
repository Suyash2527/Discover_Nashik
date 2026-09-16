"use client";

import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { formatDistanceKm, haversineKm, type LatLng } from "@/lib/geo";
import { CategoryIcon, categoryColor, NavigationIcon, PhoneIcon, XIcon } from "./icons";
import { CATEGORY_LABEL, loc, pick } from "./copy";

interface Props {
  place: Place;
  lang: Lang;
  userPos: LatLng | null;
  onClose: () => void;
}

export default function PlaceSheet({ place, lang, userPos, onClose }: Props) {
  const primary = loc(lang, place.name);
  // Always show one other script so a pilgrim can match it against signboards.
  const alt = lang === "en-IN" ? place.name.mr : place.name.en;
  const dist = userPos ? formatDistanceKm(haversineKm(userPos, place)) : null;

  const hours = place.open24x7
    ? pick(lang, "Open all day", "24 घंटे खुला", "२४ तास उघडे")
    : place.timings ?? pick(lang, "Timings not confirmed", "समय पक्का नहीं", "वेळ निश्चित नाही");

  return (
    <article className="rise bg-card">
      <div className="flex items-start gap-3 px-5 pt-4">
        <span
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: categoryColor(place.category) }}
        >
          <CategoryIcon category={place.category} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="kicker">
            {loc(lang, CATEGORY_LABEL[place.category])} · {place.area}
          </p>
          <h2 className="font-display text-[27px] leading-[1.15] text-ink">{primary}</h2>
          {alt !== primary && <p className="text-[15px] text-muted">{alt}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label={pick(lang, "Close", "बंद करें", "बंद करा")}
          className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 active:bg-paper-2"
        >
          <XIcon size={20} />
        </button>
      </div>

      <p className="px-5 pt-3 text-[16px] leading-relaxed text-ink-2">{loc(lang, place.description)}</p>

      <dl className="mx-5 mt-4 grid grid-cols-2 border-y border-rule text-[15px]">
        <div className="py-2.5 pr-3">
          <dt className="kicker">{pick(lang, "Hours", "समय", "वेळ")}</dt>
          <dd className="tnum font-semibold">{hours}</dd>
        </div>
        <div className="border-l border-rule py-2.5 pl-3">
          <dt className="kicker">{pick(lang, "Distance", "दूरी", "अंतर")}</dt>
          <dd className="tnum font-semibold">
            {dist ? `${dist.value} ${dist.unit}` : pick(lang, "Turn on location", "लोकेशन चालू करें", "लोकेशन सुरू करा")}
          </dd>
        </div>
        {place.accessible && (
          <div className="col-span-2 border-t border-rule py-2.5 font-semibold">
            {pick(lang, "Step-free access", "व्हीलचेयर से पहुंच", "व्हीलचेअरने जाता येते")}
          </div>
        )}
      </dl>

      <div className="flex gap-2 px-5 pt-4 pb-5">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-haldi text-[18px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(226,106,18,.8)] active:opacity-90"
        >
          <NavigationIcon size={19} />
          {pick(lang, "Directions", "रास्ता", "रस्ता दाखवा")}
        </a>
        {place.phone && (
          <a
            href={`tel:${place.phone}`}
            className="flex h-[52px] items-center justify-center gap-2 rounded-md border border-ink px-5 text-[17px] font-semibold text-ink active:bg-paper-2"
          >
            <PhoneIcon size={18} />
            {pick(lang, "Call", "कॉल", "फोन")}
          </a>
        )}
      </div>
    </article>
  );
}
