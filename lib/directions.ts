// Walking / driving directions via the Google Routes API (computeRoutes).
//
// Server-only: uses GOOGLE_MAPS_SERVER_KEY, which must never reach the browser.
// Everything except `computeRoute` is pure, so scripts/test-directions.ts can
// check request shaping, response parsing and intent detection offline.
//
// When the route can't be computed (no key, no network, Google error) callers
// get `straightLine` instead: distance + bearing, which the UI turns into a
// "Head this way" compass arrow.
import { bearingDeg, haversineKm, type LatLng } from "@/lib/geo";
import { normalize } from "@/lib/text";
import type { Lang } from "@/types";

export type TravelMode = "walk" | "drive";

export interface RouteStep {
  instruction: string;
  maneuver?: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceText?: string;
  durationText?: string;
}

export interface RouteResult {
  mode: TravelMode;
  language: "en" | "hi" | "mr";
  polyline: string;           // Google encoded polyline
  distanceMeters: number;
  durationSeconds: number;
  distanceText?: string;      // localized by Google, e.g. "5.2 किमी"
  durationText?: string;
  steps: RouteStep[];
}

export interface StraightLine {
  distanceMeters: number;
  bearingDeg: number;         // clockwise from north
}

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Only what the card and the map need — Routes bills by field mask tier. */
export const ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.localizedValues",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.navigationInstruction",
  "routes.legs.steps.localizedValues",
].join(",");

export const ROUTE_TIMEOUT_MS = 2500;

export function routeLanguage(lang: string | undefined): RouteResult["language"] {
  const base = (lang ?? "").slice(0, 2).toLowerCase();
  return base === "hi" || base === "mr" ? base : "en";
}

export function parseMode(mode: unknown): TravelMode {
  return mode === "drive" ? "drive" : "walk";
}

export function isServerKeyConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

export function straightLine(origin: LatLng, destination: LatLng): StraightLine {
  return {
    distanceMeters: Math.round(haversineKm(origin, destination) * 1000),
    bearingDeg: Math.round(bearingDeg(origin, destination)),
  };
}

export function buildRoutesBody(origin: LatLng, destination: LatLng, mode: TravelMode, language: string) {
  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  return {
    origin: point(origin),
    destination: point(destination),
    travelMode: mode === "drive" ? "DRIVE" : "WALK",
    // Traffic-aware routing is DRIVE-only; WALK rejects any routingPreference.
    ...(mode === "drive" && { routingPreference: "TRAFFIC_AWARE" }),
    languageCode: language,
    units: "METRIC",
  };
}

