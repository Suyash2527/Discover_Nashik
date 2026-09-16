"use client";

import { useState, useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { Place, CATEGORIES, Category } from "@/types/place";
import VoiceButton from "./VoiceButton";

const getCategorySvg = (category: string) => {
  switch (category) {
    case "temple":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>;
    case "hospital":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/></svg>;
    case "food":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>;
    case "stay":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case "ghat":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 12c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 18c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/></svg>;
    case "parking":
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>;
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
  }
};

const getSvgString = (category: string) => {
  switch (category) {
    case "temple": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>';
    case "hospital": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/></svg>';
    case "food": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';
    case "stay": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    case "ghat": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 12c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 18c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/></svg>';
    case "parking": return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>';
    default: return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  }
}

// Icons for categories using Spiritual Tailwind colors
const getIcon = (category: string, isHighlighted: boolean) => {
  let bgColor = "#1e3a8a"; // deep blue (default)
  let shadowColor = "rgba(30,58,138,0.5)";
  
  if (["temple", "ghat", "stay"].includes(category)) {
    bgColor = "#f97316"; // saffron
    shadowColor = "rgba(249,115,22,0.5)";
  } else if (["hospital", "police", "chemist"].includes(category)) {
    bgColor = "#dc2626"; // red
    shadowColor = "rgba(220,38,38,0.5)";
  } else if (["food", "water", "toilet"].includes(category)) {
    bgColor = "#047857"; // deep green
    shadowColor = "rgba(4,120,87,0.5)";
  }
  
  const sizeClass = isHighlighted ? 'w-10 h-10' : 'w-8 h-8';
  const highlightClass = isHighlighted ? 'marker-highlight' : '';
  
  const htmlStr = `
    <div class="marker-pop-in ${highlightClass} ${sizeClass} flex items-center justify-center text-white rounded-full border-2 border-white transition-all duration-300 shadow-[0_4px_12px_${shadowColor}]" style="background-color: ${bgColor};">
      ${getSvgString(category)}
    </div>
  `;

  return new L.DivIcon({
    className: 'bg-transparent',
    html: htmlStr,
    iconSize: isHighlighted ? [40, 40] : [32, 32],
    iconAnchor: isHighlighted ? [20, 20] : [16, 16]
  });
};

function MapController({ highlightedPlaceIds, places, setMapReady }: { highlightedPlaceIds: string[], places: Place[], setMapReady: (ready: boolean) => void }) {
  const map = useMap();

  useEffect(() => {
    // Basic timeout to simulate tile loading completion and hide skeleton
    const timer = setTimeout(() => setMapReady(true), 600);
    return () => clearTimeout(timer);
  }, [setMapReady]);

  useEffect(() => {
    if (highlightedPlaceIds.length > 0) {
      const highlightedPlaces = places.filter(p => highlightedPlaceIds.includes(p.id));
      if (highlightedPlaces.length === 1) {
        map.flyTo([highlightedPlaces[0].lat, highlightedPlaces[0].lng], 16, { animate: true, duration: 1.5 });
      } else if (highlightedPlaces.length > 1) {
        const bounds = L.latLngBounds(highlightedPlaces.map(p => [p.lat, p.lng]));
        map.flyToBounds(bounds, { padding: [50, 50], animate: true, duration: 1.5 });
      }
    }
  }, [highlightedPlaceIds, map, places]);

  return null;
}

export default function MapClient({ places }: { places: Place[] }) {
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [search, setSearch] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [highlightedPlaceIds, setHighlightedPlaceIds] = useState<string[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const filteredPlaces = useMemo(() => {
    return places.filter(p => {
      // Highlighted places from voice should always be visible
      if (highlightedPlaceIds.includes(p.id)) return true;
      
      if (!selectedCats.has(p.category)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.en.toLowerCase().includes(q) ||
        p.name.hi.toLowerCase().includes(q) ||
        p.name.mr.toLowerCase().includes(q) ||
        p.aliases.some(a => a.toLowerCase().includes(q))
      );
    });
  }, [places, selectedCats, search, highlightedPlaceIds]);

  const toggleCat = (cat: Category) => {
    const next = new Set(selectedCats);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setSelectedCats(next);
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#fffbf0]">
      
      {/* Loading Skeleton */}
      {!mapReady && (
        <div className="absolute inset-0 z-10 bg-[#e5e3df] flex flex-col items-center justify-center pointer-events-none transition-opacity duration-500">
           <div className="w-12 h-12 border-4 border-orange-200 border-t-[#f97316] rounded-full animate-spin"></div>
        </div>
      )}

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
         <MapContainer center={[20.0059, 73.791]} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController highlightedPlaceIds={highlightedPlaceIds} places={places} setMapReady={setMapReady} />
          {filteredPlaces.map((place) => (
            <Marker 
              key={place.id} 
              position={[place.lat, place.lng]}
              icon={getIcon(place.category, highlightedPlaceIds.includes(place.id))}
              eventHandlers={{
                click: () => {
                   setSelectedPlace(place);
                   setHighlightedPlaceIds([place.id]); // highlight tapped pin too
                }
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Floating UI */}
      <div className="absolute top-0 inset-x-0 z-10 p-4 pt-6 flex flex-col gap-4 pointer-events-none">
        
        {/* Wordmark Logo Area */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#ea580c] to-[#f97316] flex items-center justify-center text-white shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <h1 className="text-xl font-extrabold text-[#1e3a8a] tracking-tight drop-shadow-sm font-sans">Discover Nashik</h1>
        </div>

        {/* Search Bar */}
        <div className="relative pointer-events-auto mt-1">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <input 
            type="text" 
            placeholder="Search places..." 
            className="w-full bg-[#fffbf0]/95 backdrop-blur-md pl-11 pr-4 py-3.5 rounded-2xl shadow-lg border border-orange-100 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#f97316] transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {/* Categories */}
        <div className="flex gap-2.5 overflow-x-auto pb-2 pointer-events-auto snap-x hide-scrollbar">
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold shadow-sm transition-all transform active:scale-95 snap-start border flex items-center gap-1.5 ${
                selectedCats.has(cat) 
                ? 'bg-[#f97316] border-[#ea580c] text-white shadow-orange-500/40' 
                : 'bg-[#fffbf0]/90 backdrop-blur-sm border-orange-100 text-gray-600 hover:text-gray-900 shadow-sm'
              }`}
            >
              <div className={selectedCats.has(cat) ? "text-white" : "text-gray-400"}>
                {getCategorySvg(cat)}
              </div>
              <span>{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      <VoiceButton 
         onPlaceIds={setHighlightedPlaceIds} 
         isBottomSheetOpen={!!selectedPlace} 
      />

      {/* Bottom Sheet */}
      <div className={`absolute bottom-0 inset-x-0 z-20 bg-[#fffbf0] rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] p-6 pb-8 transition-transform duration-500 ease-out transform flex flex-col gap-3 ${selectedPlace ? 'translate-y-0' : 'translate-y-full'}`}>
        
        {/* Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-300 rounded-full"></div>

        {selectedPlace && (
          <>
            <div className="flex justify-between items-start mt-2">
              <div>
                 <div className="flex items-center gap-2 mb-1">
                   <div className="w-7 h-7 rounded-full bg-[#f97316] text-white flex items-center justify-center shadow-sm">
                      {getCategorySvg(selectedPlace.category)}
                   </div>
                   <h2 className="text-2xl font-extrabold text-[#1e3a8a] leading-tight">{selectedPlace.name.en}</h2>
                 </div>
                 <p className="text-sm font-semibold text-gray-500 mt-0.5">{selectedPlace.name.hi} • {selectedPlace.name.mr}</p>
              </div>
              <button onClick={() => setSelectedPlace(null)} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="flex items-center gap-2 mt-1">
               <span className="px-2.5 py-1 bg-orange-100 text-[#ea580c] text-xs font-bold rounded-md capitalize tracking-wide">
                 {selectedPlace.category}
               </span>
               <span className="text-sm font-medium text-gray-500">{selectedPlace.area}</span>
            </div>
            
            <p className="text-gray-700 mt-2 text-base leading-relaxed">{selectedPlace.description.en}</p>
            
            <div className="mt-4 flex gap-3">
               <a 
                 href={`geo:${selectedPlace.lat},${selectedPlace.lng}?q=${selectedPlace.lat},${selectedPlace.lng}(${encodeURIComponent(selectedPlace.name.en)})`}
                 className="flex-1 bg-[#1e3a8a] hover:bg-[#172554] text-white text-center py-4 rounded-2xl font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
               >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Get Directions
               </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
