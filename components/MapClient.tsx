"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Place, CATEGORIES, Category } from "@/types/place";
import { CategoryIcon, categoryColor, SearchIcon, MicIcon, LocateIcon, XIcon } from "./icons";
import VoicePanel from "./VoicePanel";
import MicFab from "./MicFab";
import PlaceSheet from "./PlaceSheet";
import HintOverlay from "./HintOverlay";

// ─── Constants ─────────────────────────────────────────────────────────────
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID  = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID  ?? "DEMO_MAP_ID";
const NASHIK_CENTER = { lat: 20.0059, lng: 73.7910 };

const CATEGORY_LABELS: Record<Category, string> = {
  temple:   "Temple",
  ghat:     "Ghat",
  food:     "Food",
  stay:     "Stay",
  parking:  "Parking",
  hospital: "Hospital",
  police:   "Police",
  toilet:   "Toilet",
  water:    "Water",
  chemist:  "Chemist",
};

// ─── Teardrop pin ──────────────────────────────────────────────────────────
function PlaceMarker({ category, isHighlighted }: { category: string; isHighlighted: boolean }) {
  const color = categoryColor(category);
  const size  = isHighlighted ? 52 : 40;

  return (
    <div
      className={`marker-pop-in ${isHighlighted ? "marker-highlight" : ""} flex items-center justify-center rounded-full text-white border-[3px] border-white transition-all duration-200`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        boxShadow: `0 4px 12px ${color}80`,
        transform: isHighlighted ? "translate(-50%,-55%) scale(1.1)" : "translate(-50%,-55%)",
      }}
    >
      <CategoryIcon category={category} size={isHighlighted ? 26 : 20} />
    </div>
  );
}

// ─── User dot ──────────────────────────────────────────────────────────────
function UserDot() {
  return (
    <div
      className="user-dot w-5 h-5 rounded-full bg-blue-500 border-[3px] border-white"
      style={{ transform: "translate(-50%,-50%)" }}
    />
  );
}