/** "754s" -> 754. */
export function parseDuration(value: unknown): number {
  const n = typeof value === "string" ? Number.parseFloat(value.replace(/s$/, "")) : NaN;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function parseRoutesResponse(json: Json, mode: TravelMode, language: RouteResult["language"]): RouteResult | null {
  const route = json?.routes?.[0];
  const polyline = route?.polyline?.encodedPolyline;
  if (!route || typeof polyline !== "string") return null;

  const steps: RouteStep[] = (route.legs ?? [])
    .flatMap((leg: Json) => leg.steps ?? [])
    .map((step: Json) => ({
      instruction: step.navigationInstruction?.instructions ?? "",
      maneuver: step.navigationInstruction?.maneuver,
      distanceMeters: step.distanceMeters ?? 0,
      durationSeconds: parseDuration(step.staticDuration),
      distanceText: step.localizedValues?.distance?.text,
      durationText: step.localizedValues?.staticDuration?.text,
    }))
    .filter((step: RouteStep) => step.instruction);

  return {
    mode,
    language,
    polyline,
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseDuration(route.duration),
    distanceText: route.localizedValues?.distance?.text,
    durationText: route.localizedValues?.duration?.text,
    steps,
  };
}

/** Throws on missing key, HTTP error, timeout or an empty route. */
export async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  lang: string | undefined,
  timeoutMs = ROUTE_TIMEOUT_MS,
): Promise<RouteResult> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY not set");
  const language = routeLanguage(lang);

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": ROUTES_FIELD_MASK,
    },
    body: JSON.stringify(buildRoutesBody(origin, destination, mode, language)),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Routes API ${res.status}: ${detail.slice(0, 200)}`);
  }
  const parsed = parseRoutesResponse(await res.json(), mode, language);
  if (!parsed) throw new Error("Routes API returned no route");
  return parsed;
}

// ---------------------------------------------------------------------------
// Voice: "how do I get to X"

const DIRECTION_PATTERNS: RegExp[] = [
  // English
  /\bhow (do|can|should|to) (i |we )?(get|go|reach|walk|drive)\b/,
  /\b(directions?|route|way) (to|for)\b/,
  /\btake me to\b/, /\bnavigate to\b/,
  // Hindi (Devanagari + romanised)
  /कैसे (जा|पहुँच|पहुंच)/, /(रास्ता|मार्ग) (बताओ|बताइए|बताएं|क्या)/, /का रास्ता/, /की ओर कैसे/,
  /\bkaise (ja|jau|jaun|jaye|jayen|jaaye|pahunch|pohoch)/, /\b(ka|ki) rasta\b/, /\brasta batao\b/,
  // Marathi (Devanagari + romanised)
  /कस[ें]? (जा|पोहोच)/, /कसं (जा|पोहोच)/, /(रस्ता|मार्ग) (सांगा|दाखवा)/, /चा (रस्ता|मार्ग)/,
  /\bkas[ae]? (ja|jaycha|jaaycha|jaaych|jau|pohoch)/, /\bcha rasta\b/, /\brasta (sanga|dakhva)\b/,
];

/** Is the pilgrim asking for a route (not just "where is" / "how far")? */
export function isDirectionsQuestion(query: string): boolean {
  const q = ` ${query.toLowerCase().normalize("NFC")} `;
  const n = ` ${normalize(query)} `;
  return DIRECTION_PATTERNS.some((re) => re.test(q) || re.test(n));
}

function minutesText(seconds: number, key: RouteResult["language"]): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const unit = { en: ["hr", "min"], hi: ["घंटे", "मिनट"], mr: ["तास", "मिनिटे"] }[key];
  return h ? `${h} ${unit[0]}${m ? ` ${m} ${unit[1]}` : ""}` : `${m} ${unit[1]}`;
}

/**
 * One spoken sentence: distance and time. Our own wording (not Google's
 * localized text) so every language reads the same and TTS never meets
 * abbreviations it mispronounces.
 */
export function directionsAnswer(placeName: string, route: Pick<RouteResult, "distanceMeters" | "durationSeconds" | "mode">, lang: Lang): string {
  const key = routeLanguage(lang);
  const km = route.distanceMeters / 1000;
  const dist = km < 1
    ? `${Math.max(10, Math.round(route.distanceMeters / 10) * 10)} ${{ en: "m", hi: "मीटर", mr: "मीटर" }[key]}`
    : `${Math.round(km * 10) / 10} ${{ en: "km", hi: "किलोमीटर", mr: "किलोमीटर" }[key]}`;
  const time = minutesText(route.durationSeconds, key);
  const walk = route.mode === "walk";
  switch (key) {
    case "hi":
      return `${placeName} ${dist} दूर है, ${walk ? "पैदल" : "गाड़ी से"} लगभग ${time}; रास्ता नक्शे पर दिखा रहे हैं।`;
    case "mr":
      return `${placeName} ${dist} अंतरावर आहे, ${walk ? "चालत" : "गाडीने"} सुमारे ${time}; मार्ग नकाशावर दाखवत आहोत.`;
    default:
      return `${placeName} is ${dist} away, about ${time} ${walk ? "on foot" : "by car"}; the route is on the map.`;
  }
}
