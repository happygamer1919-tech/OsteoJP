import "server-only";
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { availabilityTemplates, locations, staffLocations, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  clinicDefaultSwitchVerdict,
  scheduleKindFor,
  type ClinicDefaultEligibility,
  type ClinicDefaultSwitchVerdict,
  type NamedClinic,
  type ScheduleKind,
} from "@/lib/scheduling/effective-availability-core";
import { lisbonToday } from "@/lib/scheduling/effective-availability";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope, type ScheduleScope } from "./schedule-scope";

/**
 * What decides the Horarios label and "Usar horario da clinica" for one
 * therapist, read the same way for both, so the button cannot offer what the
 * server would refuse.
 */
export type ClinicDefaultFacts = {
  eligibility: ClinicDefaultEligibility | null;
  /** Clinics (any, archived included) where the therapist has an own row IN FORCE. */
  rowClinics: NamedClinic[];
  /** Active clinics the therapist is a staff_locations member of. */
  activeMemberClinicIds: Set<string>;
};

/**
 * Three reads for any number of therapists, never one per therapist. "In
 * force" is the resolver's own definition (isCurrentOwnRow): active, and a
 * validity that is open or reaches `today` or later.
 */
export async function readClinicDefaultFacts(
  tx: DbTx,
  userIds: readonly string[],
  today: string,
): Promise<Map<string, ClinicDefaultFacts>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, ClinicDefaultFacts>();
  if (ids.length === 0) return out;
  const [flagRows, memberRows, rowClinicRows] = await Promise.all([
    tx
      .select({
        id: users.id,
        isActive: users.isActive,
        isBookable: users.isBookable,
        isSharedResource: users.isSharedResource,
      })
      .from(users)
      .where(inArray(users.id, ids)),
    tx
      .selectDistinct({ userId: staffLocations.userId, locationId: staffLocations.locationId })
      .from(staffLocations)
      .innerJoin(locations, eq(locations.id, staffLocations.locationId))
      .where(and(inArray(staffLocations.userId, ids), eq(locations.isActive, true))),
    tx
      .selectDistinct({
        userId: availabilityTemplates.userId,
        locationId: availabilityTemplates.locationId,
        name: locations.name,
      })
      .from(availabilityTemplates)
      .innerJoin(locations, eq(locations.id, availabilityTemplates.locationId))
      .where(
        and(
          inArray(availabilityTemplates.userId, ids),
          eq(availabilityTemplates.isActive, true),
          or(isNull(availabilityTemplates.validUntil), gte(availabilityTemplates.validUntil, today)),
        ),
      ),
  ]);
  for (const id of ids) {
    out.set(id, { eligibility: null, rowClinics: [], activeMemberClinicIds: new Set() });
  }
  for (const f of flagRows) {
    out.get(f.id)!.eligibility = {
      isActive: f.isActive === true,
      isBookable: f.isBookable === true,
      isSharedResource: f.isSharedResource === true,
    };
  }
  for (const m of memberRows) out.get(m.userId)?.activeMemberClinicIds.add(m.locationId);
  for (const r of rowClinicRows) out.get(r.userId)?.rowClinics.push({ locationId: r.locationId, name: r.name });
  return out;
}

/**
 * HOR-01 - "USAR HORARIO DA CLINICA": put one therapist back on the clinic's
 * default hours.
 *
 * IT MAY RUN ONLY WHEN THE DEFAULT WILL REALLY REPLACE THE ROWS, checked here on
 * the server and not only by the button (`clinicDefaultSwitchVerdict`): the
 * therapist has an own row in force; is active, bookable and not a shared
 * resource; and every clinic where those rows are is an active clinic they are
 * a member of. Otherwise it refuses and writes NOTHING, not even an audit row,
 * and the refusal names what is wrong (the clinics lacking membership).
 *
 * WHAT IT WRITES: `is_active = false` on every ACTIVE availability_templates row
 * of that therapist, at every clinic. Nothing is deleted - a row may have shaped
 * past availability, and the Horarios rows stay in the table, inactive, exactly
 * as an archived single row does today (`archiveTemplateIn`).
 *
 * WHO MAY: whoever may manage that therapist's schedule, and nobody else. The
 * capability is `schedule:manage` (owner, admin, reception, therapist), and the
 * TARGET is checked by the same scope every other schedule write uses
 * (schedule-scope.ts): the owner anyone; a located admin or receptionist only a
 * therapist at one of their clinics; a therapist only themselves.
 *
 * ONE AUDIT ROW when it writes, naming how many rows and how many clinics. The
 * ids are not listed: the rows themselves still exist and still carry them.
 */
export type ClinicDefaultSwitchResult =
  | { ok: true; deactivated: number; clinics: NamedClinic[] }
  | Exclude<ClinicDefaultSwitchVerdict, { ok: true }>;

export async function applyClinicDefaultScheduleIn(
  tx: DbTx,
  actor: RequestContext,
  scope: ScheduleScope,
  userId: string,
  today: string = lisbonToday(),
): Promise<ClinicDefaultSwitchResult> {
  if (!userId) throw new AdminError("invalid", "user required");
  await assertTargetInScheduleScope(tx, userId, scope);
  const facts = (await readClinicDefaultFacts(tx, [userId], today)).get(userId)!;
  const verdict = clinicDefaultSwitchVerdict(facts);
  if (!verdict.ok) return verdict;
  const rows = await tx
    .update(availabilityTemplates)
    .set({ isActive: false })
    .where(and(eq(availabilityTemplates.userId, userId), eq(availabilityTemplates.isActive, true)))
    .returning({ id: availabilityTemplates.id });
  await writeAudit(tx, actor, {
    action: "availability_template.use_clinic_default",
    entityType: "user",
    entityId: userId,
    metadata: { deactivated: rows.length, clinics: verdict.clinics.length },
  });
  return { ok: true, deactivated: rows.length, clinics: verdict.clinics };
}

export async function applyClinicDefaultSchedule(
  actor: RequestContext,
  userId: string,
): Promise<ClinicDefaultSwitchResult> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  return runScoped(actor, (tx) => applyClinicDefaultScheduleIn(tx, actor, scope, userId));
}

/** What a Horarios or Equipa card shows about one therapist's schedule. */
export type ScheduleStatus = {
  kind: ScheduleKind;
  /** The SAME verdict the server action runs; the button shows only when ok. */
  switchVerdict: ClinicDefaultSwitchVerdict;
};

/**
 * Which schedule each listed therapist is on (own rows, the clinic's default,
 * or neither), and whether "Usar horario da clinica" may run for them.
 */
export async function listScheduleKinds(
  actor: RequestContext,
  therapistIds: readonly string[],
  today: string = lisbonToday(),
): Promise<Map<string, ScheduleStatus>> {
  assertCan(actor.role, "schedule:read");
  const ids = [...new Set(therapistIds)];
  if (ids.length === 0) return new Map();
  return runScoped(actor, async (tx) => {
    const facts = await readClinicDefaultFacts(tx, ids, today);
    const out = new Map<string, ScheduleStatus>();
    for (const id of ids) {
      const f = facts.get(id)!;
      out.set(id, {
        kind: scheduleKindFor({
          hasOwnActiveRows: f.rowClinics.length > 0,
          eligibility: f.eligibility,
          memberClinicCount: f.activeMemberClinicIds.size,
        }),
        switchVerdict: clinicDefaultSwitchVerdict(f),
      });
    }
    return out;
  });
}
