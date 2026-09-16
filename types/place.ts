// LOCKED CONTRACT — do not edit without team agreement.
export type Category =
  | "temple" | "ghat" | "stay" | "food" | "parking" | "transport"
  | "hospital" | "police" | "toilet" | "water" | "chemist";

export const CATEGORIES: Category[] = [
  "temple", "ghat", "stay", "food", "parking", "transport",
  "hospital", "police", "toilet", "water", "chemist",
];

export interface Localized { en: string; hi: string; mr: string }

export interface Place {
  id: string;                 // kebab-case, e.g. "kalaram-mandir"
  name: Localized;
  aliases: string[];          // STT / spelling variants
  category: Category;
  lat: number;
  lng: number;
  area: string;               // Panchavati | Nashik Road | Trimbakeshwar | Tapovan | City ...
  description: Localized;     // 1–2 sentences
  timings?: string;           // "05:00-21:00"
  phone?: string;
  open24x7?: boolean;
  accessible?: boolean;
  verified: { by: string; on: string; source: string };
}
