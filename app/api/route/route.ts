// POST /api/route — directions from the pilgrim to one of our places.
//
//   body: { origin: { lat, lng }, placeId, mode?: "walk" | "drive", lang?: "en-IN" | "hi-IN" | "mr-IN" }
//   200:  { placeId, destination, route: RouteResult, straightLine }
//   503:  { error, placeId, destination, straightLine }   (no key / Google failed / timeout)
//
// straightLine is always present so the UI can fall back to a "Head this way"
// compass arrow without a second request.
import type { NextRequest } from "next/server";
import { computeRoute, parseMode, straightLine } from "@/lib/directions";
import { PLACES } from "@/lib/rag";

function coord(v: unknown, limit: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : undefined;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be valid JSON" }, { status: 400 });
  }
  const origin = (body?.origin ?? {}) as Record<string, unknown>;
  const lat = coord(origin.lat, 90);
  const lng = coord(origin.lng, 180);
  const place = PLACES.find((p) => p.id === body?.placeId);
  if (lat === undefined || lng === undefined || !place) {
    return Response.json(
      { error: "Expected { origin: { lat, lng }, placeId, mode?: 'walk'|'drive', lang? }" },
      { status: 400 },
    );
  }

  const from = { lat, lng };
  const destination = { lat: place.lat, lng: place.lng };
  const base = { placeId: place.id, destination, straightLine: straightLine(from, destination) };
  const lang = typeof body.lang === "string" ? body.lang : undefined;

  try {
    const route = await computeRoute(from, destination, parseMode(body.mode), lang);
    return Response.json({ ...base, route });
  } catch (error) {
    console.warn("[api/route] directions unavailable:", (error as Error).message);
    return Response.json({ ...base, error: "Directions unavailable" }, { status: 503 });
  }
}
