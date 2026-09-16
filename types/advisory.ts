// LOCKED CONTRACT — do not edit without team agreement.
import type { Localized } from "./place";

export type Severity = "info" | "warning" | "closed";

export interface Advisory {
  id: string;
  placeId?: string;
  message: Localized;
  severity: Severity;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  createdBy: string;
}
