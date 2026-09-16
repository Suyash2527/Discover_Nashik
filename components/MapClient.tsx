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
import DirectionsCard from "./DirectionsCard";
import RouteLine from "./RouteLine";
import { useDirections } from "./useDirections";
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
    <div className="flex items-center justify-between px-4 pt-3 md:px-5 md:pt-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-haldi font-display text-[24px] leading-none text-white shadow-[0_0_0_3px_rgba(255,255,255,.18)]" aria-hidden>
          ॐ
        </span>
        <div className="leading-none">
          <p className="text-[12px] font-bold tracking-[0.14em] text-white/75 uppercase">
            {pick(lang, "Kumbh guide", "कुंभ गाइड", "कुंभ मार्गदर्शक")}
          </p>
          <h1 className="font-display text-[26px] leading-[1.1] text-white md:text-[30px]">
            {pick(lang, "Nashik", "नासिक", "नाशिक")}
          </h1>
        </div>
      </div>
      <nav className="flex rounded-full bg-black/20 p-1 text-[15px]" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            aria-pressed={lang === l.code}
            className={`h-9 rounded-full px-3 font-semibold transition-colors ${lang === l.code ? "bg-white text-maroon" : "text-white/85"}`}
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
      className="mx-4 mt-3 mb-4 flex h-[54px] items-center gap-2.5 rounded-xl bg-card px-4 shadow-[0_6px_18px_-8px_rgba(0,0,0,.45)] focus-within:ring-3 focus-within:ring-haldi md:mx-5"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      role="search"
    >
      <SearchIcon size={22} className="shrink-0 text-maroon" />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={pick(lang, "Where do you want to go?", "कहाँ जाना है?", "कुठे जायचं आहे?")}
        className="h-full min-w-0 flex-1 bg-transparent text-[18px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear" className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-2 text-ink">
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
    <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5 md:flex-wrap md:px-5">
      {FILTER_ORDER.map((c) => {
        const on = selected.has(c);
        return (
          <button
            key={c}
            onClick={() => onToggle(c)}
            aria-pressed={on}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-full border-2 pr-4 pl-1.5 text-[16px] font-semibold transition-colors ${
              on ? "border-haldi bg-haldi text-white" : "border-rule bg-card text-ink"
            }`}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: on ? "rgba(0,0,0,.18)" : categoryColor(c) }}
            >
              <CategoryIcon category={c} size={17} />
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
    <div className="grid grid-cols-3 items-end bg-card px-5 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-12px_rgba(42,23,15,.35)]">
      <button onClick={onSOS} className="flex flex-col items-center gap-1 justify-self-start" aria-label="SOS">
        <span className="flex h-12 w-[76px] items-center justify-center rounded-full bg-kumkum text-[18px] font-bold tracking-wider text-white shadow-[0_4px_12px_-4px_rgba(196,32,42,.7)] active:scale-95">
          SOS
        </span>
        <span className="text-[14px] font-semibold text-ink">{pick(lang, "Help", "मदद", "मदत")}</span>
      </button>

      <div className="-mt-6 justify-self-center">
        <MicFab lang={lang} state={voice.state} onStart={voice.start} onStop={voice.stop} />
      </div>

      <button onClick={onNearMe} className="flex flex-col items-center gap-1 justify-self-end">
        <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-maroon text-maroon active:bg-paper-2 ${locating ? "animate-pulse" : ""}`}>
          <LocateIcon size={22} />
        </span>
        <span className="text-[14px] font-semibold text-ink">{pick(lang, "Near me", "पास में", "जवळ")}</span>
      </button>
    </div>
  );
}

/** First thing a pilgrim sees above the dock: the three ways to start, in plain words. */
function StartCard({ lang, onPick, onClose }: { lang: Lang; onPick: (c: Category) => void; onClose: () => void }) {
  const quick: Category[] = ["transport", "ghat", "toilet", "hospital"];
  return (
    <div className="rise mx-3 rounded-xl border border-rule bg-card p-3.5 shadow-[0_10px_28px_-14px_rgba(42,23,15,.55)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[17px] leading-snug font-semibold text-ink">
          {pick(lang,
            "Tap the orange mic and ask, or choose:",
            "केसरिया माइक दबाकर पूछें, या चुनें:",
            "केशरी माईक दाबून विचारा, किंवा निवडा:")}
        </p>
        <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-paper-2">
          <XIcon size={18} />
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-2">
        {quick.map((c) => (
          <button key={c} onClick={() => onPick(c)} className="flex flex-col items-center gap-1 rounded-lg bg-paper py-2 active:bg-paper-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ backgroundColor: categoryColor(c) }}>
              <CategoryIcon category={c} size={20} />
            </span>
            <span className="text-center text-[13px] leading-tight font-semibold text-ink">{loc(lang, CATEGORY_LABEL[c])}</span>
          </button>
        ))}
      </div>
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
            <button onClick={() => onSelect(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2 active:bg-paper-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: categoryColor(p.category) }}>
                <CategoryIcon category={p.category} size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{placeName(lang, p)}</span>
                <span className="block truncate text-[14px] text-muted">{p.area}</span>
              </span>
              {km !== null && (
                <span className="tnum shrink-0 text-[15px] font-semibold text-maroon">
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
  const [startClosed, setStartClosed] = useState(false);
  // The answer the pilgrim closed; a new answer (or a new question) shows the panel again.
  const [dismissedAnswer, setDismissedAnswer] = useState<string | null>(null);
  // Directions card open for the selected place.
  const [routing, setRouting] = useState(false);
  const directions = useDirections(routing ? selected : null, lang, userPos, setUserPos);

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

  const select = useCallback((p: Place) => { setSelected(p); setRouting(false); }, []);
  const closeSheet = useCallback(() => { setSelected(null); setRouting(false); }, []);

  const sheet = (p: Place) =>
    routing ? (
      <DirectionsCard place={p} lang={lang} directions={directions} onBack={() => setRouting(false)} onClose={closeSheet} />
    ) : (
      <PlaceSheet place={p} lang={lang} userPos={userPos} onClose={closeSheet} onDirections={() => setRouting(true)} />
    );

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
          <div className="bg-maroon bg-[radial-gradient(120%_140%_at_100%_0%,#A3302A_0%,transparent_60%)]">
            <Masthead lang={lang} setLang={setLang} />
            <SearchField value={search} onChange={setSearch} onSubmit={submitSearch} lang={lang} />
          </div>
          {/* Directions on a phone need every pixel of map for the route. */}
          <div className={routing ? "hidden md:block" : ""}>
            <Filters selected={filters} onToggle={toggleFilter} lang={lang} />
          </div>
        </header>

        {/* Desktop rail */}
        <aside className="hidden min-h-0 overflow-y-auto border-r border-rule bg-paper [grid-area:rail] md:block">
          {voicePanel("inline")}
          {selected ? (
            <div className="border-b border-rule">
              {sheet(selected)}
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
              onClick={closeSheet}
            >
              <MapController
                focus={focus}
                places={places}
                userPos={userPos}
                onReady={() => setMapReady(true)}
                results={visible}
                resultsKey={browsing ? `${[...filters].join(",")}|${search.trim().toLowerCase()}` : ""}
              />
              <RouteLine
                polyline={routing && directions.status === "route" ? directions.route?.polyline ?? null : null}
                destination={selected ?? undefined}
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
          <div data-map-overlay className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 md:hidden">
            {!selected && browsing && visible.length > 0 && voice.state === "idle" && !voice.answer && (
              <div className="rise pointer-events-auto max-h-[34dvh] overflow-y-auto rounded-t-xl border-t border-rule bg-paper shadow-[0_-8px_24px_-16px_rgba(29,25,21,.5)]">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule" />
                <PlaceList places={ranked} ranked={search.trim() !== ""} userPos={userPos} lang={lang} onSelect={select} />
              </div>
            )}
            {!selected && !browsing && !startClosed && voice.state === "idle" && !voice.answer && (
              <div className="pointer-events-auto pb-3">
                <StartCard lang={lang} onPick={(c) => { toggleFilter(c); setStartClosed(true); }} onClose={() => setStartClosed(true)} />
              </div>
            )}
            {!selected && <div className="pointer-events-auto pb-3">{voicePanel("float")}</div>}
            {selected && (
              <div className="pointer-events-auto max-h-[72dvh] overflow-y-auto rounded-t-xl border-t border-rule shadow-[0_-8px_24px_-16px_rgba(29,25,21,.5)]">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule" />
                {sheet(selected)}
              </div>
            )}
          </div>

          {!(search && visible.length === 0) && (
            // On phones the open sheet covers the map; the banner would sit on its photo.
            <div className={selected ? "hidden md:contents" : "contents"}>
              <AdvisoryBanner advisories={advisories} places={places} lang={lang} onSelectPlace={select} />
            </div>
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
