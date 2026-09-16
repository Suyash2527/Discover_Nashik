"use client";

import { useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import { Place, CATEGORIES, Category } from "@/types/place";

// Icons for categories using Tailwind colors
const getIcon = (category: string) => {
  let color = "#3b82f6"; // blue-500
  switch (category) {
    case "temple": color = "#f97316"; break; // orange-500
    case "ghat": color = "#14b8a6"; break; // teal-500
    case "stay": color = "#8b5cf6"; break; // violet-500
    case "food": color = "#ef4444"; break; // red-500
    case "hospital": color = "#22c55e"; break; // green-500
    case "parking": color = "#6b7280"; break; // gray-500
    case "toilet": color = "#0ea5e9"; break; // sky-500
    case "water": color = "#3b82f6"; break; // blue-500
    case "police": color = "#eab308"; break; // yellow-500
    case "chemist": color = "#ec4899"; break; // pink-500
  }
  
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color:${color}; width: 1.25rem; height: 1.25rem; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

export default function MapClient({ places }: { places: Place[] }) {
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [search, setSearch] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const filteredPlaces = useMemo(() => {
    return places.filter(p => {
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
  }, [places, selectedCats, search]);

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
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#e5e3df]">
      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
         <MapContainer center={[20.0059, 73.791]} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filteredPlaces.map((place) => (
            <Marker 
              key={place.id} 
              position={[place.lat, place.lng]}
              icon={getIcon(place.category)}
              eventHandlers={{
                click: () => setSelectedPlace(place),
              }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Floating UI */}
      <div className="absolute top-0 inset-x-0 z-10 p-4 flex flex-col gap-3 pointer-events-none">
        {/* Search Bar */}
        <input 
          type="text" 
          placeholder="Search places..." 
          className="w-full bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-lg pointer-events-auto text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-2 pointer-events-auto snap-x hide-scrollbar">
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`px-4 py-1.5 rounded-full whitespace-nowrap text-sm font-semibold shadow-sm transition-colors snap-start border ${selectedCats.has(cat) ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white/90 backdrop-blur-sm border-gray-200 text-gray-700'}`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Sheet */}
      {selectedPlace && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] p-6 pb-8 transition-transform transform translate-y-0 flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
               <h2 className="text-2xl font-bold text-gray-900 leading-tight">{selectedPlace.name.en}</h2>
               <p className="text-sm font-medium text-gray-500 mt-0.5">{selectedPlace.name.hi} • {selectedPlace.name.mr}</p>
            </div>
            <button onClick={() => setSelectedPlace(null)} className="p-2 -mr-2 -mt-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          
          <div className="flex items-center gap-2 mt-1">
             <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-md capitalize tracking-wide">
               {selectedPlace.category}
             </span>
             <span className="text-sm text-gray-500">{selectedPlace.area}</span>
          </div>
          
          <p className="text-gray-700 mt-2 text-base leading-relaxed">{selectedPlace.description.en}</p>
          
          <div className="mt-4 flex gap-3">
             <a 
               href={`geo:${selectedPlace.lat},${selectedPlace.lng}?q=${selectedPlace.lat},${selectedPlace.lng}(${encodeURIComponent(selectedPlace.name.en)})`}
               className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-center py-3.5 rounded-xl font-bold shadow-md transition-colors flex items-center justify-center gap-2"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                Directions
             </a>
          </div>
        </div>
      )}
    </div>
  );
}
