// Conversation memory for /api/ask. Shared by the client hook (which records
// turns) and the route (which validates them), so it must stay dependency-free.
//
// Not part of the locked AskRequest contract in /types: the route accepts it as
// an OPTIONAL extra field, so old clients keep working unchanged.

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/** Four question/answer exchanges. */
export const MAX_HISTORY_TURNS = 8;
export const MAX_TURN_CHARS = 300;

/** Validate untrusted input into at most the last MAX_HISTORY_TURNS turns. */
export function parseHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is HistoryTurn =>
        typeof t === "object" && t !== null &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.text === "string" && t.text.trim() !== "",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, MAX_TURN_CHARS) }));
}
