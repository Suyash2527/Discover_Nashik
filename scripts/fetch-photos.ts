// Fetch a freely licensed Wikimedia Commons photo for each place.
//   npx tsx scripts/fetch-photos.ts            (skips places already in photos.json)
//   npx tsx scripts/fetch-photos.ts --refresh  (re-checks every place)
//
// Candidates come from two Commons queries: files geotagged near the place pin,
// and a text search for "<name> Nashik". A candidate is accepted only if its
// file title or description contains the place's full English name (or a
// long alias), the license is free (CC0 / public domain / CC BY / CC BY-SA —
// no NC or ND), and it is a raster photo. Anything else is skipped and listed
// at the end: a missing photo shows the category icon, a wrong one misleads.
//
// Writes public/photos/<id>.webp (800px wide) and data/photos.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import placesData from "../data/places.json";
import { normalize } from "../lib/text";
import type { Place } from "../types";

const PLACES = placesData as Place[];
const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "DiscoverNashik/0.1 (Kumbh pilgrim PWA; https://github.com/Suyash2527/Discover_Nashik)";
const OUT_DIR = "public/photos";
const JSON_PATH = "data/photos.json";
const WIDTH = 800;

interface PhotoEntry { src: string; author: string; license: string; sourceUrl: string }
interface Candidate {
  title: string;
  description: string;
  thumbUrl: string;
  pageUrl: string;
  mime: string;
  author: string;
  license: string;
  distanceM?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(params: Record<string, string>) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    throw new Error(`Commons API ${res.status}`);
  }
  throw new Error("Commons API kept failing");
}

const stripHtml = (s: unknown) =>
  String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

const IMAGE_INFO = { prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: String(WIDTH) };

function toCandidates(pages: any[], distances = new Map<string, number>()): Candidate[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (pages ?? []).flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) return [];
    const meta = info.extmetadata ?? {};
    return [{
      title: page.title as string,
      description: `${stripHtml(meta.ImageDescription?.value)} ${stripHtml(meta.ObjectName?.value)}`,
      thumbUrl: info.thumburl as string,
      pageUrl: info.descriptionurl as string,
      mime: info.mime as string,
      author: stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || "Unknown author",
      license: stripHtml(meta.LicenseShortName?.value),
      distanceM: distances.get(page.title),
    }];
  });
}

async function candidatesNear(place: Place): Promise<Candidate[]> {
  const geo = await api({
    action: "query", list: "geosearch", gscoord: `${place.lat}|${place.lng}`,
    gsradius: "400", gsnamespace: "6", gslimit: "30",
  });
  const hits: { title: string; dist: number }[] = geo?.query?.geosearch ?? [];
  if (!hits.length) return [];
  const distances = new Map(hits.map((h) => [h.title, h.dist]));
  const info = await api({ action: "query", titles: hits.map((h) => h.title).join("|"), ...IMAGE_INFO });
  return toCandidates(info?.query?.pages, distances);
}

async function candidatesByName(place: Place): Promise<Candidate[]> {
  const res = await api({
    action: "query", generator: "search", gsrsearch: `${place.name.en} Nashik`,
    gsrnamespace: "6", gsrlimit: "15", ...IMAGE_INFO,
  });
  return toCandidates(res?.query?.pages);
}

const compact = (s: string) => normalize(s).replace(/\s+/g, "");

/** Generic words that must never be the only thing a match rests on. */
const GENERIC = new Set(["temple", "mandir", "ghat", "hospital", "station", "parking", "toilet", "police", "nashik", "road", "bus", "stand", "stop"]);

function namesFor(place: Place): string[] {
  const names = [place.name.en, ...place.aliases.filter((a) => /^[\x20-\x7e]+$/.test(a))]
    .map(compact)
    .filter((n) => n.length >= 6)
    .filter((n) => !GENERIC.has(n));
  return [...new Set(names)];
}

function isFreeLicense(license: string): boolean {
  const l = license.toLowerCase();
  if (/\bnc\b|\bnd\b|non-?commercial|no ?deriv|fair use/.test(l)) return false;
  return /cc0|public domain|^pd\b|cc[ -]by(-sa)?|gfdl/.test(l);
}

function matches(place: Place, c: Candidate): boolean {
  const title = compact(c.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""));
  const desc = compact(c.description);
  return namesFor(place).some((n) => title.includes(n) || desc.includes(n));
}

/** Event / construction shots are not a "good photo of the place". */
const NOT_A_PLACE_PHOTO = /inaugurat|ceremony|construction|demolition|excavat|works|dry riverbed|map|plan|logo|poster|document|interior of bus/i;

/** Commons files reviewed by a human and rejected despite a text match. */
const REJECTED_FILES = new Set(["File:Kapila River.jpg"]);

const AREAS = ["panchavati", "panchvati", "trimbak", "trimbakeshwar", "tapovan", "nashik road", "deolali", "devlali", "satpur", "ozar"];

/**
 * A name-search hit that names a different area is a same-named place
 * elsewhere ("Indrakund, Panchvati" is not Indra Kund in Trimbak).
 */
function areaConflict(place: Place, c: Candidate): boolean {
  if (c.distanceM !== undefined) return false; // geotagged near our pin: location confirmed
  const text = normalize(`${c.title} ${c.description}`);
  const own = normalize(`${place.area} ${place.id.replace(/-/g, " ")} ${place.name.en}`);
  const mentioned = AREAS.filter((a) => text.includes(a));
  const ownFamily = (a: string) => own.includes(a.slice(0, 6));
  return mentioned.length > 0 && !mentioned.some(ownFamily);
}

const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);

async function pick(place: Place): Promise<Candidate | null> {
  const seen = new Set<string>();
  const pool = [...await candidatesNear(place), ...await candidatesByName(place)]
    .filter((c) => !seen.has(c.title) && seen.add(c.title));
  const ok = pool.filter((c) => RASTER.has(c.mime) && isFreeLicense(c.license) && matches(place, c)
    && !REJECTED_FILES.has(c.title) && !NOT_A_PLACE_PHOTO.test(c.title) && !areaConflict(place, c));
  if (!ok.length) return null;
  // Prefer geotagged-near (confirms location), then the closest.
  ok.sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9));
  return ok[0];
}

async function download(c: Candidate, id: string): Promise<void> {
  const res = await fetch(c.thumbUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(`${OUT_DIR}/${id}.webp`);
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  mkdirSync(OUT_DIR, { recursive: true });
  let photos: Record<string, PhotoEntry> = {};
  try { photos = JSON.parse(readFileSync(JSON_PATH, "utf8")); } catch { /* first run */ }

  const skipped: { id: string; reason: string }[] = [];
  for (const place of PLACES) {
    if (photos[place.id] && !refresh) continue;
    try {
      const c = await pick(place);
      if (!c) { skipped.push({ id: place.id, reason: "no confidently matching free photo" }); delete photos[place.id]; continue; }
      await download(c, place.id);
      photos[place.id] = { src: `/photos/${place.id}.webp`, author: c.author.slice(0, 120), license: c.license, sourceUrl: c.pageUrl };
      console.log(`  ok    ${place.id}  <- ${c.title}${c.distanceM !== undefined ? ` (${Math.round(c.distanceM)} m)` : ""}`);
    } catch (error) {
      skipped.push({ id: place.id, reason: (error as Error).message });
    }
    await sleep(300); // be polite to Commons
  }

  const sorted = Object.fromEntries(Object.entries(photos).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(JSON_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\n${Object.keys(sorted).length}/${PLACES.length} places have a Wikimedia photo.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s.id}: ${s.reason}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
