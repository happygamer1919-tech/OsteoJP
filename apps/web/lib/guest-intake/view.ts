/**
 * INTAKE-01 (staff side) - how a guest clinical intake READS on a staff screen.
 *
 * PURE ON PURPOSE. No database, no `server-only`: the reception queue that shows
 * these answers is a client component, and importing `@osteojp/db` into anything
 * a client component reaches pulls the postgres driver into the browser bundle.
 * The server reads the row (`./queries.ts`), builds the display here, and hands
 * the client a plain object.
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
import { s } from "@/lib/i18n";

/** 0087's enum `public.intake_answer`, label for label. */
export const INTAKE_ANSWERS = ["sim", "nao", "nao_perguntado"] as const;
export type IntakeAnswer = (typeof INTAKE_ANSWERS)[number];

/** One `guest_clinical_intakes` row, as the staff reads select it. */
export type GuestIntakeRecord = {
  guestBookingRequestId: string;
  /** YYYY-MM-DD, as stored. Never passed through a Date, so no zone can shift it. */
  dateOfBirth: string;
  reason: string;
  healthConditions: string | null;
  medication: string | null;
  fallsAccidents: string | null;
  surgeries: string | null;
  pacemaker: IntakeAnswer;
  pregnancy: IntakeAnswer;
  consentVersion: string;
  /** ISO 8601, UTC. */
  consentAt: string;
  /** ISO 8601, UTC. When the intake ARRIVED; the retention clock runs on it. */
  createdAt: string;
};

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

function isIntakeAnswer(value: unknown): value is IntakeAnswer {
  return typeof value === "string" && (INTAKE_ANSWERS as readonly string[]).includes(value);
}

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

/**
 * Narrows one raw row from the staff reads. It REFUSES rather than coerces: an
 * answer label this file does not know is a schema change nobody carried here,
 * and guessing its words would put a claim on a clinical screen that nobody made.
 *
 * THE ERROR NAMES THE FIELD, NEVER THE VALUE. The value is an Article 9 answer.
 */
export function parseGuestIntakeRow(raw: Record<string, unknown>): GuestIntakeRecord {
  const str = (key: string): string => {
    const v = raw[key];
    if (typeof v !== "string") throw new Error(`guest intake row: ${key} is not text`);
    return v;
  };
  const optional = (key: string): string | null => {
    const v = raw[key];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") throw new Error(`guest intake row: ${key} is not text`);
    return v;
  };
  const answer = (key: string): IntakeAnswer => {
    const v = raw[key];
    if (!isIntakeAnswer(v)) throw new Error(`guest intake row: ${key} is not a known intake_answer label`);
    return v;
  };
  return {
    guestBookingRequestId: str("guest_booking_request_id"),
    dateOfBirth: str("date_of_birth"),
    reason: str("reason"),
    healthConditions: optional("health_conditions"),
    medication: optional("medication"),
    fallsAccidents: optional("falls_accidents"),
    surgeries: optional("surgeries"),
    pacemaker: answer("pacemaker"),
    pregnancy: answer("pregnancy"),
    consentVersion: str("consent_version"),
    consentAt: str("consent_at"),
    createdAt: str("created_at"),
  };
}
