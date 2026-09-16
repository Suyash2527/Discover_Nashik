// Offline retrieval over data/places.json. No embeddings, no network.
//
// The JSON is imported (not read from disk) so it is inlined at build time:
// retrieval keeps working on any runtime and with no connectivity.
import placesData from "@/data/places.json";
import { CATEGORIES, type Category, type Lang, type Place } from "@/types";
import { normalize, similarity, tokens } from "./text";

export const PLACES = placesData as Place[];

/** How many places `retrieve()` hands to the answer layer. */
export const TOP_K = 5;

/**
 * Category intent keywords, en / hi / mr (plus common romanised Marathi).
 * A hit here scores every place in that category, so "जवळचे हॉस्पिटल" finds
 * hospitals even when no hospital name appears in the query.
 */
export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  temple: [
    "temple", "mandir", "मंदिर", "देऊळ", "devool", "shrine", "मठ",
    "temples", "darshan", "दर्शन", "देवालय",
  ],
  ghat: [
    "ghat", "घाट", "kund", "कुंड", "river", "नदी", "bathing", "स्नान",
    "snan", "ghats", "godavari", "गोदावरी", "tirth", "तीर्थ",
  ],
  stay: [
    "stay", "hotel", "हॉटेल", "होटल", "lodge", "लॉज", "dharamshala",
    "धर्मशाळा", "धर्मशाला", "room", "खोली", "कमरा", "निवास", "nivas",
    "accommodation", "raahat", "मुक्काम", "guest house", "ashram", "आश्रम",
  ],
  food: [
    "food", "जेवण", "jevan", "खाना", "khana", "restaurant", "रेस्टॉरंट",
    "hotel food", "mess", "मेस", "bhojan", "भोजन", "prasad", "प्रसाद",
    "canteen", "उपाहारगृह", "eat", "hungry", "भूक", "भूख", "annachhatra",
    "अन्नछत्र",
  ],
  transport: [
    "bus", "bus stand", "bus stop", "st stand", "depot", "railway station", "railway", "train", "airport", "flight",
    "बस", "बस स्टैंड", "रेलवे स्टेशन", "रेलवे", "ट्रेन", "हवाई अड्डा", "बस स्थानक", "एसटी", "रेल्वे", "विमानतळ",
  ],
  parking: [
    "parking", "पार्किंग", "park vehicle", "गाडी", "gadi", "vehicle",
    "वाहन", "vahan", "car", "कार", "two wheeler",
    "तळ", "vahantal", "वाहनतळ",
  ],
  hospital: [
    "hospital", "हॉस्पिटल", "रुग्णालय", "rugnalay", "rugnalaya",
    "dawakhana", "दवाखाना", "दवाखान", "अस्पताल", "aspatal", "clinic",
    "क्लिनिक", "doctor", "डॉक्टर", "emergency", "आपत्कालीन", "ambulance",
    "रुग्णवाहिका", "injury", "जखम", "इलाज", "treatment", "medical help",
  ],
  police: [
    "police", "पोलीस", "पुलिस", "thane", "ठाणे", "police station",
    "पोलीस स्टेशन", "चौकी", "chowki", "cop", "kotwali", "कोतवाली",
    "complaint", "तक्रार", "शिकायत", "lost", "हरवले", "safety", "मदत",
  ],
  toilet: [
    "toilet", "शौचालय", "shauchalay", "टॉयलेट", "washroom", "restroom",
    "bathroom", "स्वच्छतागृह", "swachhatagruha", "संडास", "sandas",
    "urinal", "मुतारी", "loo",
  ],
  water: [
    "water", "पाणी", "pani", "पानी", "drinking water", "पिण्याचे पाणी",
    "peene ka pani", "nal", "नळ", "नल", "tap", "जलकुंभ", "water point",
    "थंड पाणी", "thirsty", "तहान", "प्यास",
  ],
  chemist: [
    "chemist", "medical", "मेडिकल", "औषध दुकान", "pharmacy", "फार्मसी",
    "औषधालय", "aushadh", "औषध", "दवा", "dawa", "दवा दुकान", "medicine",
    "मेडिसिन", "druggist", "tablet", "गोळी", "goli",
  ],
};

export interface ScoredPlace { place: Place; score: number }

/** Every string on a place worth matching a query against, with its weight. */
function haystack(place: Place): Array<{ text: string; weight: number }> {
  return [
    { text: place.name.en, weight: 1 },
    { text: place.name.hi, weight: 1 },
    { text: place.name.mr, weight: 1 },
    ...place.aliases.map((a) => ({ text: a, weight: 0.9 })),
    { text: place.id.replace(/-/g, " "), weight: 0.8 },
    { text: place.area, weight: 0.6 },
    { text: place.category, weight: 0.5 },
  ];
}

/**
 * Category intents present in a query. Exported so scripts/test-rag.ts can
 * verify the keyword map even when data/places.json has no place in that
 * category yet.
 */
