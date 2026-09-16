"use client";
import dynamic from "next/dynamic";
import { Place } from "@/types/place";

const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-paper">
      <div className="w-10 h-10 border-4 hidden" />
    </div>
  ),
});

export default function MapWrapper({ places }: { places: Place[] }) {
  return <MapClient places={places} />;
}
