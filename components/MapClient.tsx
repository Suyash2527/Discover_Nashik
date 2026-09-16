"use client";

import { useState, useMemo, useEffect } from "react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Place, CATEGORIES, Category } from "@/types/place";
import VoiceButton from "./VoiceButton";

const getCategorySvg = (category: string) => {
  switch (category) {
    case "temple":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>;
    case "hospital":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/></svg>;
    case "food":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>;
    case "stay":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    case "ghat":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 12c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/><path d="M2 18c.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6.6 0 1.2-.2 1.8-.6.6-.4 1.2-.4 1.8 0 .6.4 1.2.6 1.8.6"/></svg>;
    case "parking":
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></svg>;
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
  }
};

const getCategoryColor = (category: string) => {
  if (["temple", "ghat", "stay"].includes(category)) return "#E8740C"; // Saffron
  if (["hospital", "police", "chemist"].includes(category)) return "#DC2626"; // Red
  if (["food", "water", "toilet"].includes(category)) return "#16A34A"; // Green
  return "#1E3A8A"; // Deep Blue
};

// Marker component styling
const PlaceMarker = ({ category, isHighlighted }: { category: string, isHighlighted: boolean }) => {
  const bgColor = getCategoryColor(category);
  const sizeClass = isHighlighted ? 'w-14 h-14' : 'w-10 h-10';
  const highlightClass = isHighlighted ? 'marker-highlight' : '';

  return (
    <div 
      className={`marker-pop-in ${highlightClass} ${sizeClass} flex items-center justify-center text-white rounded-full border-[3px] border-white transition-all duration-300 shadow-lg`} 
      style={{
        backgroundColor: bgColor,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className={isHighlighted ? "scale-110 transition-transform" : "scale-75 transition-transform"}>
        {getCategorySvg(category)}
      </div>
    </div>
  );
};

function MapController({ highlightedPlaceIds, places, setMapReady }: { highlightedPlaceIds: string[], places: Place[], setMapReady: (ready: boolean) => void }) {
  const map = useMap();

  useEffect(() => {
    if (map) setMapReady(true);
  }, [map, setMapReady]);

  useEffect(() => {
    if (!map || highlightedPlaceIds.length === 0) return;

    const highlightedPlaces = places.filter(p => highlightedPlaceIds.includes(p.id));
    
    if (highlightedPlaces.length === 1) {
      map.panTo({ lat: highlightedPlaces[0].lat, lng: highlightedPlaces[0].lng });
      map.setZoom(16);
    } else if (highlightedPlaces.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      highlightedPlaces.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, { top: 50, bottom: 150, left: 50, right: 50 });
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
  
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyAtyRi3sk9kJTus_1RJkJqQu7FgH0DoRgY";

  const filteredPlaces = useMemo(() => {
    return places.filter(p => {
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
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setSelectedCats(next);
  };

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#FFF8EE] flex flex-col lg:flex-row">
      
      {/* Left Panel (Desktop) / Top Area (Mobile) */}
      <div className="w-full lg:w-[420px] flex flex-col z-10 shrink-0 shadow-2xl bg-[#FFF8EE] lg:h-full pb-2">
        
        {/* Top Bar (Deep Blue) */}
        <div className="bg-[#1E3A8A] text-white p-4 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white text-[#1E3A8A] flex items-center justify-center font-black">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Discover Nashik</h1>
          </div>
          <div className="flex bg-[#172554] rounded-full p-1 border border-blue-800">
             <span className="px-3 py-1.5 text-base font-semibold rounded-full bg-[#1E3A8A] text-white">मराठी</span>
             <span className="px-3 py-1.5 text-base font-semibold text-blue-200">हिंदी</span>
             <span className="px-3 py-1.5 text-base font-semibold text-blue-200">En</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Search Bar */}
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <input 
              type="text" 
              placeholder="Search places..." 
              className="w-full bg-white pl-12 pr-12 py-4 rounded-[20px] shadow-sm border-2 border-gray-100 text-[#1F1A14] focus:outline-none focus:border-[#E8740C] transition-colors text-lg font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute inset-y-0 right-4 flex items-center text-[#E8740C] pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </div>
          </div>
          
          {/* Categories */}
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar">
            {CATEGORIES.map(cat => {
              const isActive = selectedCats.has(cat);
              const color = getCategoryColor(cat);
              return (
                <button 
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className={`flex flex-col items-center gap-2 shrink-0 snap-start transition-all ${isActive ? 'opacity-100' : 'opacity-70 grayscale-[50%]'}`}
                  style={{ minWidth: '72px' }}
                >
                  <div 
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-95 ${isActive ? 'text-white' : 'bg-white border-2'}`}
                    style={isActive ? { backgroundColor: color } : { borderColor: color, color: color }}
                  >
                    <div className="scale-[1.2]">
                      {getCategorySvg(cat)}
                    </div>
                  </div>
                  <span className="text-base font-bold text-[#1F1A14] capitalize">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-[#e5e3df]">
        {!mapReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
             <div className="w-12 h-12 border-4 border-gray-300 border-t-[#E8740C] rounded-full animate-spin"></div>
          </div>
        )}

        <APIProvider apiKey={apiKey}>
          <Map 
            defaultCenter={{ lat: 20.0059, lng: 73.791 }} 
            defaultZoom={13} 
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
            disableDefaultUI={true}
            gestureHandling="greedy"
          >
            <MapController highlightedPlaceIds={highlightedPlaceIds} places={places} setMapReady={setMapReady} />
            
            {filteredPlaces.map((place) => (
              <AdvancedMarker 
                key={place.id} 
                position={{ lat: place.lat, lng: place.lng }}
                onClick={() => {
                   setSelectedPlace(place);
                   setHighlightedPlaceIds([place.id]);
                }}
              >
                <PlaceMarker category={place.category} isHighlighted={highlightedPlaceIds.includes(place.id)} />
              </AdvancedMarker>
            ))}
          </Map>
        </APIProvider>
        
        {/* Global Floating Elements (Mobile & Desktop Overlay) */}
        
        <VoiceButton 
           onPlaceIds={setHighlightedPlaceIds} 
           isBottomSheetOpen={!!selectedPlace} 
           places={places}
        />

        {/* SOS Button */}
        <button className="absolute left-6 bottom-8 z-30 flex items-center gap-2 bg-[#DC2626] text-white px-5 py-4 rounded-full font-bold shadow-[0_8px_16px_rgba(220,38,38,0.4)] hover:bg-red-700 active:scale-95 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          <span className="text-lg">SOS</span>
        </button>

        {/* Bottom Sheet */}
        <div className={`absolute bottom-0 inset-x-0 z-40 bg-white rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] p-6 pb-10 transition-transform duration-500 ease-out transform flex flex-col gap-4 lg:w-[450px] lg:left-6 lg:rounded-[32px] lg:bottom-6 ${selectedPlace ? 'translate-y-0 lg:translate-y-0' : 'translate-y-full lg:translate-y-[150%] opacity-0'}`}>
          
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-gray-200 rounded-full lg:hidden"></div>

          {selectedPlace && (
            <>
              <div className="flex justify-between items-start mt-2">
                <div className="flex gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0" style={{ backgroundColor: getCategoryColor(selectedPlace.category) }}>
                    <div className="scale-[1.2]">
                      {getCategorySvg(selectedPlace.category)}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-[26px] font-black text-[#1E3A8A] leading-tight">{selectedPlace.name.mr}</h2>
                    <p className="text-xl font-bold text-[#1F1A14] mt-1">{selectedPlace.name.hi}</p>
                    <p className="text-lg font-medium text-gray-500 mt-0.5">{selectedPlace.name.en}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedPlace(null)} className="p-3 -mr-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors active:scale-95">
                   <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                 <span className="px-4 py-1.5 bg-[#16A34A]/10 text-[#16A34A] text-base font-bold rounded-lg flex items-center gap-1.5">
                   <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A]"></div>
                   Open Now
                 </span>
                 <span className="text-lg font-semibold text-gray-600 ml-2">{selectedPlace.area}</span>
              </div>
              
              <div className="mt-4 flex gap-4">
                 <a 
                   href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.lat},${selectedPlace.lng}`}
                   target="_blank" rel="noopener noreferrer"
                   className="flex-1 bg-[#1E3A8A] text-white text-center py-5 rounded-[24px] font-black text-xl shadow-xl shadow-blue-900/20 active:scale-[0.98] flex flex-col items-center justify-center gap-1 transition-all"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Directions
                 </a>
                 <a 
                   href="tel:+919876543210"
                   className="flex-1 bg-[#FFF8EE] border-[3px] border-[#1E3A8A] text-[#1E3A8A] text-center py-5 rounded-[24px] font-black text-xl active:bg-blue-50 active:scale-[0.98] flex flex-col items-center justify-center gap-1 transition-all"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Call
                 </a>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
