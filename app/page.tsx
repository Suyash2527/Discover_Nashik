import places from "@/data/places.json";

// Placeholder — Antigravity replaces this with the map home screen (H2–6).
export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Discover Nashik</h1>
      <p className="text-sm text-gray-500">{places.length} places loaded. Map coming soon.</p>
    </main>
  );
}
