// HOR-01 - a therapist is AVAILABLE BY DEFAULT during the clinic's opening hours.
//
// PURE: no DB and no `server-only`, so every rule here is unit-tested in
// isolation (effective-availability-core.test.ts). The tenant-scoped reads that
// feed it live in ./effective-availability.ts.
//
// ==========================================================================
// THE RULE, PER (THERAPIST, CLINIC)
// ==========================================================================
// 1. The therapist has at least one ACTIVE availability_templates row at that
//    clinic: those rows are the answer, exactly as before. Existing Horarios
//    rows are kept and act as overrides (part-timers, split shifts, dated days).
// 2. Otherwise, the clinic's own opening hours ARE the therapist's hours there,
//    as generated rows: Monday to Friday from `opens_at` to `closes_at`, and
//    Saturday from `opens_at` to the clinic's Saturday closing time ONLY when the
//    clinic has one. Sunday is never generated.
// 3. Generated rows exist only for a therapist who is ACTIVE, BOOKABLE, NOT a
//    shared resource (NESA) and a MEMBER of that clinic (staff_locations).
//    Anybody else gets no generated rows, which leaves them exactly where they
//    were before this change.
//
// Blocks (time_off) are not this module's business: every reader already
// subtracts them from whatever working rows it is given, so they subtract from
// generated rows the same way they subtract from typed ones.
//
// ==========================================================================
// CLINIC HOURS ARE DATA, NEVER A CONSTANT HERE
// ==========================================================================
// Nothing in this file names an hour. Weekdays read `opens_at`/`closes_at`
// (migration 0085). Saturday reads a per-clinic Saturday closing time that only
// exists once its own migration is applied; until then, and wherever it is
// NULL, `saturdayClosesAt` is null and no Saturday row is generated.

import { timeToMinutes, type AvailabilityTemplate } from "./availability";

/** Monday to Friday, in the 0 = Sunday .. 6 = Saturday convention of the table. */
export const CLINIC_DEFAULT_WEEKDAYS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);
export const SATURDAY = 6;

/** What decides whether a therapist gets generated rows at all. */
export type ClinicDefaultEligibility = {
  isActive: boolean;
  isBookable: boolean;
  isSharedResource: boolean;
};

/** One clinic the therapist is a member of, with that clinic's hours. */
export type MemberClinic = {
  locationId: string;
  /** Lisbon wall-clock "HH:MM" or "HH:MM:SS". */
  opensAt: string;
  closesAt: string;
  /** The clinic's Saturday closing time, or null when it has none (or the
   *  column does not exist yet on this database). Opening is `opensAt`. */
  saturdayClosesAt: string | null;
};

/** Active, bookable, and a person rather than a shared resource. */
export function isClinicDefaultEligible(e: ClinicDefaultEligibility | null | undefined): boolean {
  if (!e) return false;
  return e.isActive === true && e.isBookable === true && e.isSharedResource !== true;
}

/**
 * The generated rows for one clinic. Each row is shaped exactly like a typed
 * availability_templates row (open validity, active), so every existing reader
 * evaluates it with the code it already has. `source` marks it as generated, and
 * it carries no `id` because no database row stands behind it.
 *
 * A pair that is not a forward window (closing at or before opening) generates
 * nothing rather than a row the table's own CHECK would refuse.
 */
export function clinicDefaultTemplates(clinic: MemberClinic): AvailabilityTemplate[] {
  const out: AvailabilityTemplate[] = [];
  const row = (weekday: number, endTime: string): AvailabilityTemplate => ({
    weekday,
    startTime: clinic.opensAt,
    endTime,
    validFrom: null,
    validUntil: null,
    isActive: true,
    locationId: clinic.locationId,
    source: "clinic_default",
  });
  if (timeToMinutes(clinic.closesAt) > timeToMinutes(clinic.opensAt)) {
    for (const weekday of CLINIC_DEFAULT_WEEKDAYS) out.push(row(weekday, clinic.closesAt));
  }
  if (
    clinic.saturdayClosesAt !== null &&
    timeToMinutes(clinic.saturdayClosesAt) > timeToMinutes(clinic.opensAt)
  ) {
    out.push(row(SATURDAY, clinic.saturdayClosesAt));
  }
  return out;
}

/** The clinics where a therapist's OWN active rows exist. */
export function clinicsWithOwnRows(own: readonly AvailabilityTemplate[]): Set<string> {
  const out = new Set<string>();
  for (const t of own) {
    if (t.isActive && t.locationId) out.add(t.locationId);
  }
  return out;
}

/**
 * THE RESOLVER. A therapist's effective rows: their own rows, plus generated
 * rows at every member clinic where they have no active row of their own.
 *
 * `own` must already be scoped to the therapist (and to `locationId`, when the
 * caller names one). Own rows are returned unchanged, inactive ones included,
 * so a caller that measures "configured" from `isActive` keeps measuring it the
 * same way. `locationId`, when given, narrows the generated rows to that clinic.
 */
export function resolveEffectiveTemplates(args: {
  own: readonly AvailabilityTemplate[];
  eligibility: ClinicDefaultEligibility | null;
  memberClinics: readonly MemberClinic[];
  locationId?: string | null;
}): AvailabilityTemplate[] {
  const out: AvailabilityTemplate[] = [...args.own];
  if (!isClinicDefaultEligible(args.eligibility)) return out;
  const covered = clinicsWithOwnRows(args.own);
  const seen = new Set<string>();
  for (const clinic of args.memberClinics) {
    if (args.locationId && clinic.locationId !== args.locationId) continue;
    if (covered.has(clinic.locationId) || seen.has(clinic.locationId)) continue;
    seen.add(clinic.locationId);
    out.push(...clinicDefaultTemplates(clinic));
  }
  return out;
}

/**
 * Which schedule a therapist is on, for the Horarios label.
 *
 * - `own`: at least one active row of their own, anywhere. The label says
 *   "Horario proprio", and "Usar horario da clinica" is offered.
 * - `clinic_default`: no own rows, and the default applies at one or more
 *   clinics. The label says "Horario da clinica (padrao)".
 * - `none`: no own rows and no default (not bookable, inactive, a shared
 *   resource, or a member of no clinic). Their hours are not enforced at all,
 *   exactly as before this change.
 */
export type ScheduleKind = "own" | "clinic_default" | "none";

export function scheduleKindFor(args: {
  hasOwnActiveRows: boolean;
  eligibility: ClinicDefaultEligibility | null;
  memberClinicCount: number;
}): ScheduleKind {
  if (args.hasOwnActiveRows) return "own";
  if (isClinicDefaultEligible(args.eligibility) && args.memberClinicCount > 0) {
    return "clinic_default";
  }
  return "none";
}
