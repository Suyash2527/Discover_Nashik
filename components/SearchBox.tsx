"use client";
// Header search: combobox with live suggestions.
//
//   empty + focused  -> recent searches + popular places
//   typing           -> best 6 matches (name highlighted, area, distance)
//                       + "Ask the guide" row that sends the text to the assistant
//   keys             -> ↑ ↓ move, Enter picks (or asks), Esc closes
//
// Matching/ranking is passed in (MapClient owns it) so the list and the map agree.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { formatDistanceKm, haversineKm, type LatLng } from "@/lib/geo";
import { CategoryIcon, categoryColor, MicIcon, SearchIcon, SpeakerIcon, XIcon } from "./icons";
import { CATEGORY_LABEL, loc, pick } from "./copy";

const RECENT_KEY = "dn-recent-places";
const POPULAR = ["ramkund", "trimbakeshwar-temple", "kalaram-mandir", "nashik-road-railway-station", "panchavati"];

const EXAMPLES: Record<Lang, string[]> = {
  "en-IN": ["Ramkund", "nearest toilet", "Kalaram Mandir", "bus stand", "hospital"],
  "hi-IN": ["रामकुंड", "शौचालय", "कालाराम मंदिर", "बस स्टैंड", "अस्पताल"],
  "mr-IN": ["रामकुंड", "शौचालय", "काळाराम मंदिर", "बस स्थानक", "रुग्णालय"],
};

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 5); } catch { return []; }
}
function writeRecent(ids: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 5))); } catch { /* storage blocked */ }
}

/** Bold the first place the query appears in the label. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="search-hl">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  lang: Lang;
  places: Place[];
  /** Ranked matches for `value` (best first). */
  matches: Place[];
  userPos: LatLng | null;
  onPick: (p: Place) => void;
  onAsk: (q: string) => void;
  onVoice: () => void;
}

type Row = { kind: "place"; place: Place; recent?: boolean } | { kind: "ask" };

