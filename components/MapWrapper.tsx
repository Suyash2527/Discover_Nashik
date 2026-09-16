"use client";
import dynamic from 'next/dynamic';
import { Place } from '@/types/place';

// Dynamic import with ssr: false is only allowed inside Client Components in Next.js 16
const MapClient = dynamic(() => import('./MapClient'), { ssr: false });

export default function MapWrapper({ places }: { places: Place[] }) {
  return <MapClient places={places} />;
}
