// Hard-question evaluation against the REAL /api/ask route handler.
//   npx tsx scripts/eval-hard.ts            (in-process, uses .env.local)
//   EVAL_URL=http://localhost:3000 npx tsx scripts/eval-hard.ts   (running server)
//
// 30 tough questions in en/hi/mr: multi-part, follow-ups (history is chained
// from the route's own previous answer), safety, "open chemist at night",
// comparisons, live conditions, and trick questions about places we don't have.
//
// Prints every answer plus cheap automatic checks. These are smoke checks, not
// a grade — the answers are printed so a human can judge quality.
import "./load-env";
import { devanagariRatio, findUnknownPhoneNumbers, hindiOrMarathi } from "../lib/answer-guard";
import { clampSentences, classifyComplexity } from "../lib/gemini";
import type { HistoryTurn } from "../lib/history";
import { PLACES } from "../lib/rag";
import type { AskResponse, Lang } from "../types";

/** Panchavati, a few hundred metres from Ramkund. */
const PANCHAVATI = { lat: 20.0035, lng: 73.7905 };

interface Case {
  q: string;
  lang: Lang;
  note: string;
  /** Continue the conversation from the previous case's question + answer. */
  followUp?: boolean;
  origin?: boolean;
  /** Any of these must appear (case-insensitive). */
  expectAny?: string[];
  /** None of these may appear. */
  forbid?: string[];
}

const CASES: Case[] = [
  // --- multi-part / comparison / reasoning -------------------------------
  { q: "Where is Ramkund and when is the next Amrit Snan?", lang: "en-IN", note: "multi-part", expectAny: ["2027", "2026"] },
  { q: "Which is better for my 75-year-old mother, bathing at Ramkund or Kushavarta, and why?", lang: "en-IN", note: "comparison + reasoning" },
  { q: "I have one day in Nashik. Should I visit Trimbakeshwar or stay in Panchavati?", lang: "en-IN", note: "planning trade-off", expectAny: ["28", "trimbak"] },
  { q: "रामकुंड और कालाराम मंदिर में से पहले कहाँ जाएं और क्यों?", lang: "hi-IN", note: "hi comparison" },
  { q: "शैव आणि वैष्णव आखाडे वेगवेगळ्या ठिकाणी स्नान का करतात?", lang: "mr-IN", note: "mr why-question", expectAny: ["1789", "रामकुंड", "कुशावर्त"] },

  // --- follow-ups -----------------------------------------------------------
  { q: "Where is Kalaram Mandir?", lang: "en-IN", note: "follow-up setup", origin: true },
  { q: "How far is it from me?", lang: "en-IN", note: "follow-up: distance", followUp: true, origin: true, expectAny: ["m", "km"] },
  { q: "Is it open right now?", lang: "en-IN", note: "follow-up: open now", followUp: true, origin: true },
  { q: "त्र्यंबकेश्वर मंदिर कहाँ है?", lang: "hi-IN", note: "hi follow-up setup" },
  { q: "वहाँ नासिक से कैसे पहुंचें?", lang: "hi-IN", note: "hi follow-up: transport", followUp: true, expectAny: ["28"] },
  { q: "नाशिकमध्ये जवळचे मेडिकल दुकान कोणते?", lang: "mr-IN", note: "mr follow-up setup", origin: true },
  { q: "ते आत्ता उघडे आहे का?", lang: "mr-IN", note: "mr follow-up: open now", followUp: true, origin: true },

  // --- safety -------------------------------------------------------------
  { q: "My 8 year old son is lost near Ramkund, what do I do?", lang: "en-IN", note: "missing child", expectAny: ["112"] },
  { q: "Someone collapsed in the crowd and is not breathing!", lang: "en-IN", note: "medical emergency", expectAny: ["108", "112"] },
  { q: "भीड़ में धक्का-मुक्की हो रही है, मैं अपने बुजुर्ग पिता के साथ हूँ, क्या करूँ?", lang: "hi-IN", note: "hi crowd crush" },
  { q: "एक माणूस माझा पाठलाग करत आहे, मदत करा", lang: "mr-IN", note: "mr harassment", expectAny: ["112"] },
  { q: "Is it safe to go deep into the Godavari for the holy dip?", lang: "en-IN", note: "river safety" },

  // --- nearest / open at night ------------------------------------------
  { q: "Nearest chemist open at night?", lang: "en-IN", note: "open chemist at night", origin: true },
  { q: "रात को खुला हुआ सबसे नज़दीकी अस्पताल कौन सा है?", lang: "hi-IN", note: "hi open hospital at night", origin: true },
  { q: "जवळचे पोलीस स्टेशन किती अंतरावर आहे?", lang: "mr-IN", note: "mr nearest police distance", origin: true },

  // --- live conditions (search grounding) --------------------------------
  { q: "What's the weather in Nashik today, do I need an umbrella?", lang: "en-IN", note: "live weather" },
  { q: "नाशिक में आज ट्रैफिक कैसा है?", lang: "hi-IN", note: "hi live traffic" },

  // --- facts / dates ------------------------------------------------------
  { q: "What are the exact Amrit Snan dates for Simhastha 2027?", lang: "en-IN", note: "official dates", expectAny: ["2 August", "August 2"] },
  { q: "कुंभ मेळा दर किती वर्षांनी नाशिकला भरतो आणि त्याला सिंहस्थ का म्हणतात?", lang: "mr-IN", note: "mr multi-part facts", expectAny: ["12", "१२"] },
  { q: "What should I carry and wear for the snan in August?", lang: "en-IN", note: "carry + weather (seasonal)" },

  // --- trick questions ----------------------------------------------------
  { q: "How do I get to the Taj Mahal Palace hotel in Nashik?", lang: "en-IN", note: "trick: place not in data", forbid: ["taj mahal palace is"] },
  { q: "What is the phone number of Ramkund police chowki?", lang: "en-IN", note: "trick: invent phone number" },
  { q: "How much does a room at a dharamshala in Panchavati cost?", lang: "en-IN", note: "trick: invent price", forbid: ["₹", "rs.", "rupees"] },
  { q: "नासिक में इस्कॉन मंदिर का टिकट कितने का है?", lang: "hi-IN", note: "hi trick: ticket price", forbid: ["₹", "रुपये"] },
  { q: "The 2027 Kumbh ends on 15 August 2027, right?", lang: "en-IN", note: "trick: false premise date" },
];

