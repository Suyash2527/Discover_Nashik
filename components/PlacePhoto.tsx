"use client";
// Large photo at the top of the place sheet, with its credit line.
//   1. data/photos.json (Wikimedia, bundled, cached offline by the SW)
//   2. /api/place-photo (Google Places) when online
//   3. otherwise the category icon on its colour
import { useEffect, useState } from "react";
import photosData from "@/data/photos.json";
import type { Place } from "@/types/place";
import type { Lang } from "@/types/voice";
import { CategoryIcon, categoryColor } from "./icons";
import { pick } from "./copy";

interface Photo {
  src: string;
  source: "wikimedia" | "google";
  attribution: { text: string; url?: string }[];
}

const WIKI = photosData as Record<string, { src: string; author: string; license: string; sourceUrl: string }>;

function bundled(id: string): Photo | null {
  const p = WIKI[id];
  return p ? { src: p.src, source: "wikimedia", attribution: [{ text: `${p.author} · ${p.license}`, url: p.sourceUrl }] } : null;
}

export default function PlacePhoto({ place, lang }: { place: Place; lang: Lang }) {
  const [remote, setRemote] = useState<{ id: string; photo: Photo | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const local = bundled(place.id);

  useEffect(() => {
    if (local || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    const controller = new AbortController();
    fetch(`/api/place-photo?id=${encodeURIComponent(place.id)}`, { signal: controller.signal })
      .then((r) => (r.status === 200 ? r.json() : null))
      .then((photo: Photo | null) => setRemote({ id: place.id, photo }))
      .catch(() => {});
    return () => controller.abort();
  }, [place.id, local]);

  const photo = local ?? (remote?.id === place.id ? remote.photo : null);
  const show = photo && failed !== photo.src;

  if (!show) {
    return (
      <div
        className="flex aspect-[16/9] max-h-[200px] w-full items-center justify-center text-white md:max-h-[220px]"
        style={{ backgroundColor: categoryColor(place.category) }}
        aria-hidden
      >
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15">
          <CategoryIcon category={place.category} size={44} />
        </span>
      </div>
    );
  }

  return (
    <figure className="m-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- Google photo URLs are remote and short-lived */}
      <img
        src={photo.src}
        alt={pick(lang, `Photo of ${place.name.en}`, `${place.name.hi} की फोटो`, `${place.name.mr} चा फोटो`)}
        className="aspect-[16/9] max-h-[240px] w-full bg-paper-2 object-cover md:max-h-[260px]"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(photo.src)}
      />
      <figcaption className="truncate px-5 pt-1.5 text-[12px] leading-tight text-muted">
        {photo.source === "wikimedia" ? pick(lang, "Photo: ", "फोटो: ", "फोटो: ") : ""}
        {photo.attribution.map((a, i) => (
          <span key={i}>
            {i > 0 && " · "}
            {a.url ? (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline decoration-rule underline-offset-2">
                {a.text}
              </a>
            ) : (
              a.text
            )}
          </span>
        ))}
        {photo.source === "wikimedia" && " · Wikimedia Commons"}
      </figcaption>
    </figure>
  );
}
