import type { Lang } from "@/types/voice";
import type { Category, Localized, Place } from "@/types/place";

export type L = Lang;

/** Pick the string for the current UI language. */
export function pick<T>(lang: Lang, en: T, hi: T, mr: T): T {
  return lang === "mr-IN" ? mr : lang === "hi-IN" ? hi : en;
}

export function loc(lang: Lang, s: Localized): string {
  return pick(lang, s.en, s.hi, s.mr);
}

export function placeName(lang: Lang, p: Place): string {
  return loc(lang, p.name);
}

export const CATEGORY_LABEL: Record<Category, Localized> = {
  temple:   { en: "Temples",  hi: "मंदिर",    mr: "मंदिर" },
  ghat:     { en: "Ghats",    hi: "घाट",      mr: "घाट" },
  food:     { en: "Food",     hi: "भोजन",     mr: "जेवण" },
  stay:     { en: "Stay",     hi: "ठहरना",    mr: "मुक्काम" },
  parking:  { en: "Parking",  hi: "पार्किंग",  mr: "पार्किंग" },
  transport: { en: "Bus & train", hi: "बस व ट्रेन", mr: "बस व रेल्वे" },
  hospital: { en: "Hospital", hi: "अस्पताल",  mr: "रुग्णालय" },
  police:   { en: "Police",   hi: "पुलिस",    mr: "पोलीस" },
  toilet:   { en: "Toilets",  hi: "शौचालय",   mr: "शौचालय" },
  water:    { en: "Water",    hi: "पानी",     mr: "पाणी" },
  chemist:  { en: "Chemist",  hi: "दवाई",     mr: "औषध" },
};

export const LANGS: { code: Lang; label: string }[] = [
  { code: "mr-IN", label: "मराठी" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "en-IN", label: "English" },
];
