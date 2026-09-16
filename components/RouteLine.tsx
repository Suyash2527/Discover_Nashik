"use client";
// Draws the route polyline in saffron and fits the map to it. Must render
// inside <Map>. Leaves no trace when `polyline` becomes null.
import { useEffect } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

const SAFFRON = "#E26A12";

export default function RouteLine({ polyline, destination }: { polyline: string | null; destination?: google.maps.LatLngLiteral }) {
  const map = useMap();
  const geometry = useMapsLibrary("geometry");

  useEffect(() => {
    if (!map || !geometry || !polyline) return;
    const path = geometry.encoding.decodePath(polyline);
    // White casing under the saffron line keeps it readable over roads and parks.
    const casing = new google.maps.Polyline({ path, strokeColor: "#FFFFFF", strokeOpacity: 1, strokeWeight: 10, zIndex: 1, map });
    const line = new google.maps.Polyline({ path, strokeColor: SAFFRON, strokeOpacity: 0.95, strokeWeight: 6, zIndex: 2, map });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    if (destination) bounds.extend(destination);
    const div = map.getDiv();
    // Keep the route clear of whatever covers the bottom of the map (the phone
    // sheet, marked data-map-overlay); on desktop that element is hidden.
    const mapBox = div.getBoundingClientRect();
    const overlay = document.querySelector<HTMLElement>("[data-map-overlay]")?.getBoundingClientRect();
    const covered = overlay && overlay.height > 0 ? Math.max(0, mapBox.bottom - overlay.top) : 0;
    const bottom = Math.min(covered + 40, Math.round(mapBox.height * 0.8));
    const pad = { top: 90, left: 50, right: 50, bottom: Math.max(60, bottom) };
    map.fitBounds(bounds, pad);

    return () => { casing.setMap(null); line.setMap(null); };
  }, [map, geometry, polyline, destination]);

  return null;
}