// ---------------------------------------------------------------------------

const ALLOWED_PHONES = PLACES.flatMap((p) => (p.phone ? [p.phone] : []));

function languageOk(answer: string, lang: Lang): { ok: boolean; why: string } {
  const ratio = devanagariRatio(answer);
  if (lang === "en-IN") return { ok: ratio < 0.2, why: `devanagari ${Math.round(ratio * 100)}%` };
  if (ratio < 0.7) return { ok: false, why: `devanagari only ${Math.round(ratio * 100)}%` };
  const guess = hindiOrMarathi(answer);
  const want = lang === "hi-IN" ? "hi" : "mr";
  return { ok: guess === want || guess === "?", why: `looks ${guess}` };
}

function sentenceCount(answer: string): number {
  return (answer.match(/(?:[^.!?।]|\.(?=[\d०-९]))+(?:[.!?।]+|$)/g) ?? []).filter((s) => s.trim()).length;
}

async function ask(body: Record<string, unknown>): Promise<{ res: AskResponse; ms: number }> {
  const started = Date.now();
  if (process.env.EVAL_URL) {
    const r = await fetch(`${process.env.EVAL_URL.replace(/\/$/, "")}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res: (await r.json()) as AskResponse, ms: Date.now() - started };
  }
  const { POST } = await import("../app/api/ask/route");
  const r = await POST(new Request("http://localhost/api/ask", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never);
  return { res: (await r.json()) as AskResponse, ms: Date.now() - started };
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.EVAL_URL) {
    console.warn("GEMINI_API_KEY not set: every answer will be the offline fallback.\n");
  }

  let history: HistoryTurn[] = [];
  let failedChecks = 0;
  const summary: string[] = [];

  for (const [i, c] of CASES.entries()) {
    if (!c.followUp) history = [];
    const body = {
      query: c.q,
      lang: c.lang,
      ...(c.origin && PANCHAVATI),
      ...(history.length && { history }),
    };
    const { res, ms } = await ask(body);
    const answer = res.answer ?? "";

    const complexity = classifyComplexity(c.q);
    const maxSentences = complexity === "complex" ? 4 : 2;
    const lang = languageOk(answer, c.lang);
    const invented = findUnknownPhoneNumbers(answer, ALLOWED_PHONES);
    const sentences = sentenceCount(answer);
    // Devanagari digits count: "११२" is 112.
    const lower = answer.toLowerCase().replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));

    const checks: Array<[string, boolean, string]> = [
      ["language", lang.ok, lang.why],
      ["no invented numbers", invented.length === 0, invented.join(", ")],
      [`≤${maxSentences} sentences`, sentences <= maxSentences && clampSentences(answer, maxSentences) === answer, `${sentences}`],
      ["≤ 3.2 s", ms <= 3200, `${ms} ms`],
    ];
    if (c.expectAny) {
      checks.push(["expected content", c.expectAny.some((e) => lower.includes(e.toLowerCase())), `wanted one of ${c.expectAny.join(" / ")}`]);
    }
    if (c.forbid) {
      const hit = c.forbid.filter((f) => lower.includes(f.toLowerCase()));
      checks.push(["no forbidden content", hit.length === 0, hit.join(", ")]);
    }

    const failed = checks.filter(([, ok]) => !ok);
    failedChecks += failed.length;

    console.log(`\n#${i + 1} [${c.lang}] (${c.note}; ${complexity}${c.followUp ? "; follow-up" : ""})`);
    console.log(`Q: ${c.q}`);
    console.log(`A: ${answer}`);
    console.log(`   source=${res.source} ${ms}ms pins=${res.placeIds.slice(0, 3).join(",") || "-"}`);
    console.log(`   ${checks.map(([name, ok, why]) => `${ok ? "✓" : "✗"} ${name}${ok ? "" : ` (${why})`}`).join("  ")}`);
    summary.push(`${failed.length ? "✗" : "✓"} #${i + 1} ${c.note}`);

    history = [...history, { role: "user" as const, text: c.q }, { role: "assistant" as const, text: answer }].slice(-8);
  }

  console.log(`\n${summary.join("\n")}`);
  console.log(`\n${failedChecks} automatic check(s) failed across ${CASES.length} questions.`);
}

void main();
