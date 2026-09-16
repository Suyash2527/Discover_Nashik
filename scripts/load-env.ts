// Side-effect import: loads .env.local into process.env for the tsx test
// scripts. Next.js does this automatically for the app, but plain `tsx` does
// not — so without this, test-general silently skipped its live Gemini check
// even with GEMINI_API_KEY set. Must be the FIRST import in a script: ES
// imports are hoisted, and lib/gemini.ts reads the key at module load.
//
// process.loadEnvFile never overrides a variable already set in the shell, and
// a missing file (CI, a fresh clone) is fine — the scripts then run offline.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: run without live keys.
}
