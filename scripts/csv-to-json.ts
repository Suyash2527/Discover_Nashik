import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "./csv";
import type { Category, Place } from "../types";

const bool = (v: string) => /^(true|yes|1|y)$/i.test(v);
const rows = parseCsv(readFileSync("data/places.raw.csv", "utf8"));

const places: Place[] = rows.map((r) => ({
  id: r.id,
  name: { en: r.name_en, hi: r.name_hi, mr: r.name_mr },
  aliases: r.aliases ? r.aliases.split("|").map((a) => a.trim()).filter(Boolean) : [],
  category: r.category as Category,
  lat: Number(r.lat),
  lng: Number(r.lng),
  area: r.area,
  description: { en: r.desc_en, hi: r.desc_hi, mr: r.desc_mr },
  ...(r.timings && { timings: r.timings }),
  ...(r.phone && { phone: r.phone }),
  ...(r.open24x7 && { open24x7: bool(r.open24x7) }),
  ...(r.accessible && { accessible: bool(r.accessible) }),
  verified: { by: r.verified_by, on: r.verified_on, source: r.verified_source },
}));

writeFileSync("data/places.json", JSON.stringify(places, null, 2) + "\n");
console.log(`✔ wrote ${places.length} places to data/places.json`);
