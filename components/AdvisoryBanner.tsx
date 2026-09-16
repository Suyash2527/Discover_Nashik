"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { Advisory, Severity } from "@/types/advisory";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { db, firebaseEnabled } from "@/lib/firebase";
import { AlertCircleIcon, XIcon } from "./icons";
import { loc, pick } from "./copy";

export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "var(--river)",
  warning: "var(--haldi)",
  closed: "var(--kumkum)",
};

const RANK: Record<Severity, number> = { closed: 0, warning: 1, info: 2 };

/**
 * Live list of advisories active right now. Firestore can only range-filter one
 * field, so the query drops expired ones and the client drops not-yet-started ones.
 * A minute tick re-evaluates the window without a new snapshot.
 */
export function useActiveAdvisories(): Advisory[] {
  const [all, setAll] = useState<Advisory[]>([]);
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const q = query(collection(db(), "advisories"), where("endsAt", ">", new Date().toISOString()));
    return onSnapshot(
      q,
      (snap) => setAll(snap.docs.map((d) => ({ ...(d.data() as Omit<Advisory, "id">), id: d.id }))),
      (err) => console.warn("advisories listener failed", err)
    );
  }, []);

  return useMemo(
    () =>
      all
        .filter((a) => a.startsAt <= now && a.endsAt > now)
        .sort((a, b) => RANK[a.severity] - RANK[b.severity]),
    [all, now]
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function AdvisoryBanner({ advisories, places, lang, onSelectPlace }: {
  advisories: Advisory[]; places: Place[]; lang: Lang; onSelectPlace: (p: Place) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const shown = advisories.filter((a) => !dismissed.has(a.id));
  if (shown.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-col gap-2 md:inset-x-auto md:right-4 md:w-[380px]">
      {shown.slice(0, 3).map((a) => {
        const place = places.find((p) => p.id === a.placeId);
        return (
          <div
            key={a.id}
            role="alert"
            className="rise pointer-events-auto flex items-start gap-3 rounded-md border-l-4 bg-card py-2.5 pr-2 pl-3 shadow-[0_4px_16px_-8px_rgba(29,25,21,.45)]"
            style={{ borderLeftColor: SEVERITY_COLOR[a.severity] }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: SEVERITY_COLOR[a.severity] }}>
              <AlertCircleIcon size={22} />
            </span>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => place && onSelectPlace(place)}
              disabled={!place}
            >
              <p className="kicker" style={{ color: SEVERITY_COLOR[a.severity] }}>
                {a.severity === "closed"
                  ? pick(lang, "Closed", "बंद", "बंद")
                  : a.severity === "warning"
                    ? pick(lang, "Warning", "चेतावनी", "इशारा")
                    : pick(lang, "Notice", "सूचना", "सूचना")}
                {place ? ` · ${loc(lang, place.name)}` : ""}
              </p>
              <p className="text-[16px] leading-snug font-medium">{loc(lang, a.message)}</p>
              <p className="tnum text-[13px] text-muted">
                {pick(lang, "Until", "तक", "पर्यंत")} {fmtTime(a.endsAt)}
              </p>
            </button>
            <button
              onClick={() => setDismissed((s) => new Set(s).add(a.id))}
              aria-label="Dismiss"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-paper-2"
            >
              <XIcon size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