export default function SearchBox({ value, onChange, lang, places, matches, userPos, onPick, onAsk, onVoice }: Props) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [example, setExample] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = value.trim();

  // Rotating example in the placeholder, only while it is visible.
  useEffect(() => {
    if (value || focused) return;
    const t = setInterval(() => setExample((i) => i + 1), 2600);
    return () => clearInterval(t);
  }, [value, focused]);

  // Close when tapping anywhere else (the map, the dock).
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [focused]);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);

  const rows: Row[] = useMemo(() => {
    if (!q) {
      const recentPlaces = recent.map((id) => byId.get(id)).filter(Boolean) as Place[];
      const popular = POPULAR.map((id) => byId.get(id)).filter((p): p is Place => !!p && !recent.includes(p.id));
      return [
        ...recentPlaces.map((place) => ({ kind: "place" as const, place, recent: true })),
        ...popular.slice(0, Math.max(0, 5 - recentPlaces.length)).map((place) => ({ kind: "place" as const, place })),
      ];
    }
    return [...matches.slice(0, 6).map((place) => ({ kind: "place" as const, place })), { kind: "ask" as const }];
  }, [q, matches, recent, byId]);

  const open = focused && rows.length > 0;
  const recentCount = rows.filter((r) => r.kind === "place" && r.recent).length;

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "ask") {
      if (q) onAsk(q);
    } else {
      const next = [row.place.id, ...readRecent().filter((id) => id !== row.place.id)];
      writeRecent(next);
      setRecent(next);
      onPick(row.place);
    }
    setFocused(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused(true); setActive((i) => (i + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? rows.length - 1 : i - 1)); }
    else if (e.key === "Escape") { setFocused(false); setActive(-1); inputRef.current?.blur(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // Enter with nothing highlighted: the top match if there is one, else ask.
      choose(active >= 0 ? rows[active] : rows[0]);
    }
  };

  const clearRecent = () => { writeRecent([]); setRecent([]); };
  const examples = EXAMPLES[lang];
  const hint = examples[example % examples.length];

  return (
    <div ref={boxRef} className="relative mx-4 mt-3 mb-4 md:mx-5">
      <div
        role="search"
        className={`relative flex h-[56px] items-center gap-2 rounded-2xl bg-card pr-1.5 pl-4 transition-[box-shadow,transform] duration-200 ${
          focused
            ? "shadow-[0_0_0_3px_var(--haldi),0_14px_30px_-12px_rgba(0,0,0,.55)]"
            : "shadow-[0_8px_22px_-10px_rgba(0,0,0,.5)]"
        }`}
      >
        <SearchIcon size={22} className={`shrink-0 transition-colors ${focused ? "text-haldi" : "text-maroon"}`} />
        <div className="relative h-full min-w-0 flex-1">
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-label={pick(lang, "Search places", "जगह खोजें", "ठिकाण शोधा")}
            value={value}
            onChange={(e) => { onChange(e.target.value); setActive(-1); setFocused(true); }}
            onFocus={() => { setFocused(true); setRecent(readRecent()); }}
            onKeyDown={onKeyDown}
            className="h-full w-full bg-transparent text-[18px] font-medium text-ink outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {!value && (
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden text-[18px] whitespace-nowrap text-muted">
              {focused ? (
                pick(lang, "Place, temple, service…", "जगह, मंदिर, सुविधा…", "ठिकाण, मंदिर, सुविधा…")
              ) : (
                <>
                  <span>{pick(lang, "Search", "खोजें", "शोधा")}&nbsp;</span>
                  <span key={hint} className="ph-in font-semibold text-ink-2">“{hint}”</span>
                </>
              )}
            </span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setActive(-1); inputRef.current?.focus(); }}
            aria-label={pick(lang, "Clear", "साफ़ करें", "पुसा")}
            className="scale-in press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink"
          >
            <XIcon size={17} />
          </button>
        )}
        <span className="h-7 w-px shrink-0 bg-rule" aria-hidden />
        <button
          type="button"
          onClick={() => { setFocused(false); onVoice(); }}
          aria-label={pick(lang, "Ask by voice", "बोलकर पूछें", "बोलून विचारा")}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-haldi hover:bg-paper active:bg-paper-2"
        >
          <MicIcon size={22} />
        </button>
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="pop-in absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(62dvh,460px)] overflow-y-auto rounded-2xl border border-rule bg-card py-1.5 shadow-[0_24px_48px_-20px_rgba(42,23,15,.6)]"
        >
          {!q && (
            <div className="flex items-center justify-between px-4 pt-1.5 pb-1">
              <p className="kicker">{recentCount ? pick(lang, "Recent", "हाल में देखा", "अलीकडे पाहिलेले") : pick(lang, "Popular places", "लोकप्रिय जगहें", "लोकप्रिय ठिकाणे")}</p>
              {recentCount > 0 && (
                <button onClick={clearRecent} className="text-[13px] font-semibold text-maroon">
                  {pick(lang, "Clear", "हटाएं", "पुसा")}
                </button>
              )}
            </div>
          )}
          {q && matches.length === 0 && (
            <p className="px-4 pt-2 pb-1 text-[15px] text-muted">
              {pick(lang, "No place by that name.", "इस नाम की कोई जगह नहीं।", "या नावाचं ठिकाण नाही.")}
            </p>
          )}
          {rows.map((row, i) => {
            const on = i === active;
            const common = {
              id: `${listId}-${i}`,
              role: "option" as const,
              "aria-selected": on,
              onPointerEnter: () => setActive(i),
              onClick: () => choose(row),
              style: { animationDelay: `${Math.min(i, 6) * 22}ms` },
            };
            if (row.kind === "ask") {
              return (
                <button key="ask" {...common} className={`item-in mx-1.5 mt-1 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl border-t border-rule px-2.5 py-2.5 text-left ${on ? "bg-paper-2" : ""}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-haldi text-white">
                    <SpeakerIcon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold tracking-wide text-muted uppercase">{pick(lang, "Ask the guide", "गाइड से पूछें", "मार्गदर्शकाला विचारा")}</span>
                    <span className="block truncate text-[17px] font-semibold text-ink">“{q}”</span>
                  </span>
                </button>
              );
            }
            const { place } = row;
            const dist = userPos ? formatDistanceKm(haversineKm(userPos, place)) : null;
            return (
              <button key={place.id} {...common} className={`item-in mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? "bg-paper-2" : ""}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: categoryColor(place.category) }}>
                  <CategoryIcon category={place.category} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] leading-tight font-semibold text-ink">
                    <Highlight text={loc(lang, place.name)} query={q} />
                  </span>
                  <span className="block truncate text-[14px] text-muted">
                    {loc(lang, CATEGORY_LABEL[place.category])} · {place.area}
                  </span>
                </span>
                {dist && <span className="tnum shrink-0 text-[14px] font-semibold text-ink-2">{dist.value} {dist.unit}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
