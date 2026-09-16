// Active advisories for the answer prompt. Server-only.
//
// Read through the Firestore REST API rather than the Firebase SDK: lib/firebase.ts
// is the UI's client module, and pulling the SDK into the route to read one
// collection would cost more cold-start time than the whole answer budget allows.
//
// This must never slow down or break an answer. It has its own short timeout,
// caches for a minute (advisories change by the hour, questions by the second),
// and any failure — no project configured, rules deny, offline — is simply "no
// advisories".
import type { Advisory, Severity } from "@/types";

const TIMEOUT_MS = 700;
const CACHE_MS = 60_000;

let cache: { at: number; items: Advisory[] } | null = null;

type FsValue = { stringValue?: string; timestampValue?: string; mapValue?: { fields?: Record<string, FsValue> } };

const str = (v?: FsValue) => v?.stringValue ?? v?.timestampValue ?? "";

function fromDocument(doc: { name: string; fields?: Record<string, FsValue> }): Advisory | null {
  const f = doc.fields ?? {};
  const msg = f.message?.mapValue?.fields ?? {};
  const message = { en: str(msg.en), hi: str(msg.hi), mr: str(msg.mr) };
  if (!message.en && !message.hi && !message.mr) return null;
  return {
    id: doc.name.split("/").pop() ?? "",
    ...(str(f.placeId) && { placeId: str(f.placeId) }),
    message,
    severity: (str(f.severity) || "info") as Severity,
    startsAt: str(f.startsAt),
    endsAt: str(f.endsAt),
    createdBy: str(f.createdBy),
  };
}

export function isActive(a: Advisory, now = Date.now()): boolean {
  const start = a.startsAt ? Date.parse(a.startsAt) : -Infinity;
  const end = a.endsAt ? Date.parse(a.endsAt) : Infinity;
  return (Number.isNaN(start) || start <= now) && (Number.isNaN(end) || now < end);
}

/** Currently active advisories, or [] on any problem. Never rejects. */
export async function getActiveAdvisories(): Promise<Advisory[]> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return [];

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.items.filter((a) => isActive(a));
  }

  try {
    const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const url =
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/databases/(default)/documents/advisories?pageSize=100${key ? `&key=${key}` : ""}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`firestore ${res.status}`);
    const body = (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, FsValue> }> };
    const items = (body.documents ?? []).map(fromDocument).filter((a): a is Advisory => a !== null);
    cache = { at: Date.now(), items };
    return items.filter((a) => isActive(a));
  } catch (error) {
    console.warn("[advisories] unavailable, answering without them:", (error as Error).message);
    // Cache the miss too, so a denied/unreachable Firestore is not retried on
    // every question.
    cache = { at: Date.now(), items: [] };
    return [];
  }
}
