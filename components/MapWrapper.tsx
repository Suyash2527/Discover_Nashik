"use client";
import dynamic from "next/dynamic";
import { Place } from "@/types/place";

const MapClient = dynamic(() => import("./MapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#FFFBF5]">
      <div className="w-10 h-10 border-4 border-gray-200 border-t-[#EA580C] rounded-full animate-spin" />
    </div>
  ),
});

export default function MapWrapper({ places }: { places: Place[] }) {
  return <MapClient places={places} />;
}
