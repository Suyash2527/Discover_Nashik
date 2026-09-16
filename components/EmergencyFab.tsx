"use client";

import { useState, useEffect } from "react";
import placesData from "@/data/places.json";
import { haversineKm, formatDistanceKm, type LatLng } from "@/lib/geo";
import type { Place, Lang } from "@/types";

const DEFAULT_CENTER: LatLng = { lat: 20.0059, lng: 73.791 };
const PLACES = placesData as Place[];

interface EmergencyFabProps {
  lang?: Lang;
  onSelectPlace?: (place: Place) => void;
}

export default function EmergencyFab({ lang = "en-IN", onSelectPlace }: EmergencyFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng>(DEFAULT_CENTER);
  const [hasGeoFix, setHasGeoFix] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setHasGeoFix(true);
        },
        (err) => {
          console.warn("[EmergencyFab] Geolocation unavailable, using map center:", err.message);
        },
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
  }, []);

  const getNearest = (category: "hospital" | "police"): { place: Place; distanceKm: number } | null => {
    const matches = PLACES.filter((p) => p.category === category);
    if (matches.length === 0) return null;

    let best = matches[0];
    let minDist = haversineKm(userLocation, { lat: best.lat, lng: best.lng });

    for (let i = 1; i < matches.length; i++) {
      const p = matches[i];
      const dist = haversineKm(userLocation, { lat: p.lat, lng: p.lng });
      if (dist < minDist) {
        minDist = dist;
        best = p;
      }
    }

    return { place: best, distanceKm: minDist };
  };

  const nearestHospital = getNearest("hospital");
  const nearestPolice = getNearest("police");

  const langKey = lang === "hi-IN" ? "hi" : lang === "mr-IN" ? "mr" : "en";

  const labels = {
    title: { en: "Emergency Help", hi: "आपत्कालीन सहायता", mr: "आपत्कालीन मदत" }[langKey],
    sub: {
      en: "Tap for immediate assistance",
      hi: "त्वरित सहायता के लिए दबाएं",
      mr: "तातडीच्या मदतीसाठी दाबा",
    }[langKey],
    call112: { en: "Call Emergency (112)", hi: "आपातकाल कॉल करें (112)", mr: "आपत्कालीन कॉल करा (112)" }[langKey],
    hospital: { en: "Nearest Hospital", hi: "निकटतम अस्पताल", mr: "जवळचे रुग्णालय" }[langKey],
    police: { en: "Nearest Police Station", hi: "निकटतम पुलिस स्टेशन", mr: "जवळचे पोलीस स्टेशन" }[langKey],
    shareLocation: { en: "Share Location via SMS", hi: "SMS द्वारा लोकेशन साझा करें", mr: "SMS द्वारे लोकेशन पाठवा" }[langKey],
    close: { en: "Close", hi: "बंद करें", mr: "बंद करा" }[langKey],
    call: { en: "Call", hi: "कॉल करें", mr: "कॉल करा" }[langKey],
  };

  const mapsUrl = `https://maps.google.com/?q=${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)}`;
  const smsBody = encodeURIComponent(
    `Emergency! My current location in Nashik: ${mapsUrl}`,
  );

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-3 rounded-full shadow-lg border-2 border-white transition-all transform active:scale-95 animate-pulse"
        aria-label="Emergency Help"
        id="emergency-fab"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>SOS</span>
      </button>

      {/* Emergency Sheet Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="bg-red-600/20 text-red-500 p-2.5 rounded-full border border-red-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-red-500 tracking-tight">{labels.title}</h2>
                  <p className="text-xs text-slate-400">{labels.sub}</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/60"
              >
                ✕
              </button>
            </div>

            {/* 112 Call Button */}
            <a
              href="tel:112"
              className="flex items-center justify-center gap-3 w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 px-6 rounded-xl text-lg shadow-lg transition-colors border border-red-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {labels.call112}
            </a>

            {/* Nearest Hospital */}
            {nearestHospital && (
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                    🏥 {labels.hospital}
                  </span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                    {formatDistanceKm(nearestHospital.distanceKm).value} {formatDistanceKm(nearestHospital.distanceKm).unit}
                  </span>
                </div>
                <h3 className="font-bold text-base text-slate-100">{nearestHospital.place.name[langKey]}</h3>
                <p className="text-xs text-slate-300">{nearestHospital.place.area}</p>
                <div className="flex items-center gap-2 pt-1">
                  {nearestHospital.place.phone && (
                    <a
                      href={`tel:${nearestHospital.place.phone}`}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-3 rounded-lg text-xs text-center flex items-center justify-center gap-1"
                    >
                      📞 {labels.call} ({nearestHospital.place.phone})
                    </a>
                  )}
                  {onSelectPlace && (
                    <button
                      onClick={() => {
                        onSelectPlace(nearestHospital.place);
                        setIsOpen(false);
                      }}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-xs"
                    >
                      View on Map
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Nearest Police */}
            {nearestPolice && (
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    👮 {labels.police}
                  </span>
                  <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                    {formatDistanceKm(nearestPolice.distanceKm).value} {formatDistanceKm(nearestPolice.distanceKm).unit}
                  </span>
                </div>
                <h3 className="font-bold text-base text-slate-100">{nearestPolice.place.name[langKey]}</h3>
                <p className="text-xs text-slate-300">{nearestPolice.place.area}</p>
                <div className="flex items-center gap-2 pt-1">
                  {nearestPolice.place.phone && (
                    <a
                      href={`tel:${nearestPolice.place.phone}`}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-3 rounded-lg text-xs text-center flex items-center justify-center gap-1"
                    >
                      📞 {labels.call} ({nearestPolice.place.phone})
                    </a>
                  )}
                  {onSelectPlace && (
                    <button
                      onClick={() => {
                        onSelectPlace(nearestPolice.place);
                        setIsOpen(false);
                      }}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-xs"
                    >
                      View on Map
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* SMS Share Location */}
            <a
              href={`sms:?body=${smsBody}`}
              className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-xl text-sm border border-slate-700 transition-colors"
            >
              💬 {labels.shareLocation}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
