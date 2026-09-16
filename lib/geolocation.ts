"use client";
// The pilgrim's own position, cached and shared.
//
// Why this exists: AskRequest has carried optional lat/lng since the contract
// was written, /api/ask has always turned them into an `origin`, and
// answerOffline() has always re-ranked by haversine and said "about 1.2 km
// away". None of it ever ran, because nothing in the app called
// navigator.geolocation — so "how far is Ramkund" could only ever be answered
// with a description, never a distance.
//
// Everything here is best-effort and never throws. A pilgrim who refuses the
// permission prompt, or is standing under a temple roof with no fix, must still
// get an answer — just one without a distance in it, exactly as before.
import { useCallback, useEffect, useState } from "react";
import type { LatLng } from "./geo";

/**
 * How long a fix stays good enough to reuse.
 *
 * Ninety seconds: someone walking the ghats covers ~100 m in that time, which
 * is inside the error of a phone GPS fix in a dense crowd anyway. Long enough
 * that a burst of questions costs one fix, short enough that walking from
 * Panchavati to Ramkund is not answered from where they started.
 */
const MAX_AGE_MS = 90_000;

/**
 * Budget for a cold fix, started on the mic tap.
 *
 * Generous, because it runs in the background while the pilgrim is still
 * speaking — it is not on the answer's critical path. A first GPS fix on a
 * mid-range Android in a crowd routinely takes 3-6 s.
 */
const WARM_TIMEOUT_MS = 8000;

/**
 * How long ask() will actually wait for a fix before giving up and sending the
 * question without coordinates.
 *
 * Deliberately tiny. CONTEXT.md caps a voice answer at 3 s end to end and
 * app/api/ask already spends 2.5 s of it on Gemini, so there is no room here.
 * This is a grab at whatever warmUserPosition() has already resolved, not a
 * wait for the satellites.
 */
const ASK_WAIT_MS = 250;

interface CachedFix { position: LatLng; at: number }

let cached: CachedFix | null = null;
/** Shared so a warm-up and an ask() never start two fixes. */
let inFlight: Promise<LatLng | null> | null = null;
/**
 * Set once the pilgrim says no. The browser would keep answering instantly with
 * the same denial, but re-asking also re-triggers the permission UI on some
 * Android builds, and pestering someone mid-pilgrimage is worse than a missing
 * distance.
 */
let denied = false;

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function fresh(): LatLng | null {
  if (!cached) return null;
  return Date.now() - cached.at <= MAX_AGE_MS ? cached.position : null;
}

/** Resolve to null after `ms`, so a caller can bound its own wait. */
function timeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function requestFix(): Promise<LatLng | null> {
  inFlight ??= new Promise<LatLng | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        cached = { position: { lat: coords.latitude, lng: coords.longitude }, at: Date.now() };
        resolve(cached.position);
      },
      (error) => {
        // PERMISSION_DENIED === 1. The other codes (unavailable, timeout) are
        // transient — worth retrying on the next question.
        if (error.code === 1) denied = true;
        console.info(`[geo] no position (${error.code}: ${error.message})`);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: WARM_TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }).finally(() => {
    inFlight = null;
  }) as Promise<LatLng | null>;

  return inFlight;
}

/**
 * Start acquiring a fix without waiting for it.
 *
 * Call this from the mic tap. Two reasons it belongs on the gesture and not on
 * mount: a permission prompt that appears because the pilgrim just pressed
 * something is comprehensible, one that appears on page load is not; and the
 * 3-6 s the fix takes then overlaps the time they spend speaking, so by the
 * time the transcript is final the answer is already free.
 */
export function warmUserPosition(): void {
  if (!isSupported() || denied || fresh()) return;
  void requestFix();
}

/**
 * The pilgrim's position, or null if we do not have one cheaply.
 *
 * Returns a cached fix instantly. Otherwise it grabs at whatever warmUserPosition()
 * already has in flight for ASK_WAIT_MS and then gives up — null here is a
 * completely normal outcome and simply means the answer carries no distance.
 */
export async function getUserPosition(): Promise<LatLng | null> {
  const known = fresh();
  if (known) return known;
  if (!isSupported() || denied) return null;

  return (await timeout(requestFix(), ASK_WAIT_MS)) ?? null;
}

/** The last fix we took, however old, with no new request. For map centring. */
export function lastKnownPosition(): LatLng | null {
  return cached?.position ?? null;
}

/** Test seam — resets the module's cache and denial latch. */
export function __resetPositionCache(): void {
  cached = null;
  inFlight = null;
  denied = false;
}

/**
 * React binding for the same shared fix, for the map to place a "you are here"
 * marker and to draw toward a destination.
 *
 * Reads the module cache on mount, so a component that appears after the mic
 * has already been used shows the position immediately instead of prompting
 * again. `request()` is for a user gesture ("locate me"); the hook never
 * prompts on its own, because an unexplained permission dialog on page load is
 * the fastest way to get a permanent denial.
 */
export function useUserPosition(): {
  position: LatLng | null;
  requested: boolean;
  request: () => void;
} {
  const [position, setPosition] = useState<LatLng | null>(() => lastKnownPosition());
  const [requested, setRequested] = useState(false);

  const request = useCallback(() => {
    setRequested(true);
    void getUserPosition().then((fix) => {
      if (fix) setPosition(fix);
    });
  }, []);

  // Pick up a fix acquired elsewhere (the mic tap) without asking again.
  useEffect(() => {
    if (position) return;
    const known = lastKnownPosition();
    if (known) setPosition(known);
  }, [position]);

  return { position, requested, request };
}
