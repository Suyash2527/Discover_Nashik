import MapWrapper from '@/components/MapWrapper';
import placesData from '@/data/places.json';
import { Place } from '@/types/place';

export default function Home() {
  return (
    <main className="w-full h-full">
      <MapWrapper places={placesData as Place[]} />
    </main>
  );
}
