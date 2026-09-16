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

function severityLabel(lang: Lang, s: Severity) {
  return s === "closed" ? pick(lang, "Closed", "बंद", "बंद")
    : s === "warning" ? pick(lang, "Warning", "चेतावनी", "इशारा")
    : pick(lang, "Notice", "सूचना", "सूचना");
}

/** Slim strip over the top of the map: most severe advisory first, tap "+N" to see the rest. */
export default function AdvisoryBanner({ advisories, places, lang, onSelectPlace }: {
  advisories: Advisory[]; places: Place[]; lang: Lang; onSelectPlace: (p: Place) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const shown = advisories.filter((a) => !dismissed.has(a.id));
  if (shown.length === 0) return null;
  const rows = expanded ? shown : shown.slice(0, 1);
  const more = shown.length - 1;

  return (
    <div className="absolute inset-x-2 top-2 z-20 overflow-hidden rounded-md border border-rule bg-card shadow-[0_6px_18px_-10px_rgba(29,25,21,.55)] md:inset-x-auto md:right-3 md:w-[380px]">
      {rows.map((a, i) => {
        const place = places.find((p) => p.id === a.placeId);
        const color = SEVERITY_COLOR[a.severity];
        return (
          <div key={a.id} role="alert" className={`flex items-center gap-2 py-1.5 pr-1 pl-2.5 ${i ? "border-t border-rule" : ""}`} style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
            <span className="shrink-0" style={{ color }}><AlertCircleIcon size={18} /></span>
            <button className="min-w-0 flex-1 text-left" onClick={() => place && onSelectPlace(place)} disabled={!place}>
              <span className="block truncate text-[15px] leading-tight font-semibold">{loc(lang, a.message)}</span>
              <span className="block truncate text-[12px] leading-tight text-muted">
                <span className="font-semibold uppercase" style={{ color }}>{severityLabel(lang, a.severity)}</span>
                {place ? ` · ${loc(lang, place.name)}` : ""} · {pick(lang, "until", "तक", "पर्यंत")} <span className="tnum">{fmtTime(a.endsAt)}</span>
              </span>
            </button>
            {i === 0 && more > 0 && (
              <button onClick={() => setExpanded((e) => !e)} className="tnum shrink-0 rounded-full border border-rule px-2 py-0.5 text-[13px] font-semibold" aria-expanded={expanded}>
                {expanded ? "–" : `+${more}`}
              </button>
            )}
            <button
              onClick={() => setDismissed((s) => new Set(s).add(a.id))}
              aria-label="Dismiss"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-paper-2"
            >
              <XIcon size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
