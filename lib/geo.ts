// Distance helpers. No network, no dependencies — safe offline.

export interface LatLng { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "300 m" / "1.2 km" — spoken-friendly, no trailing noise. */
export function formatDistanceKm(km: number): { value: number; unit: "km" | "m" } {
  if (km < 1) return { value: Math.max(10, Math.round((km * 1000) / 10) * 10), unit: "m" };
  return { value: Math.round(km * 10) / 10, unit: "km" };
}

/**
 * Initial great-circle bearing from `a` to `b`, in degrees clockwise from north.
 *
 * "Initial" matters over long distances, but at Nashik's scale (tens of km at
 * most) the rhumb and great-circle bearings differ by far less than the arrow
 * on a phone screen can show, so this is effectively just the direction.
 */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** The eight-point compass names, in bearing order from north. */
export const COMPASS_POINTS = [
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west",
] as const;

export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * Bearing -> "north-east".
 *
 * Eight points, not sixteen: this is spoken aloud to someone walking in a
 * crowd, and "north-north-east" is both a mouthful and a false precision given
 * that we are describing a straight line, not a route.
 */
export function compassPoint(bearing: number): CompassPoint {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[index];
}
