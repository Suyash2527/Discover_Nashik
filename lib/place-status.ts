// "Is it open now?" from Place.timings / open24x7, in Nashik time.
//
// Always evaluated in Asia/Kolkata, never the server's zone: Vercel runs in UTC,
// and a temple that closes at 21:00 IST would otherwise read as open until 02:30.
import type { Place } from "@/types";

export type OpenStatus = "open" | "closed" | "unknown";

/** Minutes since midnight, and a readable stamp, for `now` in IST. */
export function istClock(now: Date = new Date()): { minutes: number; label: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return {
    minutes,
    label: `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} IST`,
  };
}

const RANGE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g;

/**
 * Open/closed from a timings string like "05:00-21:00" or
 * "06:00-12:00, 16:00-21:00". Ranges past midnight ("20:00-02:00") wrap.
 * Anything we cannot parse is "unknown" — never guess a temple is open.
 */
export function openStatus(place: Place, now: Date = new Date()): OpenStatus {
  if (place.open24x7) return "open";
  if (!place.timings) return "unknown";

  const { minutes } = istClock(now);
  let sawRange = false;
  for (const m of place.timings.matchAll(RANGE)) {
    sawRange = true;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    const inside = start <= end
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end;
    if (inside) return "open";
  }
  return sawRange ? "closed" : "unknown";
}
