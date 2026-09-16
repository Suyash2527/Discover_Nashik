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
