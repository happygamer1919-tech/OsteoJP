import "server-only";
import { and, eq } from "drizzle-orm";
import { availabilityTemplates, type DbTx } from "@osteojp/db";

import {
  evaluateAvailability,
  isWithinValidity,
  lisbonWeekday,
  type AvailabilityTemplate,
} from "./availability";
import { lisbonParts } from "./time";

/**
 * RB-03 — A MANUALLY ENTERED TIME MUST BE INSIDE THE THERAPIST'S DISPONIBILIDADE.
 *
 * ==========================================================================
 * WHAT WAS ACTUALLY WRONG, RE-DERIVED FROM main RATHER THAN FROM THE REPORT.
 * ==========================================================================
 * Availability was ALREADY COMPUTED on the write path. `findScheduleConflicts`
 * evaluates it and emits a `kind: "availability"` conflict — and then
 * `ADVISORY_CONFLICT_KINDS` lists exactly that kind and `blockingConflicts()`
 * FILTERS IT OUT, one line above the refusal, with the comment "PL-11:
 * availability is advisory — never blocks."
 *
 * So the check ran, produced the right answer, and was thrown away. The reported
 * defect — Catarina ends at 13:00 and a manual entry books 17:00 — is not a
 * missing check. It is a check whose verdict was discarded by design.
 *
 * ==========================================================================
 * PL-11 IS CHANGED BY OWNER RULING 2026-08-20, AND ONLY FOR THIS PATH.
 * ==========================================================================
 * Availability becomes ENFORCED at write time for staff appointment creation
 * and editing. `ADVISORY_CONFLICT_KINDS` is left ALONE: the advisory conflict
 * still flows to the UI, which is what draws the warning panel, and removing it
 * there would change the picker surface the ruling says is unchanged.
 *
 * THIS IS A SEPARATE, EARLIER REFUSAL, and it is separate for one reason that
 * matters more than tidiness: **`allowConflict` must not reach it.** The generic
 * conflict path is overridable by "Guardar mesmo assim", and an override that
 * reinstates the exact defect is not an override, it is a bypass. A therapist
 * who genuinely works late is expressed by EXTENDING THEIR DISPONIBILIDADE —
 * which is the data being enforced — not by pressing past the check.
 *
 * ==========================================================================
 * THE PICKER PATH IS UNCHANGED, AND THAT IS AN OBSERVATION RATHER THAN A CARVE-OUT.
 * ==========================================================================
 * There is deliberately NO "was this typed or picked?" flag. The server cannot
 * know, and a client-supplied flag on a rule the client is being restrained by
 * is not a rule. The picker only ever offers slots inside availability, so a
 * picked time cannot trip this — the enforcement is invisible on that path
 * BECAUSE the path was already correct, not because it is exempted.
 *
 * ==========================================================================
 * UNCONFIGURED MEANS UNENFORCED, AND THAT IS LOAD-BEARING.
 * ==========================================================================
 * `evaluateAvailability` returns `configured: false` when a therapist has no
 * active template for that location, and this function refuses NOTHING in that
 * case. Availability is opt-in per (therapist, location): a clinic that has not
 * set hours must not be locked out of its own diary by a rule it never
 * configured. Asserted in both directions, because the failure mode is total.
 */

/** One working window on the day in question, as Lisbon wall-clock "HH:MM". */
export type AvailabilityWindow = { startTime: string; endTime: string };

export type AvailabilityVerdict =
  /** No active template for this (therapist, location): the rule does not apply. */
  | { ok: true; reason: "unconfigured" }
  /** Inside the therapist's hours for that day. */
  | { ok: true; reason: "covered" }
  /**
   * Outside them. `windows` is what the refusal NAMES — the therapist's actual
   * hours that weekday — because "outside working hours" without them makes the
   * reader open another screen to find out what the hours are. Refusal-names-
   * dates doctrine, the same shape the double-booking refusal follows.
   *
   * It is EMPTY when the therapist has templates for the location but none on
   * that weekday, which is a different sentence ("does not work that day") and
   * the caller renders it as one.
   */
  | { ok: false; windows: AvailabilityWindow[] };

/**
 * Check a candidate window against the therapist's availability for one
 * location, inside a caller-provided tenant-scoped tx.
 *
 * READS THE SAME TEMPLATES `findScheduleConflicts` READS, by the same predicate,
 * so the enforced answer and the advisory panel cannot disagree. A second,
 * subtly different query here would be a second source of truth about the same
 * fact — and the two would drift silently, each right about its own version.
 */
export async function checkAvailability(
  tx: DbTx,
  args: {
    practitionerId: string;
    locationId: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<AvailabilityVerdict> {
  const rows = await tx
    .select({
      weekday: availabilityTemplates.weekday,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
      validFrom: availabilityTemplates.validFrom,
      validUntil: availabilityTemplates.validUntil,
      isActive: availabilityTemplates.isActive,
    })
    .from(availabilityTemplates)
    .where(
      and(
        eq(availabilityTemplates.userId, args.practitionerId),
        eq(availabilityTemplates.locationId, args.locationId),
      ),
    );

  const templates: AvailabilityTemplate[] = rows.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    isActive: r.isActive,
  }));

  const verdict = evaluateAvailability(args.startsAt, args.endsAt, templates);
  if (!verdict.configured) return { ok: true, reason: "unconfigured" };
  if (verdict.covered) return { ok: true, reason: "covered" };

  // The windows that DO apply on the booking's own Lisbon calendar day. Same
  // filter `evaluateAvailability` applies internally, so what the refusal names
  // is exactly what it measured against.
  const dateStr = lisbonParts(args.startsAt).date;
  const weekday = lisbonWeekday(dateStr);
  const windows = templates
    .filter(
      (t) =>
        t.isActive &&
        t.weekday === weekday &&
        isWithinValidity(dateStr, t.validFrom, t.validUntil),
    )
    .map((t) => ({ startTime: t.startTime.slice(0, 5), endTime: t.endTime.slice(0, 5) }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return { ok: false, windows };
}

/**
 * The refusal's human half: the therapist's hours that day, as one pt-PT
 * fragment the caller drops into the message.
 *
 * SPLIT-SHIFT IS THE CASE THIS EXISTS FOR. W13-A gave a therapist-day two
 * working periods, so "08:00-13:00" is not always the whole answer and a
 * message that named only the first would be confidently wrong about the
 * afternoon.
 */
export function describeWindows(windows: AvailabilityWindow[]): string {
  return windows.map((w) => `${w.startTime}-${w.endTime}`).join(", ");
}
