"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Place, CATEGORIES, Category } from "@/types/place";
import type { Lang } from "@/types/voice";
import { useVoiceAssistant } from "@/lib/voice";
import { formatDistanceKm, haversineKm, type LatLng } from "@/lib/geo";
import { CategoryIcon, categoryColor, SearchIcon, LocateIcon, XIcon } from "./icons";
import { CATEGORY_LABEL, LANGS, loc, pick, placeName } from "./copy";
import VoicePanel from "./VoicePanel";
import MicFab from "./MicFab";
import PlaceSheet from "./PlaceSheet";
import SosSheet from "./SosSheet";
import HintOverlay from "./HintOverlay";
import AdvisoryBanner, { SEVERITY_COLOR, useActiveAdvisories } from "./AdvisoryBanner";
import type { Severity } from "@/types/advisory";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
const NASHIK_CENTER = { lat: 20.0059, lng: 73.791 };

// ─── Map pieces ────────────────────────────────────────────────────────────
function Pin({ category, active, alert }: { category: Category; active: boolean; alert?: Severity }) {
  const size = active ? 40 : 28;
  return (
    <div
      className="relative flex items-center justify-center rounded-full text-white transition-all duration-150"
      style={{
        width: size,
        height: size,
        backgroundColor: categoryColor(category),
        border: `2px solid ${active ? "#1D1915" : "#FBF8F2"}`,
        boxShadow: active ? "0 0 0 3px #FBF8F2, 0 4px 10px rgba(29,25,21,.35)" : "0 1px 3px rgba(29,25,21,.35)",
        transform: "translate(0, 50%)",
      }}
    >
      <CategoryIcon category={category} size={active ? 21 : 15} />
      {alert && (
        <span
          aria-label={`advisory: ${alert}`}
          className="absolute -top-2 -right-2 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white text-[11px] leading-none font-bold text-white shadow"
          style={{ backgroundColor: SEVERITY_COLOR[alert] }}
        >
          !
        </span>
      )}
    </div>
  );
}

function MapController({ focus, places, userPos, onReady, results, resultsKey }: {
  focus: string[]; places: Place[]; userPos: LatLng | null; onReady: () => void;
  /** Places matching the active filter/search; the map zooms to show them. */
  results: Place[]; resultsKey: string;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !resultsKey || results.length === 0) return;
    // Wait for typing to settle before moving the map.
    const t = setTimeout(() => {
      if (results.length === 1) { map.panTo(results[0]); map.setZoom(16); return; }
      const b = new google.maps.LatLngBounds();
      results.forEach((p) => b.extend(p));
      map.fitBounds(b, 48);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, resultsKey]);

  useEffect(() => {
    if (!map) return;
    onReady();
    // Open on the city core. Fitting every place pulls in Trimbakeshwar (~30 km)
    // and collapses the Panchavati pins into one unreadable clump.
    const b = new google.maps.LatLngBounds();
    places.filter((p) => haversineKm(NASHIK_CENTER, p) <= 6).forEach((p) => b.extend(p));
    if (b.isEmpty()) map.setCenter(NASHIK_CENTER);
    else map.fitBounds(b, 32);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    if (!map || focus.length === 0) return;
    const targets = places.filter((p) => focus.includes(p.id));
    if (targets.length === 1) {
      map.panTo(targets[0]);
      map.setZoom(16);
    } else if (targets.length > 1) {
      const b = new google.maps.LatLngBounds();
      targets.forEach((p) => b.extend(p));
      map.fitBounds(b, 60);
    }
  }, [focus, map, places]);

  useEffect(() => {
    if (!map || !userPos) return;
    map.panTo(userPos);
    map.setZoom(15);
  }, [userPos, map]);

  return null;
}

const FILTER_ORDER: Category[] = ["transport", ...CATEGORIES.filter((c) => c !== "transport")];

/** Words that find a whole category from the search box ("bus", "train", "auto", "दवाई"…). */
const CATEGORY_WORDS: Partial<Record<Category, string[]>> = {
  transport: ["bus", "stop", "stand", "station", "railway", "train", "rail", "airport", "flight", "auto", "rickshaw", "taxi", "depot", "citilinc", "st", "बस", "स्टेशन", "रेलवे", "रेल्वे", "ट्रेन", "रिक्षा", "रिक्शा", "ऑटो", "विमानतळ", "हवाई"],
  hospital: ["hospital", "doctor", "clinic", "अस्पताल", "रुग्णालय", "दवाखाना"],
  police:   ["police", "पुलिस", "पोलीस"],
  toilet:   ["toilet", "washroom", "bathroom", "शौचालय"],
  water:    ["water", "पानी", "पाणी"],
  chemist:  ["chemist", "medical", "pharmacy", "medicine", "दवाई", "औषध"],
  food:     ["food", "restaurant", "eat", "भोजन", "जेवण"],
  stay:     ["hotel", "stay", "lodge", "room", "dharamshala", "होटल", "हॉटेल"],
  parking:  ["parking", "पार्किंग", "वाहनतळ"],
  temple:   ["temple", "mandir", "मंदिर"],
  ghat:     ["ghat", "kund", "घाट", "कुंड"],
};

