import {
  compareCalendarDates,
  formatCalendarDate,
  parseCalendarDate,
  type CalendarDate,
  type GuestIntakeAnswer,
} from "@osteojp/db";
import { isIntakeConsentVersion, type IntakeConsentVersion } from "@osteojp/i18n";

/**
 * INTAKE-01 - the `intake` object on POST /api/v1/booking/guest, validated.
 *
 * THE WIRE CONTRACT (BLUE's brief, Z1). One nested object on the existing body:
 *
 *   "intake": { "dateOfBirth": "YYYY-MM-DD", "reason": "...",
 *               "healthConditions": "..."|null, "medication": "..."|null,
 *               "fallsAccidents": "..."|null, "surgeries": "..."|null,
 *               "pacemaker": "sim"|"nao", "pregnancy": "sim"|"nao",
 *               "consentVersion": "<label>" }
 *
 * EVERY CHECK MIRRORS A CHECK IN 0087, so a value this accepts is a value the
 * table accepts. The database is the last word; this is what makes a refusal a
 * clean 400 instead of a failed transaction.
 *
 * THE ANSWER IS A BOOLEAN AND NOTHING ELSE. A refusal carries no reason, no
 * field name and no value: this is Article 9 health data, and the route's error
 * vocabulary is closed (`invalid_input`). A caller learns that its OWN input was
 * refused and never which part, which also keeps the refusal free of anything
 * that could be logged or echoed.
 *
 * WHAT IS NOT ON THE WIRE, and why. No `consentAt`, no `consentTicked`: the
 * route sets both server-side at the insert. A body that carries them is not
 * refused; the keys are never read, so they cannot change what is stored.
 */

/**
 * The keys this module reads from `intake`, in contract order. The Article 9
 * source guard (`scripts/guest-intake-article9-guard.test.mjs`) reads this list
 * so its field vocabulary cannot fall behind the wire.
 */
export const GUEST_INTAKE_WIRE_KEYS = [
  "dateOfBirth",
  "reason",
  "healthConditions",
  "medication",
  "fallsAccidents",
  "surgeries",
  "pacemaker",
  "pregnancy",
  "consentVersion",
] as const;

/** 0087: `reason` is 1-2000 characters trimmed; the four optional texts <= 2000. */
export const INTAKE_TEXT_MAX_CHARS = 2000;

/** 0087: `CHECK (date_of_birth >= DATE '1900-01-01')`. */
const EARLIEST_DATE_OF_BIRTH: CalendarDate = { year: 1900, month: 1, day: 1 };

export type GuestIntake = {
  dateOfBirth: string;
  reason: string;
  healthConditions: string | null;
  medication: string | null;
  fallsAccidents: string | null;
  surgeries: string | null;
  pacemaker: GuestIntakeAnswer;
  pregnancy: GuestIntakeAnswer;
  consentVersion: IntakeConsentVersion;
};

export type GuestIntakeParse = { ok: true; intake: GuestIntake } | { ok: false };

const REFUSED: GuestIntakeParse = { ok: false };

/**
 * Characters as Postgres counts them. `char_length` counts code points, and a
 * JavaScript `.length` counts UTF-16 units, which would refuse a text of 1001
 * emoji that the column accepts.
 */
const charLength = (s: string): number => Array.from(s).length;

/** ONLY `sim` or `nao`. `nao_perguntado` exists in 0087's enum and is refused
 *  from this door: a guest submission must never store "never asked". */
const isGuestAnswer = (v: unknown): v is GuestIntakeAnswer => v === "sim" || v === "nao";

/**
 * An optional free-text answer: absent, null, or blank all mean "nothing said",
 * stored as NULL. Anything that is not a string is refused rather than coerced.
 */
function optionalText(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false };
  const trimmed = v.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (charLength(trimmed) > INTAKE_TEXT_MAX_CHARS) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Validates the `intake` object. `today` is the Europe/Lisbon calendar day, so a
 * date of birth after it is refused whatever the server's own zone.
 */
export function parseGuestIntake(raw: unknown, today: CalendarDate): GuestIntakeParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return REFUSED;
  const o = raw as Record<string, unknown>;

  if (typeof o.dateOfBirth !== "string") return REFUSED;
  // `parseCalendarDate` refuses 2026-02-30 rather than rolling it into March.
  const dob = parseCalendarDate(o.dateOfBirth);
  if (!dob) return REFUSED;
  if (compareCalendarDates(dob, EARLIEST_DATE_OF_BIRTH) < 0) return REFUSED;
  if (compareCalendarDates(dob, today) > 0) return REFUSED;

  if (typeof o.reason !== "string") return REFUSED;
  const reason = o.reason.trim();
  if (reason === "" || charLength(reason) > INTAKE_TEXT_MAX_CHARS) return REFUSED;

  const healthConditions = optionalText(o.healthConditions);
  const medication = optionalText(o.medication);
  const fallsAccidents = optionalText(o.fallsAccidents);
  const surgeries = optionalText(o.surgeries);
  if (!healthConditions.ok || !medication.ok || !fallsAccidents.ok || !surgeries.ok) {
    return REFUSED;
  }

  // BOTH REQUIRED (ruling 2). An absent answer is refused, never stored as
  // `nao` and never as `nao_perguntado`.
  if (!isGuestAnswer(o.pacemaker) || !isGuestAnswer(o.pregnancy)) return REFUSED;

  if (!isIntakeConsentVersion(o.consentVersion)) return REFUSED;

  return {
    ok: true,
    intake: {
      // Re-formatted from the parsed date, so what is stored is canonical.
      dateOfBirth: formatCalendarDate(dob),
      reason,
      healthConditions: healthConditions.value,
      medication: medication.value,
      fallsAccidents: fallsAccidents.value,
      surgeries: surgeries.value,
      pacemaker: o.pacemaker,
      pregnancy: o.pregnancy,
      consentVersion: o.consentVersion,
    },
  };
}
