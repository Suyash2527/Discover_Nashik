"use client";
// Directions state for one place: location fix -> POST /api/route -> route,
// or, offline / on any failure, a straight-line "Head this way" fallback
// computed locally (lib/geo) so it works with no network at all.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { bearingDeg, haversineKm, type LatLng } from "@/lib/geo";

export type TravelMode = "walk" | "drive";

export interface RouteStep {
  instruction: string;
  maneuver?: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceText?: string;
  durationText?: string;
}

export interface Route {
  mode: TravelMode;
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceText?: string;
  durationText?: string;
  steps: RouteStep[];
}

export interface StraightLine { distanceMeters: number; bearingDeg: number }

export type DirectionsStatus = "locating" | "loading" | "route" | "fallback" | "no-location";

export interface Directions {
  status: DirectionsStatus;
  mode: TravelMode;
  setMode: (m: TravelMode) => void;
  route: Route | null;
  straightLine: StraightLine | null;
  origin: LatLng | null;
  retry: () => void;
}

function locate(): Promise<LatLng | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    ),
  );
}

const localLine = (from: LatLng, to: LatLng): StraightLine => ({
  distanceMeters: Math.round(haversineKm(from, to) * 1000),
  bearingDeg: Math.round(bearingDeg(from, to)),
});

interface Result { key: string; status: DirectionsStatus; route: Route | null; line: StraightLine | null; origin: LatLng | null }

export function useDirections(place: Place | null, lang: Lang, knownPos: LatLng | null, onLocated?: (p: LatLng) => void): Directions {
  // Mode belongs to one place: opening another place starts on foot again.
  const [modeFor, setModeFor] = useState<{ placeId: string; mode: TravelMode }>({ placeId: "", mode: "walk" });
  const mode: TravelMode = place && modeFor.placeId === place.id ? modeFor.mode : "walk";
  const setMode = useCallback((m: TravelMode) => setModeFor({ placeId: place?.id ?? "", mode: m }), [place?.id]);

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // Latest values without re-running the request when the pilgrim moves a little.
  const posRef = useRef(knownPos);
  const onLocatedRef = useRef(onLocated);
  useEffect(() => { posRef.current = knownPos; onLocatedRef.current = onLocated; });

  const key = place ? `${place.id}|${mode}|${lang}|${attempt}` : "";
  const [phase, setPhase] = useState<{ key: string; status: "locating" | "loading" }>({ key: "", status: "locating" });

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const controller = new AbortController();
    const done = (r: Omit<Result, "key">) => { if (!cancelled) setResult({ key, ...r }); };

    (async () => {
      let from = posRef.current;
      if (!from) {
        from = await locate();
        if (cancelled) return;
        if (from) onLocatedRef.current?.(from);
      }
      if (!from) return done({ status: "no-location", route: null, line: null, origin: null });
      const line = localLine(from, place);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return done({ status: "fallback", route: null, line, origin: from });
      }
      setPhase({ key, status: "loading" });
      try {
        const res = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: from, placeId: place.id, mode, lang }),
          signal: controller.signal,
        });
        const json = await res.json().catch(() => null);
        const serverLine: StraightLine = json?.straightLine ?? line;
        if (res.ok && json?.route) done({ status: "route", route: json.route, line: serverLine, origin: from });
        else done({ status: "fallback", route: null, line: serverLine, origin: from });
      } catch {
        done({ status: "fallback", route: null, line, origin: from });
      }
    })();

    return () => { cancelled = true; controller.abort(); };
    // key already encodes place, mode, lang and attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = result && result.key === key ? result : null;
  const status: DirectionsStatus = current?.status ?? (phase.key === key ? phase.status : knownPos ? "loading" : "locating");
  return {
    status,
    mode,
    setMode,
    route: current?.route ?? null,
    straightLine: current?.line ?? null,
    origin: current?.origin ?? null,
    retry,
  };
}

// ─── Compass ────────────────────────────────────────────────────────────────

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Device heading in degrees clockwise from north, or null when the device has
 * no compass (desktop) or the pilgrim has not granted it (iOS).
 */
export function useHeading(enabled: boolean): { heading: number | null; needsPermission: boolean; requestPermission: () => void } {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(false);
  const needsPermission =
    typeof window !== "undefined" &&
    typeof (window.DeviceOrientationEvent as unknown as PermissionCtor | undefined)?.requestPermission === "function" &&
    !granted;

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || needsPermission) return;
    const onAbsolute = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) setHeading((360 - e.alpha) % 360);
    };
    const onRelative = (e: OrientationEvent) => {
      if (typeof e.webkitCompassHeading === "number") setHeading(e.webkitCompassHeading);
      else if (e.absolute && e.alpha !== null) setHeading((360 - e.alpha) % 360);
    };
    window.addEventListener("deviceorientationabsolute", onAbsolute as EventListener);
    window.addEventListener("deviceorientation", onRelative as EventListener);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onAbsolute as EventListener);
      window.removeEventListener("deviceorientation", onRelative as EventListener);
    };
  }, [enabled, needsPermission]);

  const requestPermission = useCallback(() => {
    const ctor = window.DeviceOrientationEvent as unknown as PermissionCtor;
    void ctor.requestPermission?.().then((r) => setGranted(r === "granted")).catch(() => {});
  }, []);

  return { heading, needsPermission, requestPermission };
}