/** Every word the user typed must match the place somewhere, so "nashik road station" works. */
function matchesQuery(p: Place, q: string): boolean {
  const hay = [p.name.en, p.name.hi, p.name.mr, p.area, ...p.aliases].join(" ").toLowerCase();
  const catWords = CATEGORY_WORDS[p.category] ?? [];
  return q.split(/\s+/).every((w) => hay.includes(w) || catWords.some((c) => c.startsWith(w) && w.length >= 2));
}

/**
 * How well a place answers the query, higher first: the words in its own name beat
 * the words only in its aliases, which beat a bare category hit ("stop" → any transport).
 */
function matchScore(p: Place, q: string): number {
  const words = q.split(/\s+/).filter(Boolean);
  const name = [p.name.en, p.name.hi, p.name.mr].join(" ").toLowerCase();
  const text = [name, p.area, ...p.aliases].join(" ").toLowerCase();
  const catWords = CATEGORY_WORDS[p.category] ?? [];
  let score = 0;
  for (const w of words) {
    if (name.includes(w)) score += 10;
    else if (text.includes(w)) score += 4;
    else score += 1;
  }
  // The query names this kind of place ("station" → transport, not a toilet *at* the station).
  if (words.some((w) => w.length >= 3 && catWords.some((c) => c.startsWith(w)))) score += 25;
  if (p.name.en.toLowerCase().startsWith(words[0] ?? "")) score += 15;
  // Among equals, the shorter (more specific) name wins.
  return score - p.name.en.length / 10;
}

/** City bus stops are many and small: only show them when the user is looking for transport. */
const isMinorStop = (p: Place) => p.id.startsWith("bus-stop-");

// ─── Chrome ────────────────────────────────────────────────────────────────
function Masthead({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex items-end justify-between px-4 pt-3 md:px-5 md:pt-5">
      <div className="leading-none">
        <p className="kicker">{pick(lang, "Kumbh guide", "कुंभ गाइड", "कुंभ मार्गदर्शक")}</p>
        <h1 className="font-display text-[28px] leading-[1.05] md:text-[34px]">
          {pick(lang, "Nashik", "नासिक", "नाशिक")}
        </h1>
      </div>
      <nav className="flex gap-3 pb-1 text-[14px]" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={lang === l.code}
            className={`pb-0.5 ${lang === l.code ? "border-b-2 border-ink font-semibold text-ink" : "text-muted"}`}
          >
            {l.code === "en-IN" ? "EN" : l.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SearchField({ value, onChange, onSubmit, lang }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; lang: Lang;
}) {
  return (
    <form
      className="mx-4 mt-3 flex h-12 items-center gap-2 rounded-md border border-rule bg-card px-3 focus-within:border-ink md:mx-5"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      role="search"
    >
      <SearchIcon size={18} className="shrink-0 text-muted" />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={pick(lang, "Ramkund, toilet, chemist…", "रामकुंड, शौचालय, दवाई…", "रामकुंड, शौचालय, औषध…")}
        className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear" className="text-muted">
          <XIcon size={18} />
        </button>
      )}
    </form>
  );
}

