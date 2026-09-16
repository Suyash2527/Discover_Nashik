// Place photos: Wikimedia Commons first (downloaded at build time by
// scripts/fetch-photos.ts, served from /photos, works offline), Google Places
// (New) as a live fallback for places Commons has nothing certain for.
//
// Google terms: we cache only the Google place ID (in memory), never the photo
// bytes, and the UI must show "Google Maps" plus the author attributions.
import photosData from "@/data/photos.json";
import type { Place } from "@/types";

export interface WikimediaPhoto { src: string; author: string; license: string; sourceUrl: string }

export interface PlacePhoto {
  source: "wikimedia" | "google";
  src: string;
  /** Wikimedia: author + license + file page. Google: author display names. */
  attribution: { text: string; url?: string }[];
  license?: string;
  sourceUrl?: string;
}

export const WIKIMEDIA_PHOTOS = photosData as Record<string, WikimediaPhoto>;

const PLACES_BASE = "https://places.googleapis.com/v1";
const GOOGLE_TIMEOUT_MS = 3000;

/** placeId -> Google place resource id ("" = looked up, nothing found). */
const googleIdCache = new Map<string, string>();

export function wikimediaPhoto(placeId: string): PlacePhoto | null {
  const p = WIKIMEDIA_PHOTOS[placeId];
  if (!p) return null;
  return {
    source: "wikimedia",
    src: p.src,
    attribution: [{ text: `${p.author} · ${p.license}`, url: p.sourceUrl }],
    license: p.license,
    sourceUrl: p.sourceUrl,
  };
}

async function googleJson(url: string, key: string, init: RequestInit & { fieldMask?: string } = {}) {
  const { fieldMask, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "X-Goog-Api-Key": key,
      ...(fieldMask && { "X-Goog-FieldMask": fieldMask }),
      ...(headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  return res.json();
}

async function googlePlaceId(place: Place, key: string): Promise<string> {
  const cached = googleIdCache.get(place.id);
  if (cached !== undefined) return cached;
  const json = await googleJson(`${PLACES_BASE}/places:searchText`, key, {
    method: "POST",
    fieldMask: "places.id",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      textQuery: `${place.name.en} Nashik`,
      maxResultCount: 1,
      // Bias to our verified pin so a same-named place elsewhere never wins.
      locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 1500 } },
    }),
  });
  const id: string = json?.places?.[0]?.id ?? "";
  googleIdCache.set(place.id, id);
  return id;
}

/** Null when there is no key, no match, no photo, or any request fails. */
export async function googlePhoto(place: Place, maxWidthPx = 800): Promise<PlacePhoto | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  try {
    const googleId = await googlePlaceId(place, key);
    if (!googleId) return null;
    // Photo names expire, so they are fetched fresh rather than cached.
    const details = await googleJson(`${PLACES_BASE}/places/${googleId}`, key, { fieldMask: "photos" });
    const photo = details?.photos?.[0];
    if (!photo?.name) return null;
    // skipHttpRedirect returns a short-lived photoUri without our key in it.
    const media = await googleJson(
      `${PLACES_BASE}/${photo.name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
      key,
    );
    if (typeof media?.photoUri !== "string") return null;
    const authors: { text: string; url?: string }[] = (photo.authorAttributions ?? [])
      .filter((a: { displayName?: string }) => a.displayName)
      .map((a: { displayName: string; uri?: string }) => ({ text: a.displayName, url: a.uri }));
    return { source: "google", src: media.photoUri, attribution: [{ text: "Google Maps" }, ...authors] };
  } catch (error) {
    console.warn(`[place-photo] Google lookup failed for ${place.id}:`, (error as Error).message);
    return null;
  }
}
