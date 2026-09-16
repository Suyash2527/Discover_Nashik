"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc } from "firebase/firestore";
import type { Advisory, Severity } from "@/types/advisory";
import type { Place } from "@/types/place";
import placesData from "@/data/places.json";
import { auth, db, firebaseEnabled, isAdminEmail } from "@/lib/firebase";
import { SEVERITY_COLOR, useActiveAdvisories } from "@/components/AdvisoryBanner";
import { AlertCircleIcon, CategoryIcon, categoryColor, XIcon } from "@/components/icons";

const places = (placesData as Place[]).slice().sort((a, b) => a.name.en.localeCompare(b.name.en));
const SEVERITIES: Severity[] = ["info", "warning", "closed"];
const MESSAGE_FIELDS = [
  { key: "en", label: "Message (English)", placeholder: "Ramkund closed 4–7am" },
  { key: "hi", label: "संदेश (हिन्दी)", placeholder: "रामकुंड सुबह 4–7 बजे बंद" },
  { key: "mr", label: "संदेश (मराठी)", placeholder: "रामकुंड सकाळी 4–7 बंद" },
] as const;

/** <input type="datetime-local"> value for a Date, in the browser's local zone. */
function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const field = "h-12 w-full rounded-md border border-rule bg-card px-3 text-[17px] outline-none focus:border-ink";

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  // False during SSR and hydration, true after — so the first client render always matches the server HTML.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [authReady, setAuthReady] = useState(false);
  const ready = mounted && (!firebaseEnabled || authReady);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(auth(), (u) => { setUser(u); setAuthReady(true); });
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-paper">
      <div className="mx-auto max-w-2xl px-4 pt-4 pb-16 md:px-6 md:pt-8">
        <header className="flex items-end justify-between border-b border-rule pb-3">
          <div className="leading-none">
            <p className="kicker">Kumbh guide · Admin</p>
            <h1 className="font-display text-[28px] leading-[1.05] md:text-[34px]">Advisories</h1>
          </div>
          {user && (
            <button onClick={() => signOut(auth())} className="pb-1 text-[14px] text-muted underline underline-offset-4">
              Sign out
            </button>
          )}
        </header>

        {!ready ? (
          <p className="kicker mt-6">Loading</p>
        ) : !firebaseEnabled ? (
          <Notice>Firebase is not configured. Fill the NEXT_PUBLIC_FIREBASE_* values in .env.local, then restart the dev server.</Notice>
        ) : !user ? (
          <SignIn />
        ) : !isAdminEmail(user.email) ? (
          <Notice>
            {user.email} is not on the admin list.{" "}
            <button onClick={() => signOut(auth())} className="underline">Use another account</button>
          </Notice>
        ) : (
          <>
            <AdvisoryForm email={user.email!} />
            <ActiveList />
          </>
        )}
      </div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-md border border-rule bg-card px-4 py-3 text-[16px]">{children}</div>;
}

function SignIn() {
  const [error, setError] = useState("");
  return (
    <div className="mt-8">
      <p className="text-[17px] text-ink-2">Only approved officials can post advisories.</p>
      <button
        onClick={() => signInWithPopup(auth(), new GoogleAuthProvider()).catch((e) => setError(e.message))}
        className="mt-4 flex h-[50px] w-full items-center justify-center rounded-md bg-ink text-[16px] font-semibold text-paper active:opacity-90 md:w-auto md:px-8"
      >
        Sign in with Google
      </button>
      {error && <p className="mt-3 text-[14px] text-kumkum">{error}</p>}
    </div>
  );
}

