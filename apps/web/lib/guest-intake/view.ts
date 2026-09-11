/**
 * INTAKE-01 (staff side) - how a guest clinical intake READS on a staff screen.
 *
 * PURE ON PURPOSE. No database and no `server-only`: the reception queue that
 * shows these answers is a client component, and a RUNTIME import of
 * `@osteojp/db` anywhere a client component reaches pulls the postgres driver
 * into the browser bundle. The only thing taken from `@osteojp/db` here is a
 * TYPE (`import type`, erased at compile time). The server reads the row, builds
 * the display here, and hands the client a plain object.
 *
 * THREE RULES THIS FILE EXISTS TO HOLD (SPEC-guest-clinical-intake sections 3
 * and 5, Strategy 2026-09-07 ruling 2):
 *   1. VERBATIM. Free text is shown exactly as the person typed it: not trimmed,
 *      not reflowed, not summarised. It is what they said, not what we made of it.
 *   2. ATTRIBUTED AND DATED. Every block says it is the person's own declaration
 *      and when it arrived, so it is never mistaken for a clinician's finding.
 *   3. NEVER A BLANK. `nao_perguntado` (never asked) renders in WORDS, distinct
 *      from "Não", and an optional question left empty renders as "Sem resposta".
 *      A blank beside a clinical safety question reads as "no".
 *
 * AND ONE THING IT NEVER DOES: derive a contraindication. An intake answer is
 * "the person said so"; the ficha's contraindication flags are "a clinician
 * confirmed it". Nothing here, or anywhere that uses this, sets those flags.
 */
import type { GuestIntakeRecord, IntakeAnswer } from "@osteojp/db";
import { s } from "@/lib/i18n";

export type { GuestIntakeRecord, IntakeAnswer };

export type GuestIntakeField =
  | "dateOfBirth"
  | "reason"
  | "healthConditions"
  | "medication"
  | "fallsAccidents"
  | "surgeries"
  | "pacemaker"
  | "pregnancy";

export type GuestIntakeDisplayRow = {
  field: GuestIntakeField;
  label: string;
  value: string;
  /**
   * A safety question whose answer is anything but a plain "Não". "Sim" and
   * "Nunca perguntado" both want a clinician's eye before NESA.
   */
  emphasis: boolean;
};

export type GuestIntakeDisplay = {
  requestId: string;
  attribution: string;
  caveat: string;
  rows: GuestIntakeDisplayRow[];
  /** Received-at, consent-at and consent version, in that order. */
  meta: { label: string; value: string }[];
};

/** The words for a three-state answer. Exhaustive: a new label fails to compile. */
export function intakeAnswerWords(answer: IntakeAnswer): string {
  switch (answer) {
    case "sim":
      return s["guestIntake.answer.sim"];
    case "nao":
      return s["guestIntake.answer.nao"];
    case "nao_perguntado":
      return s["guestIntake.answer.naoPerguntado"];
  }
}

/** Optional free text: verbatim when present, words when absent. Never "". */
function freeText(value: string | null): string {
  if (value === null || value.trim() === "") return s["guestIntake.noAnswer"];
  return value;
}

/** "1980-02-29" -> "29/02/1980" by string, never through a Date. */
function formatDateOfBirth(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoDate;
}

// Europe/Lisbon for display, like every other staff instant (CLAUDE.md).
const instantFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatIntakeInstant(iso: string): string {
  return instantFmt.format(new Date(iso));
}

export function toGuestIntakeDisplay(r: GuestIntakeRecord): GuestIntakeDisplay {
  const answerRow = (field: "pacemaker" | "pregnancy", answer: IntakeAnswer): GuestIntakeDisplayRow => ({
    field,
    label: s[field === "pacemaker" ? "guestIntake.pacemaker" : "guestIntake.pregnancy"],
    value: intakeAnswerWords(answer),
    emphasis: answer !== "nao",
  });
  return {
    requestId: r.guestBookingRequestId,
    attribution: s["guestIntake.attribution"],
    caveat: s["guestIntake.caveat"],
    rows: [
      { field: "dateOfBirth", label: s["guestIntake.dateOfBirth"], value: formatDateOfBirth(r.dateOfBirth), emphasis: false },
      // NOT NULL and non-blank in 0087, so verbatim with no fallback needed; the
      // fallback is still applied so a row from any other route cannot render "".
      { field: "reason", label: s["guestIntake.reason"], value: freeText(r.reason), emphasis: false },
      { field: "healthConditions", label: s["guestIntake.healthConditions"], value: freeText(r.healthConditions), emphasis: false },
      { field: "medication", label: s["guestIntake.medication"], value: freeText(r.medication), emphasis: false },
      { field: "fallsAccidents", label: s["guestIntake.fallsAccidents"], value: freeText(r.fallsAccidents), emphasis: false },
      { field: "surgeries", label: s["guestIntake.surgeries"], value: freeText(r.surgeries), emphasis: false },
      answerRow("pacemaker", r.pacemaker),
      answerRow("pregnancy", r.pregnancy),
    ],
    meta: [
      { label: s["guestIntake.receivedAt"], value: formatIntakeInstant(r.createdAt) },
      { label: s["guestIntake.consentAt"], value: formatIntakeInstant(r.consentAt) },
      { label: s["guestIntake.consentVersion"], value: r.consentVersion },
    ],
  };
}
