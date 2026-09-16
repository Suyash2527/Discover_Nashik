// Template answers. No network, no Gemini — this is what runs when the pilgrim
// is offline or Gemini is slow, so it must never throw and never await.
import type { Category, Lang, Place } from "@/types";
import { formatDistanceKm, haversineKm, type LatLng } from "./geo";
import { normalize } from "./text";

type LangKey = "en" | "hi" | "mr";

const langKey = (lang: Lang): LangKey =>
  lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en";

/** Spoken category nouns, used for "the nearest <hospital>" phrasing. */
const CATEGORY_NOUN: Record<Category, Record<LangKey, string>> = {
  temple:   { en: "temple",        hi: "मंदिर",        mr: "मंदिर" },
  ghat:     { en: "ghat",          hi: "घाट",          mr: "घाट" },
  stay:     { en: "place to stay", hi: "ठहरने की जगह",  mr: "राहण्याची जागा" },
  food:     { en: "place to eat",  hi: "खाने की जगह",   mr: "जेवणाची जागा" },
  parking:  { en: "parking",       hi: "पार्किंग",      mr: "वाहनतळ" },
  hospital: { en: "hospital",      hi: "अस्पताल",       mr: "रुग्णालय" },
  police:   { en: "police station",hi: "पुलिस स्टेशन",  mr: "पोलीस स्टेशन" },
  toilet:   { en: "toilet",        hi: "शौचालय",        mr: "शौचालय" },
  water:    { en: "drinking water",hi: "पीने का पानी",  mr: "पिण्याचे पाणी" },
  chemist:  { en: "chemist",       hi: "मेडिकल स्टोर",  mr: "मेडिकल स्टोअर" },
};

const NOTHING_FOUND: Record<LangKey, string> = {
  en: "Sorry, I could not find that in my offline Nashik list. Please try a nearby landmark or a different name.",
  hi: "क्षमा करें, मुझे यह मेरी ऑफ़लाइन नाशिक सूची में नहीं मिला। कृपया कोई नज़दीकी स्थान या दूसरा नाम आज़माएँ।",
  mr: "क्षमस्व, हे माझ्या ऑफलाइन नाशिक यादीत सापडले नाही. कृपया जवळची खूण किंवा दुसरे नाव सांगा.",
};

const UNIT: Record<LangKey, Record<"km" | "m", string>> = {
  en: { km: "km", m: "m" },
  hi: { km: "किमी", m: "मीटर" },
  mr: { km: "किमी", m: "मीटर" },
};

/** "about 1.2 km away" in each language, or "" when we have no origin. */
function distancePhrase(km: number | null, key: LangKey): string {
  if (km === null) return "";
  const { value, unit } = formatDistanceKm(km);
  const u = UNIT[key][unit];
  if (key === "en") return ` about ${value} ${u} away`;
  if (key === "hi") return ` लगभग ${value} ${u} दूर`;
  return ` सुमारे ${value} ${u} अंतरावर`;
}

function primarySentence(place: Place, key: LangKey, km: number | null, asNearest: boolean): string {
  const name = place.name[key];
  const noun = CATEGORY_NOUN[place.category][key];
  const dist = distancePhrase(km, key);

  if (key === "en") {
    return asNearest
      ? `The nearest ${noun} is ${name} in ${place.area},${dist || " nearby"}.`
      : `${name} is in ${place.area}${dist ? `,${dist}` : ""}.`;
  }
  if (key === "hi") {
    return asNearest
      ? `सबसे नज़दीकी ${noun} ${name} है, जो ${place.area} में${dist || " पास"} है।`
      : `${name} ${place.area} में${dist} है।`;
  }
  return asNearest
    ? `सर्वात जवळचे ${noun} ${name} आहे, ते ${place.area} मध्ये${dist || " जवळ"} आहे.`
    : `${name} ${place.area} मध्ये${dist} आहे.`;
}

/** Second sentence: timings, phone, or the next-best alternative. */
function detailSentence(place: Place, alternative: Place | undefined, key: LangKey): string {
  if (place.open24x7) {
    if (key === "en") return "It is open 24 hours.";
    if (key === "hi") return "यह चौबीसों घंटे खुला रहता है।";
    return "ते चोवीस तास उघडे असते.";
  }
  if (place.timings) {
    if (key === "en") return `Timings are ${place.timings}.`;
    if (key === "hi") return `समय ${place.timings} है।`;
    return `वेळ ${place.timings} आहे.`;
  }
  if (place.phone) {
    if (key === "en") return `You can call ${place.phone}.`;
    if (key === "hi") return `आप ${place.phone} पर कॉल कर सकते हैं।`;
    return `तुम्ही ${place.phone} वर संपर्क करू शकता.`;
  }
  if (alternative) {
    const alt = alternative.name[key];
    if (key === "en") return `${alt} is another option nearby.`;
    if (key === "hi") return `${alt} भी एक नज़दीकी विकल्प है।`;
    return `${alt} हा दुसरा जवळचा पर्याय आहे.`;
  }
  return place.description[key];
}

/** Query words that mean "closest to me". */
const NEAREST_HINTS = [
  "nearest", "nearby", "near", "closest", "close by", "around",
  "जवळ", "जवळचे", "जवळच", "जवळील", "नजीक",
  "नज़दीक", "नजदीक", "पास", "आसपास", "करीब", "निकट",
];

function wantsNearest(query: string): boolean {
  const q = ` ${normalize(query)} `;
  return NEAREST_HINTS.some((h) => q.includes(normalize(h)));
}

/**
 * Template-based answer, max 2 sentences, in `lang`.
 * `origin` is the pilgrim's position from AskRequest.lat/lng — when present the
 * places are re-ranked by haversine distance and the answer states it.
 */
export function answerOffline(
  query: string,
  lang: Lang,
  contextPlaces: Place[],
  origin?: LatLng,
): string {
  const key = langKey(lang);
  if (contextPlaces.length === 0) return NOTHING_FOUND[key];

  const withDistance = contextPlaces.map((place) => ({
    place,
    km: origin ? haversineKm(origin, place) : null,
  }));

  const nearest = wantsNearest(query);
  // Only re-rank on distance when the pilgrim asked for "nearest"; otherwise
  // retrieval relevance (they named a place) should win.
  if (nearest && origin) {
    withDistance.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }

  const [best, ...rest] = withDistance;
  return [
    primarySentence(best.place, key, best.km, nearest),
    detailSentence(best.place, rest[0]?.place, key),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
