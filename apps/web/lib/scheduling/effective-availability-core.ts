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

/**
 * Is this own row still IN FORCE from `today` on? Active, and its validity
 * either open or reaching today or later (Lisbon calendar date). A row that
 * starts in the future counts: it is a schedule somebody typed for later. A
 * row whose `valid_until` is in the past does not: it describes days that are
 * over and says nothing about who works next week.
 */
export function isCurrentOwnRow(t: AvailabilityTemplate, today: string): boolean {
  return t.isActive && (t.validUntil == null || t.validUntil >= today);
}

/** Does the therapist have ANY own row in force, at ANY clinic? */
export function hasCurrentOwnRows(own: readonly AvailabilityTemplate[], today: string): boolean {
  return own.some((t) => isCurrentOwnRow(t, today));
}

/**
 * THE RESOLVER. PER THERAPIST, NOT PER CLINIC (ruled 2026-10-30, the owner's
 * intent): a therapist with ANY own row in force anywhere keeps their typed
 * Horario as their WHOLE schedule, at every clinic, exactly as before HOR-01,
 * and gets no generated row anywhere. Only a therapist with ZERO such rows
 * gets the clinic's opening hours, at every clinic they are an active member
 * of (and only if they are eligible).
 *
 * `own` is EVERY active own row of the therapist, at every clinic: the "any row
 * anywhere" question needs all of them even when the caller asks about one
 * clinic. What is returned is narrowed to `locationId` when given. Expired own
 * rows are returned too (they apply to the past days they cover, as before);
 * they simply no longer stop the default.
 */
export function resolveEffectiveTemplates(args: {
  own: readonly AvailabilityTemplate[];
  eligibility: ClinicDefaultEligibility | null;
  memberClinics: readonly MemberClinic[];
  /** Lisbon calendar date, "yyyy-mm-dd". */
  today: string;
  locationId?: string | null;
}): AvailabilityTemplate[] {
  const here = (loc: string | null | undefined) => !args.locationId || loc === args.locationId;
  const out: AvailabilityTemplate[] = args.own.filter((t) => here(t.locationId));
  if (hasCurrentOwnRows(args.own, args.today)) return out;
  if (!isClinicDefaultEligible(args.eligibility)) return out;
  const seen = new Set<string>();
  for (const clinic of args.memberClinics) {
    if (!here(clinic.locationId) || seen.has(clinic.locationId)) continue;
    seen.add(clinic.locationId);
    out.push(...clinicDefaultTemplates(clinic));
  }
  return out;
}

/** A clinic named for a person to read: its id and its name. */
export type NamedClinic = { locationId: string; name: string };

/**
 * "USAR HORARIO DA CLINICA": MAY IT RUN, AND WHAT WOULD IT DO. One function for
 * the server's refusal and for the button, so the two cannot disagree.
 *
 * - `nothing_to_switch`: no own row in force, so there is nothing to switch
 *   off (and nothing is written, not even an audit row).
 * - `not_eligible`: inactive, not bookable, or a shared resource. Switching
 *   their rows off would not give them the clinic's hours; it would leave them
 *   with none enforced.
 * - `not_member`: they have rows at a clinic where they are not an active
 *   member. With the rows gone they would get nothing there, so the switch
 *   would quietly drop that clinic. Named, so reception can fix it in Equipa.
 * - `ok`: the clinics whose rows will be switched off, for the confirm text.
 */
export type ClinicDefaultSwitchVerdict =
  | { ok: true; clinics: NamedClinic[] }
  | { ok: false; reason: "nothing_to_switch" }
  | { ok: false; reason: "not_eligible" }
  | { ok: false; reason: "not_member"; clinics: NamedClinic[] };

export function clinicDefaultSwitchVerdict(args: {
  eligibility: ClinicDefaultEligibility | null;
  /** The clinics where the therapist has own rows IN FORCE (any clinic, archived ones included). */
  rowClinics: readonly NamedClinic[];
  /** The ACTIVE clinics the therapist is a staff_locations member of. */
  activeMemberClinicIds: ReadonlySet<string>;
}): ClinicDefaultSwitchVerdict {
  const rowClinics = dedupeClinics(args.rowClinics);
  if (rowClinics.length === 0) return { ok: false, reason: "nothing_to_switch" };
  if (!isClinicDefaultEligible(args.eligibility)) return { ok: false, reason: "not_eligible" };
  const missing = rowClinics.filter((c) => !args.activeMemberClinicIds.has(c.locationId));
  if (missing.length > 0) return { ok: false, reason: "not_member", clinics: missing };
  return { ok: true, clinics: rowClinics };
}

function dedupeClinics(clinics: readonly NamedClinic[]): NamedClinic[] {
  const seen = new Map<string, NamedClinic>();
  for (const c of clinics) if (!seen.has(c.locationId)) seen.set(c.locationId, c);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/**
 * Which schedule a therapist is on, for the Horarios label.
 *
 * - `own`: at least one own row IN FORCE, anywhere. The label says
 *   "Horario proprio"; "Usar horario da clinica" is offered when
 *   `clinicDefaultSwitchVerdict` says it may run.
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