// ─── Map controller (bounds / pan) ─────────────────────────────────────────
function MapController({
  highlightedIds,
  places,
  setMapReady,
  userPos,
}: {
  highlightedIds: string[];
  places: Place[];
  setMapReady: (v: boolean) => void;
  userPos: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => { if (map) setMapReady(true); }, [map, setMapReady]);

  // Fit bounds to all places on first load
  useEffect(() => {
    if (!map || places.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, { top: 60, bottom: 100, left: 20, right: 20 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]); // run once when map is ready

  // Pan/zoom to highlighted places
  useEffect(() => {
    if (!map || highlightedIds.length === 0) return;
    const targets = places.filter((p) => highlightedIds.includes(p.id));
    if (targets.length === 1) {
      map.panTo({ lat: targets[0].lat, lng: targets[0].lng });
      map.setZoom(16);
    } else if (targets.length > 1) {
      const b = new google.maps.LatLngBounds();
      targets.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(b, { top: 60, bottom: 200, left: 40, right: 40 });
    }
  }, [highlightedIds, map, places]);

  // Zoom to user position
  useEffect(() => {
    if (!map || !userPos) return;
    map.panTo(userPos);
    map.setZoom(16);
  }, [userPos, map]);

  return null;
}

// ─── Popular places sidebar list ───────────────────────────────────────────
function PopularPlaces({
  places,
  onSelect,
  lang,
}: {
  places: Place[];
  onSelect: (p: Place) => void;
  lang: "mr-IN" | "hi-IN" | "en-IN";
}) {
  const popular = places.slice(0, 6);
  return (
    <div className="flex flex-col gap-2 px-1">
      <h3 className="text-base font-bold text-[#57534E] uppercase tracking-widest mb-1">
        {lang === "mr-IN" ? "लोकप्रिय ठिकाणे" : lang === "hi-IN" ? "लोकप्रिय स्थान" : "Popular Places"}
      </h3>
      {popular.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="flex items-center gap-3 p-3 rounded-xl bg-white hover:bg-gray-50 active:scale-[0.98] transition shadow-sm border border-gray-100 text-left"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: categoryColor(p.category) }}
          >
            <CategoryIcon category={p.category} size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-[#1C1917] truncate">
              {lang === "mr-IN" ? p.name.mr : lang === "hi-IN" ? p.name.hi : p.name.en}
            </p>
            <p className="text-sm text-[#57534E] truncate">{p.area}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────
function Header({
  lang,
  setLang,
}: {
  lang: "mr-IN" | "hi-IN" | "en-IN";
  setLang: (l: "mr-IN" | "hi-IN" | "en-IN") => void;
}) {
  const langs: { code: "mr-IN" | "hi-IN" | "en-IN"; label: string }[] = [
    { code: "mr-IN", label: "मराठी" },
    { code: "hi-IN", label: "हिंदी" },
    { code: "en-IN", label: "En" },
  ];
  return (
    <header className="h-14 bg-[#1E3A8A] flex items-center justify-between px-4 shrink-0 shadow-md z-10">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-white text-[#1E3A8A] flex items-center justify-center shadow-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <span className="text-white font-bold text-lg tracking-tight leading-none">Discover Nashik</span>
      </div>
      <div className="flex bg-[#172554] rounded-full p-0.5 gap-0.5">
        {langs.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
              lang === l.code ? "bg-white text-[#1E3A8A]" : "text-blue-200 hover:text-white"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}

// ─── Search bar ────────────────────────────────────────────────────────────
function SearchBar({
  value,
  onChange,
  onMic,
  lang,
}: {
  value: string;
  onChange: (v: string) => void;
  onMic: () => void;
  lang: "mr-IN" | "hi-IN" | "en-IN";
}) {
  const placeholder =
    lang === "mr-IN" ? "ठिकाण शोधा…" : lang === "hi-IN" ? "जगह खोजें…" : "Search places…";

  return (
    <div className="relative flex items-center mx-4 mt-3 mb-1 shrink-0">
      <div className="absolute left-3.5 text-[#57534E] pointer-events-none">
        <SearchIcon size={20} />
      </div>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white pl-10 pr-12 py-3 rounded-2xl border-2 border-gray-100 focus:border-[#EA580C] outline-none text-[17px] font-medium text-[#1C1917] placeholder-[#A8A29E] shadow-sm transition-colors"
      />
      {value ? (
        <button
          className="absolute right-3 text-[#57534E] hover:text-[#1C1917] transition"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <XIcon size={20} />
        </button>
      ) : (
        <button
          className="absolute right-3 text-[#EA580C] hover:text-orange-700 transition"
          onClick={onMic}
          aria-label="Voice search"
        >
          <MicIcon size={20} />
        </button>
      )}
    </div>
  );
}

// ─── Category chips row ─────────────────────────────────────────────────────
function CategoryChips({
  selected,
  onToggle,
}: {
  selected: Set<Category>;
  onToggle: (c: Category) => void;
}) {
  return (
    <div className="relative shrink-0">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 pb-2 pt-1">
        {CATEGORIES.map((cat) => {
          const active = selected.has(cat);
          const color  = categoryColor(cat);
          return (
            <button
              key={cat}
              onClick={() => onToggle(cat)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 whitespace-nowrap shrink-0 transition-all active:scale-95 font-bold text-[15px]"
              style={
                active
                  ? { backgroundColor: color, borderColor: color, color: "#fff" }
                  : { backgroundColor: "#fff", borderColor: color, color: color }
              }
            >
              <CategoryIcon category={cat} size={17} />
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-2 w-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, transparent, #FFFBF5)" }}
      />
    </div>
  );
}

// ─── Bottom action bar ─────────────────────────────────────────────────────
function ActionBar({
  lang,
  onSOS,
  onNearMe,
}: {
  lang: "mr-IN" | "hi-IN" | "en-IN";
  onSOS: () => void;
  onNearMe: () => void;
}) {
  return (
    <div className="h-[88px] bg-[#FFFBF5] border-t border-gray-200 flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {/* SOS */}
      <button
        onClick={onSOS}
        className="flex flex-col items-center gap-1 w-[72px]"
        aria-label="SOS Emergency"
      >
        <div className="w-12 h-12 rounded-2xl bg-[#DC2626] text-white flex items-center justify-center shadow-lg shadow-red-500/40 active:scale-95 transition">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <span className="text-[13px] font-black text-[#DC2626]">SOS</span>
      </button>

      {/* Mic */}
      <MicFab lang={lang} />

      {/* Near me */}
      <button
        onClick={onNearMe}
        className="flex flex-col items-center gap-1 w-[72px]"
        aria-label="Near me"
      >
        <div className="w-12 h-12 rounded-2xl bg-[#1E3A8A] text-white flex items-center justify-center shadow-lg shadow-blue-900/30 active:scale-95 transition">
          <LocateIcon size={26} />
        </div>
        <span className="text-[13px] font-black text-[#1E3A8A]">
          {lang === "mr-IN" ? "जवळचे" : lang === "hi-IN" ? "पास में" : "Near me"}
        </span>
      </button>
    </div>
  );
}

// ─── SOS sheet ─────────────────────────────────────────────────────────────
function SOSSheet({ onClose, lang }: { onClose: () => void; lang: "mr-IN" | "hi-IN" | "en-IN" }) {
  const numbers = [
    { label: lang === "mr-IN" ? "पोलीस" : lang === "hi-IN" ? "पुलिस" : "Police", num: "100" },
    { label: lang === "mr-IN" ? "रुग्णवाहिका" : lang === "hi-IN" ? "एम्बुलेंस" : "Ambulance", num: "108" },
    { label: lang === "mr-IN" ? "अग्निशमन" : lang === "hi-IN" ? "अग्निशमन" : "Fire", num: "101" },
    { label: "Kumbh Control Room", num: "18002330225" },
  ];
  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center md:justify-center" onClick={onClose}>
      <div className="w-full md:max-w-sm bg-white rounded-t-3xl md:rounded-3xl p-6 sheet-enter" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-black text-[#DC2626]">
            🚨 {lang === "mr-IN" ? "आपत्कालीन" : lang === "hi-IN" ? "आपातकाल" : "Emergency"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 transition">
            <XIcon size={20} className="text-[#57534E]" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {numbers.map((n) => (
            <a
              key={n.num}
              href={`tel:${n.num}`}
              className="flex items-center justify-between bg-red-50 border-2 border-red-200 rounded-2xl px-4 py-4 active:scale-[0.98] transition"
            >
              <span className="text-lg font-bold text-[#1C1917]">{n.label}</span>
              <span className="text-2xl font-black text-[#DC2626]">{n.num}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────
export default function MapClient({ places }: { places: Place[] }) {
  const [lang, setLang] = useState<"mr-IN" | "hi-IN" | "en-IN">("en-IN");
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [search, setSearch] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [showSOS, setShowSOS] = useState(false);
  const micRef = useRef<() => void>(() => {});

  const filteredPlaces = useMemo(() => {
    const q = search.toLowerCase().trim();
    return places.filter((p) => {
      if (highlightedIds.includes(p.id)) return true;
      if (!selectedCats.has(p.category)) return false;
      if (!q) return true;
      return (
        p.name.en.toLowerCase().includes(q) ||
        p.name.hi.toLowerCase().includes(q) ||
        p.name.mr.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [places, selectedCats, search, highlightedIds]);

  const toggleCat = useCallback((cat: Category) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleNearMe = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert("Could not get your location.")
    );
  }, []);

  const handlePlaceSelect = useCallback((place: Place) => {
    setSelectedPlace(place);
    setHighlightedIds([place.id]);
  }, []);

  // ─── MOBILE layout ─────────────────────────────────────────────────────
  const mobileContent = (
    <div className="flex flex-col h-full">
      {/* a) Header */}
      <Header lang={lang} setLang={setLang} />

      {/* b) Search */}
      <SearchBar value={search} onChange={setSearch} onMic={() => micRef.current?.()} lang={lang} />

      {/* c) Category chips */}
      <CategoryChips selected={selectedCats} onToggle={toggleCat} />

      {/* d) Map */}
      <div className="flex-1 relative min-h-0">
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#FFFBF5]">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#EA580C] rounded-full animate-spin" />
          </div>
        )}

        <APIProvider apiKey={API_KEY}>
          <Map
            defaultCenter={NASHIK_CENTER}
            defaultZoom={14}
            mapId={MAP_ID}
            disableDefaultUI
            gestureHandling="greedy"
            style={{ width: "100%", height: "100%" }}
          >
            <MapController
              highlightedIds={highlightedIds}
              places={places}
              setMapReady={setMapReady}
              userPos={userPos}
            />
            {filteredPlaces.map((place) => (
              <AdvancedMarker
                key={place.id}
                position={{ lat: place.lat, lng: place.lng }}
                onClick={() => handlePlaceSelect(place)}
              >
                <PlaceMarker
                  category={place.category}
                  isHighlighted={highlightedIds.includes(place.id)}
                />
              </AdvancedMarker>
            ))}
            {userPos && (
              <AdvancedMarker position={userPos}>
                <UserDot />
              </AdvancedMarker>
            )}
          </Map>
        </APIProvider>

        {/* Place bottom sheet — slides up */}
        {selectedPlace && (
          <div className="absolute bottom-0 inset-x-0 z-30 max-h-[70%] overflow-y-auto">
            <PlaceSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} lang={lang} />
          </div>
        )}

        {/* SOS overlay */}
        {showSOS && <SOSSheet onClose={() => setShowSOS(false)} lang={lang} />}
      </div>

      {/* e) Bottom action bar */}
      <ActionBar lang={lang} onSOS={() => setShowSOS(true)} onNearMe={handleNearMe} />
    </div>
  );

  // ─── DESKTOP layout ─────────────────────────────────────────────────────
  const desktopContent = (
    <div className="flex flex-col h-full">
      {/* Header across full top */}
      <Header lang={lang} setLang={setLang} />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel */}
        <div className="w-[360px] shrink-0 flex flex-col bg-[#FFFBF5] border-r border-gray-200 overflow-hidden">
          {/* Search */}
          <SearchBar value={search} onChange={setSearch} onMic={() => micRef.current?.()} lang={lang} />

          {/* Chips */}
          <CategoryChips selected={selectedCats} onToggle={toggleCat} />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Voice panel */}
            <VoicePanel
              onPlaceIds={setHighlightedIds}
              onSelectPlace={handlePlaceSelect}
              places={places}
              lang={lang}
            />

            {/* Place details OR popular list */}
            {selectedPlace ? (
              <PlaceSheet place={selectedPlace} onClose={() => setSelectedPlace(null)} lang={lang} />
            ) : (
              <PopularPlaces places={places} onSelect={handlePlaceSelect} lang={lang} />
            )}
          </div>

          {/* Action bar pinned at bottom of panel */}
          <ActionBar lang={lang} onSOS={() => setShowSOS(true)} onNearMe={handleNearMe} />
        </div>

        {/* Map */}
        <div className="flex-1 relative min-w-0">
          {!mapReady && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#FFFBF5]">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-[#EA580C] rounded-full animate-spin" />
            </div>
          )}

          <APIProvider apiKey={API_KEY}>
            <Map
              defaultCenter={NASHIK_CENTER}
              defaultZoom={14}
              mapId={MAP_ID}
              disableDefaultUI
              gestureHandling="greedy"
              style={{ width: "100%", height: "100%" }}
            >
              <MapController
                highlightedIds={highlightedIds}
                places={places}
                setMapReady={setMapReady}
                userPos={userPos}
              />
              {filteredPlaces.map((place) => (
                <AdvancedMarker
                  key={place.id}
                  position={{ lat: place.lat, lng: place.lng }}
                  onClick={() => handlePlaceSelect(place)}
                >
                  <PlaceMarker
                    category={place.category}
                    isHighlighted={highlightedIds.includes(place.id)}
                  />
                </AdvancedMarker>
              ))}
              {userPos && (
                <AdvancedMarker position={userPos}>
                  <UserDot />
                </AdvancedMarker>
              )}
            </Map>
          </APIProvider>

          {showSOS && <SOSSheet onClose={() => setShowSOS(false)} lang={lang} />}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <HintOverlay />

      {/* Mobile: hidden at md+, Desktop: hidden below md */}
      <div className="block md:hidden h-full">{mobileContent}</div>
      <div className="hidden md:block h-full">{desktopContent}</div>
    </>
  );
}
