// GET /api/place-photo?id=<placeId> -> PlacePhoto | 204.
//
// Wikimedia photo if we have one (also served statically from /photos), else a
// live Google Places photo. 204 means "no photo": the UI shows the category
// icon. Google photo URLs are short-lived, so the response is only briefly
// cacheable and the service worker never stores it (it skips /api/).
import type { NextRequest } from "next/server";
import { googlePhoto, wikimediaPhoto } from "@/lib/place-photos";
import { PLACES } from "@/lib/rag";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const place = PLACES.find((p) => p.id === id);
  if (!place) return Response.json({ error: "Unknown place id" }, { status: 404 });

  const wiki = wikimediaPhoto(place.id);
  if (wiki) {
    return Response.json(wiki, { headers: { "Cache-Control": "public, max-age=86400" } });
  }

  const google = await googlePhoto(place);
  if (!google) return new Response(null, { status: 204, headers: { "Cache-Control": "private, max-age=300" } });
  return Response.json(google, { headers: { "Cache-Control": "private, max-age=600" } });
}