function Filters({ selected, onToggle, lang }: {
  selected: Set<Category>; onToggle: (c: Category) => void; lang: Lang;
}) {
  return (
    <div className="hide-scrollbar mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3 md:flex-wrap md:px-5">
      {FILTER_ORDER.map((c) => {
        const on = selected.has(c);
        return (
          <button
            key={c}
            onClick={() => onToggle(c)}
            aria-pressed={on}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border pr-3.5 pl-1.5 text-[15px] font-medium transition-colors ${
              on ? "border-ink bg-ink text-paper" : "border-rule bg-card text-ink"
            }`}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: categoryColor(c) }}
            >
              <CategoryIcon category={c} size={14} />
            </span>
            {loc(lang, CATEGORY_LABEL[c])}
          </button>
        );
      })}
    </div>
  );
}

function Dock({ lang, voice, onSOS, onNearMe, locating }: {
  lang: Lang; voice: ReturnType<typeof useVoiceAssistant>; onSOS: () => void; onNearMe: () => void; locating: boolean;
}) {
  return (
    <div className="grid grid-cols-3 items-end border-t border-rule bg-paper px-4 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]">
      <button onClick={onSOS} className="flex flex-col items-center gap-1 justify-self-start" aria-label="SOS">
        <span className="flex h-11 w-[68px] items-center justify-center rounded-full border-2 border-kumkum text-[16px] font-bold tracking-wider text-kumkum active:bg-kumkum active:text-paper">
          SOS
        </span>
        <span className="text-[13px] text-ink-2">{pick(lang, "Help", "मदद", "मदत")}</span>
      </button>

      <div className="justify-self-center">
        <MicFab lang={lang} state={voice.state} onStart={voice.start} onStop={voice.stop} />
      </div>

      <button onClick={onNearMe} className="flex flex-col items-center gap-1 justify-self-end">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full border border-ink ${locating ? "animate-pulse" : ""}`}>
          <LocateIcon size={20} />
        </span>
        <span className="text-[13px] text-ink-2">{pick(lang, "Near me", "पास में", "जवळ")}</span>
      </button>
    </div>
  );
}

function PlaceList({ places, userPos, lang, onSelect, ranked = false }: {
  places: Place[]; userPos: LatLng | null; lang: Lang; onSelect: (p: Place) => void;
  /** Places are already in best-match order: keep it rather than sorting by distance. */
  ranked?: boolean;
}) {
  const rows = useMemo(() => {
    const withKm = places.map((p) => ({ p, km: userPos ? haversineKm(userPos, p) : null }));
    if (userPos && !ranked) withKm.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
    return withKm.slice(0, 60);
  }, [places, userPos, ranked]);

  return (
    <div>
      <p className="kicker px-5 pt-4 pb-2">
        <span className="tnum">{places.length}</span> {pick(lang, "places", "जगहें", "ठिकाणं")}
        {userPos ? ` · ${pick(lang, "nearest first", "नज़दीकी पहले", "जवळचे आधी")}` : ""}
      </p>
      <ul className="border-t border-rule">
        {rows.map(({ p, km }) => (
          <li key={p.id} className="border-b border-rule">
            <button onClick={() => onSelect(p)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-paper-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryColor(p.category) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium">{placeName(lang, p)}</span>
                <span className="block truncate text-[13px] text-muted">{p.area}</span>
              </span>
              {km !== null && (
                <span className="tnum shrink-0 text-[13px] text-ink-2">
                  {formatDistanceKm(km).value} {formatDistanceKm(km).unit}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────
export default function MapClient({ places }: { places: Place[] }) {
  // One voice instance for the whole screen: the mic and the answer panel must share state.
  const voice = useVoiceAssistant();
  const advisories = useActiveAdvisories();
  // Most severe advisory per place (list is already sorted closed → warning → info).
  const alertByPlace = useMemo(() => {
    const m = new globalThis.Map<string, Severity>();
    for (const a of advisories) if (a.placeId && !m.has(a.placeId)) m.set(a.placeId, a.severity);
    return m;
  }, [advisories]);
  const [lang, setLangState] = useState<Lang>("en-IN");
  const [filters, setFilters] = useState<Set<Category>>(new Set());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Place | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  // The answer the pilgrim closed; a new answer (or a new question) shows the panel again.
  const [dismissedAnswer, setDismissedAnswer] = useState<string | null>(null);

  const setLang = useCallback((l: Lang) => { setLangState(l); voice.setLang(l); }, [voice]);
  const focus = useMemo(() => (selected ? [selected.id] : voice.placeIds), [selected, voice.placeIds]);
  const voiceHidden = voice.state === "idle" && voice.answer !== "" && voice.answer === dismissedAnswer;

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    return places.filter((p) => {
      if (focus.includes(p.id)) return true;
      if (filters.size && !filters.has(p.category)) return false;
      if (!q) return filters.has("transport") || !isMinorStop(p);
      return matchesQuery(p, q);
    });
  }, [places, filters, search, focus]);

  // For the results list: best match first while searching.
  const ranked = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return visible;
    return visible
      .map((p) => ({ p, s: matchScore(p, q) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
  }, [visible, search]);

  // The user is looking for something (filter or search) rather than just viewing the map.
  const browsing = filters.size > 0 || search.trim() !== "";

  const toggleFilter = useCallback((c: Category) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const nearMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const select = useCallback((p: Place) => setSelected(p), []);

  // Typed question: if nothing matches locally, hand it to the assistant.
  const submitSearch = useCallback(() => {
    const q = search.trim();
    if (!q) return;
    if (visible.length === 1) select(visible[0]);
    else if (visible.length === 0) void voice.ask(q);
  }, [search, visible, select, voice]);

  const voicePanel = (variant: "float" | "inline") =>
    voiceHidden ? null : (
      <VoicePanel
        variant={variant}
        voice={voice}
        places={places}
        lang={lang}
        onSelectPlace={select}
        onDismiss={() => setDismissedAnswer(voice.answer)}
      />
    );

  return (
    <>
      <HintOverlay />

      <div
        className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] [grid-template-areas:'top'_'map'_'dock'] md:grid-cols-[400px_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)_auto] md:[grid-template-areas:'top_map'_'rail_map'_'dock_map']"
      >
        <header className="z-10 border-b border-rule bg-paper [grid-area:top]">
          <Masthead lang={lang} setLang={setLang} />
          <SearchField value={search} onChange={setSearch} onSubmit={submitSearch} lang={lang} />
          <Filters selected={filters} onToggle={toggleFilter} lang={lang} />
        </header>

        {/* Desktop rail */}
        <aside className="hidden min-h-0 overflow-y-auto border-r border-rule bg-paper [grid-area:rail] md:block">
          {voicePanel("inline")}
          {selected ? (
            <div className="border-b border-rule">
              <PlaceSheet place={selected} lang={lang} userPos={userPos} onClose={() => setSelected(null)} />
            </div>
          ) : (
            <PlaceList places={ranked} ranked={search.trim() !== ""} userPos={userPos} lang={lang} onSelect={select} />
          )}
        </aside>

        <main className="relative min-h-0 [grid-area:map]">
          {!mapReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-2">
              <p className="kicker">{pick(lang, "Loading map", "नक्शा खुल रहा है", "नकाशा उघडत आहे")}</p>
            </div>
          )}

          <APIProvider apiKey={API_KEY}>
            <Map
              defaultCenter={NASHIK_CENTER}
              defaultZoom={13}
              mapId={MAP_ID}
              disableDefaultUI
              clickableIcons={false}
              gestureHandling="greedy"
              style={{ width: "100%", height: "100%" }}
              onClick={() => setSelected(null)}
            >
              <MapController
                focus={focus}
                places={places}
                userPos={userPos}
                onReady={() => setMapReady(true)}
                results={visible}
                resultsKey={browsing ? `${[...filters].join(",")}|${search.trim().toLowerCase()}` : ""}
              />
              {visible.map((p) => (
                <AdvancedMarker
                  key={p.id}
                  position={p}
                  title={placeName(lang, p)}
                  zIndex={focus.includes(p.id) ? 10 : alertByPlace.has(p.id) ? 5 : 1}
                  onClick={() => select(p)}
                >
                  <Pin category={p.category} active={focus.includes(p.id)} alert={alertByPlace.get(p.id)} />
                </AdvancedMarker>
              ))}
              {userPos && (
                <AdvancedMarker position={userPos} zIndex={20}>
                  <div className="user-dot h-4 w-4 translate-y-1/2 rounded-full border-2 border-white bg-river" />
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>

          {/* Phone overlays */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 md:hidden">
            {!selected && browsing && visible.length > 0 && voice.state === "idle" && !voice.answer && (
              <div className="rise pointer-events-auto max-h-[34dvh] overflow-y-auto rounded-t-xl border-t border-rule bg-paper shadow-[0_-8px_24px_-16px_rgba(29,25,21,.5)]">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule" />
                <PlaceList places={ranked} ranked={search.trim() !== ""} userPos={userPos} lang={lang} onSelect={select} />
              </div>
            )}
            {!selected && <div className="pointer-events-auto pb-3">{voicePanel("float")}</div>}
            {selected && (
              <div className="pointer-events-auto max-h-[72dvh] overflow-y-auto rounded-t-xl border-t border-rule shadow-[0_-8px_24px_-16px_rgba(29,25,21,.5)]">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule" />
                <PlaceSheet place={selected} lang={lang} userPos={userPos} onClose={() => setSelected(null)} />
              </div>
            )}
          </div>

          {!(search && visible.length === 0) && (
            <AdvisoryBanner advisories={advisories} places={places} lang={lang} onSelectPlace={select} />
          )}

          {search && visible.length === 0 && (
            <div className="absolute inset-x-3 top-3 z-20 rounded-md border border-rule bg-card px-4 py-3 text-[15px]">
              {pick(lang, "No place by that name. Press Enter to ask the guide.", "इस नाम की जगह नहीं मिली। Enter दबाकर पूछें।", "या नावाचं ठिकाण नाही. Enter दाबून विचारा.")}
            </div>
          )}
        </main>

        <footer className="z-10 [grid-area:dock] md:border-r md:border-rule">
          <Dock lang={lang} voice={voice} onSOS={() => setShowSOS(true)} onNearMe={nearMe} locating={locating} />
        </footer>
      </div>

      {showSOS && (
        <SosSheet lang={lang} places={places} userPos={userPos} onClose={() => setShowSOS(false)} onSelectPlace={select} />
      )}
    </>
  );
}