export function detectCategoryIntents(query: string): Set<Category> {
  const normalizedQuery = normalize(query);
  const padded = ` ${normalizedQuery} `;
  const queryTokens = tokens(normalizedQuery);
  const hits = new Set<Category>();

  for (const category of CATEGORIES) {
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      const k = normalize(keyword);
      if (!k) continue;
      // Multi-word keywords match as a phrase; single words as whole tokens,
      // with a fuzzy pass so "hosptal" / "rugnaly" still land.
      if (k.includes(" ")) {
        if (padded.includes(` ${k} `) || normalizedQuery.includes(k)) { hits.add(category); break; }
      } else if (
        queryTokens.some((t) => t === k || (t.length > 4 && k.length > 4 && similarity(t, k) >= 0.8))
      ) {
        hits.add(category);
        break;
      }
    }
  }
  return hits;
}

function scoreAgainst(normalizedQuery: string, queryTokens: string[], text: string): number {
  const candidate = normalize(text);
  if (!candidate) return 0;

  if (candidate === normalizedQuery) return 100;
  if (normalizedQuery.includes(candidate)) return 70;   // "रामकुंड कुठे आहे" ⊃ "रामकुंड"
  if (candidate.includes(normalizedQuery)) return 55;   // "ram" ⊂ "ramkund"

  const candidateTokens = candidate.split(" ");
  let best = 0;
  for (const qt of queryTokens) {
    if (qt.length < 2) continue;
    for (const ct of candidateTokens) {
      if (qt === ct) { best = Math.max(best, 40); continue; }
      if (ct.length > 3 && qt.length > 3 && (ct.startsWith(qt) || qt.startsWith(ct))) {
        best = Math.max(best, 30);
        continue;
      }
      const sim = similarity(qt, ct);
      // Fuzzy tail: catches STT noise ("trimbak" vs "trimbakeshwar", "ramkond").
      if (sim >= 0.7 && Math.max(qt.length, ct.length) >= 4) {
        best = Math.max(best, Math.round(sim * 28));
      }
    }
  }
  return best;
}

/** Every place with a non-zero score, descending. */
function scoreAll(query: string): ScoredPlace[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const queryTokens = tokens(normalizedQuery);
  const intents = detectCategoryIntents(normalizedQuery);

  const scored = PLACES.map((place) => {
    let score = 0;
    for (const { text, weight } of haystack(place)) {
      score = Math.max(score, scoreAgainst(normalizedQuery, queryTokens, text) * weight);
    }
    if (intents.has(place.category)) score += 45;
    return { place, score: Math.round(score * 100) / 100 };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id));
  return scored;
}

/** Scored retrieval, so callers can inspect confidence. Descending by score. */
export function retrieveScored(query: string, lang: Lang): ScoredPlace[] {
  void lang; // Matching is language-agnostic: every locale's name is indexed.
  return scoreAll(query).slice(0, TOP_K);
}

/**
 * Does the query literally contain this place's own name (any language)?
 *
 * A high retrieval score alone does not mean the pilgrim named a place:
 * several places carry their category word as an alias ("chemist"), and the
 * category bonus stacks on loose token overlap — "Amrit Snan dates" scores
 * Ramkund at 64 without mentioning it.
 */
export function queryNamesPlace(query: string, place: Place): boolean {
  const q = ` ${normalize(query)} `;
  return [place.name.en, place.name.hi, place.name.mr].some((n) => q.includes(` ${normalize(n)} `));
}

/**
 * Like retrieveScored, but a pure category question ("nearest chemist") with a
 * known position returns the CLOSEST places of that category, not the first
 * five by id.
 *
 * retrieveScored gives every chemist the same +45, so the top five is decided
 * by the id tie-break — with 85 places that routinely drops the chemist two
 * streets away. Only kicks in below `nameFloor`: once the pilgrim has named a
 * place, that place must stay first regardless of distance.
 */
export function retrieveScoredNear(
  query: string,
  lang: Lang,
  origin: { lat: number; lng: number } | undefined,
  nameFloor: number,
): ScoredPlace[] {
  void lang;
  const all = scoreAll(query);
  if (!origin || !all.length) return all.slice(0, TOP_K);

  if (all.some((s) => s.score >= nameFloor && queryNamesPlace(query, s.place))) {
    return all.slice(0, TOP_K);
  }

  const intents = detectCategoryIntents(query);
  const inCategory = all.filter((s) => intents.has(s.place.category));
  if (!inCategory.length) return all.slice(0, TOP_K);

  const dist = (s: ScoredPlace) =>
    (s.place.lat - origin.lat) ** 2 +
    ((s.place.lng - origin.lng) * Math.cos((origin.lat * Math.PI) / 180)) ** 2;
  return inCategory.sort((a, b) => dist(a) - dist(b)).slice(0, TOP_K);
}

/** Top-5 places for a voice query. Offline, deterministic. */
export function retrieve(query: string, lang: Lang): Place[] {
  return retrieveScored(query, lang).map((s) => s.place);
}