function AdvisoryForm({ email }: { email: string }) {
  const now = useMemo(() => new Date(), []);
  const [placeId, setPlaceId] = useState("");
  const [msg, setMsg] = useState({ en: "", hi: "", mr: "" });
  const [severity, setSeverity] = useState<Severity>("warning");
  const [startsAt, setStartsAt] = useState(toLocalInput(now));
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(now.getTime() + 3 * 3600_000)));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const place = places.find((p) => p.id === placeId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(startsAt), end = new Date(endsAt);
    if (end <= start) return setStatus({ ok: false, text: "End time must be after start time." });
    const en = msg.en.trim();
    // Hindi / Marathi fall back to English so the banner never shows an empty line.
    const message = { en, hi: msg.hi.trim() || en, mr: msg.mr.trim() || en };
    const data: Omit<Advisory, "id"> = {
      ...(placeId ? { placeId } : {}),
      message,
      severity,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      createdBy: email,
    };
    setBusy(true);
    try {
      await addDoc(collection(db(), "advisories"), data);
      setStatus({ ok: true, text: "Posted. Pilgrims will see it now." });
      setMsg({ en: "", hi: "", mr: "" });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <h2 className="kicker">New advisory</h2>

      <label className="block">
        <span className="mb-1 block text-[15px] font-medium">Place</span>
        <div className="flex items-center gap-2">
          {place && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: categoryColor(place.category) }}>
              <CategoryIcon category={place.category} size={18} />
            </span>
          )}
          <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className={field}>
            <option value="">Whole city (no specific place)</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>{p.name.en} — {p.area}</option>
            ))}
          </select>
        </div>
      </label>

      <fieldset>
        <legend className="mb-1 text-[15px] font-medium">Severity</legend>
        <div className="grid grid-cols-3 gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={severity === s}
              onClick={() => setSeverity(s)}
              className="flex h-12 items-center justify-center gap-1.5 rounded-md border text-[16px] font-semibold capitalize"
              style={severity === s
                ? { backgroundColor: SEVERITY_COLOR[s], borderColor: SEVERITY_COLOR[s], color: "var(--card)" }
                : { borderColor: "var(--rule)", color: SEVERITY_COLOR[s], backgroundColor: "var(--card)" }}
            >
              <AlertCircleIcon size={17} /> {s}
            </button>
          ))}
        </div>
      </fieldset>

      {MESSAGE_FIELDS.map(({ key, label, placeholder }) => (
        <label key={key} className="block">
          <span className="mb-1 block text-[15px] font-medium">{label}</span>
          <input
            required={key === "en"}
            maxLength={160}
            value={msg[key]}
            placeholder={placeholder}
            onChange={(e) => setMsg((m) => ({ ...m, [key]: e.target.value }))}
            className={field}
          />
        </label>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[15px] font-medium">Starts</span>
          <input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[15px] font-medium">Ends</span>
          <input type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} />
        </label>
      </div>

      <button disabled={busy} className="flex h-[50px] w-full items-center justify-center rounded-md bg-ink text-[16px] font-semibold text-paper disabled:opacity-60">
        {busy ? "Posting…" : "Post advisory"}
      </button>
      {status && <p className={`text-[15px] ${status.ok ? "text-river" : "text-kumkum"}`}>{status.text}</p>}
    </form>
  );
}

function ActiveList() {
  const active = useActiveAdvisories();
  return (
    <section className="mt-10">
      <h2 className="kicker pb-2"><span className="tnum">{active.length}</span> active</h2>
      <ul className="border-t border-rule">
        {active.length === 0 && <li className="py-4 text-[16px] text-muted">No active advisories.</li>}
        {active.map((a) => {
          const p = places.find((x) => x.id === a.placeId);
          return (
            <li key={a.id} className="flex items-start gap-3 border-b border-rule py-3">
              <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[a.severity] }} />
              <div className="min-w-0 flex-1">
                <p className="kicker">{a.severity} · {p ? p.name.en : "Whole city"}</p>
                <p className="text-[17px] font-medium">{a.message.en}</p>
                <p className="tnum text-[13px] text-muted">{fmt(a.startsAt)} → {fmt(a.endsAt)} · {a.createdBy}</p>
              </div>
              <button
                onClick={() => { if (confirm(`Delete "${a.message.en}"?`)) void deleteDoc(doc(db(), "advisories", a.id)); }}
                aria-label="Delete advisory"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule text-kumkum active:bg-paper-2"
              >
                <XIcon size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
