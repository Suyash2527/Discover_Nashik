import { readFileSync } from "node:fs";
import { CATEGORIES, type Place } from "../types";

const places: Place[] = JSON.parse(readFileSync("data/places.json", "utf8"));
const BBOX = { minLat: 19.8, maxLat: 20.13, minLng: 73.4, maxLng: 73.95 };
const errors: string[] = [];
const warnings: string[] = [];
const seen = new Set<string>();

for (const [i, p] of places.entries()) {
  const at = `#${i + 2} (${p.id || "no-id"})`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errors.push(`${at}: id must be kebab-case`);
  if (seen.has(p.id)) errors.push(`${at}: duplicate id`);
  seen.add(p.id);
  if (!CATEGORIES.includes(p.category)) errors.push(`${at}: bad category "${p.category}"`);
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) errors.push(`${at}: lat/lng not numbers`);
  else if (p.lat < BBOX.minLat || p.lat > BBOX.maxLat || p.lng < BBOX.minLng || p.lng > BBOX.maxLng)
    errors.push(`${at}: coordinates outside Nashik bbox`);
  for (const l of ["en", "hi", "mr"] as const) {
    if (!p.name[l]) errors.push(`${at}: missing name.${l}`);
    if (!p.description[l]) errors.push(`${at}: missing description.${l}`);
  }
  if (!p.area) errors.push(`${at}: missing area`);
  if (p.aliases.length === 0) warnings.push(`${at}: no aliases (hurts voice matching)`);
  if (!p.verified.by || /UNVERIFIED/i.test(p.verified.by) || !p.verified.source)
    warnings.push(`${at}: not verified yet`);
}

const counts = Object.fromEntries(CATEGORIES.map((c) => [c, places.filter((p) => p.category === c).length]));
console.log(`Places: ${places.length}`, counts);
warnings.forEach((w) => console.warn("⚠", w));
if (errors.length) {
  errors.forEach((e) => console.error("✖", e));
  process.exit(1);
}
console.log("✔ places.json valid");
