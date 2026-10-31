import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { availabilityTemplates, locations, staffLocations, users, type DbTx } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import {
  scheduleKindFor,
  type ScheduleKind,
} from "@/lib/scheduling/effective-availability-core";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { assertTargetInScheduleScope, resolveScheduleScope, type ScheduleScope } from "./schedule-scope";

/**
 * HOR-01 - "USAR HORARIO DA CLINICA": put one therapist back on the clinic's
 * default hours.
 *
 * WHAT IT WRITES: `is_active = false` on every ACTIVE availability_templates row
 * of that therapist, at every clinic. Nothing is deleted - a row may have shaped
 * past availability, and the Horarios rows stay in the table, inactive, exactly
 * as an archived single row does today (`archiveTemplateIn`). With no active row
 * left, the staff-side resolver gives the therapist the clinic's opening hours at
 * each clinic they are a member of (effective-availability-core.ts).
 *
 * WHO MAY: whoever may manage that therapist's schedule, and nobody else. The
 * capability is `schedule:manage` (owner, admin, reception, therapist), and the
 * TARGET is checked by the same scope every other schedule write uses
 * (schedule-scope.ts): the owner anyone; a located admin or receptionist only a
 * therapist at one of their clinics; a therapist only themselves.
 *
 * ONE AUDIT ROW, naming how many rows were switched off. The ids are not listed:
 * the rows themselves still exist and still carry them.
 */
export async function applyClinicDefaultScheduleIn(
  tx: DbTx,
  actor: RequestContext,
  scope: ScheduleScope,
  userId: string,
): Promise<{ deactivated: number }> {
  if (!userId) throw new AdminError("invalid", "user required");
  await assertTargetInScheduleScope(tx, userId, scope);
  const rows = await tx
    .update(availabilityTemplates)
    .set({ isActive: false })
    .where(and(eq(availabilityTemplates.userId, userId), eq(availabilityTemplates.isActive, true)))
    .returning({ id: availabilityTemplates.id });
  await writeAudit(tx, actor, {
    action: "availability_template.use_clinic_default",
    entityType: "user",
    entityId: userId,
    metadata: { deactivated: rows.length },
  });
  return { deactivated: rows.length };
}

export async function applyClinicDefaultSchedule(
  actor: RequestContext,
  userId: string,
): Promise<{ deactivated: number }> {
  assertCan(actor.role, "schedule:manage");
  const scope = await resolveScheduleScope(actor);
  return runScoped(actor, (tx) => applyClinicDefaultScheduleIn(tx, actor, scope, userId));
}

/** What a Horarios card shows about one therapist's schedule. */
export type ScheduleStatus = {
  kind: ScheduleKind;
  /**
   * "Usar horario da clinica" is offered only when it would DO what it says:
   * the therapist has own rows AND the clinic default applies to them (active,
   * bookable, not a shared resource, a member of an active clinic). For anybody
   * else, switching rows off would leave them with no enforced hours at all,
   * which is a loosening and not the clinic's hours.
   */
  canUseClinicHours: boolean;
};

/**
 * Which schedule each listed therapist is on, for the Horarios label: their own
 * rows, the clinic's default, or neither. Three reads for the whole roster,
 * never one per therapist.
 *
 * Own rows are read HERE, counted only at ACTIVE clinics: a row at an archived
 * clinic shapes nothing a viewer can book, so it must not label the therapist
 * "Horario proprio" while the clinic default is what actually applies.
 */
export async function listScheduleKinds(
  actor: RequestContext,
  therapistIds: readonly string[],
): Promise<Map<string, ScheduleStatus>> {
  assertCan(actor.role, "schedule:read");
  const ids = [...new Set(therapistIds)];
  const out = new Map<string, ScheduleStatus>();
  if (ids.length === 0) return out;
  return runScoped(actor, async (tx) => {
    const [flagRows, memberRows, ownRows] = await Promise.all([
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
        .selectDistinct({ userId: availabilityTemplates.userId })
        .from(availabilityTemplates)
        .innerJoin(locations, eq(locations.id, availabilityTemplates.locationId))
        .where(
          and(
            inArray(availabilityTemplates.userId, ids),
            eq(availabilityTemplates.isActive, true),
            eq(locations.isActive, true),
          ),
        ),
    ]);
    const memberCount = new Map<string, number>();
    for (const r of memberRows) memberCount.set(r.userId, (memberCount.get(r.userId) ?? 0) + 1);
    const flags = new Map(flagRows.map((r) => [r.id, r]));
    const withOwn = new Set(ownRows.map((r) => r.userId));
    for (const id of ids) {
      const f = flags.get(id);
      const eligibility = f
        ? {
            isActive: f.isActive === true,
            isBookable: f.isBookable === true,
            isSharedResource: f.isSharedResource === true,
          }
        : null;
      const memberClinicCount = memberCount.get(id) ?? 0;
      const kind = scheduleKindFor({ hasOwnActiveRows: withOwn.has(id), eligibility, memberClinicCount });
      // The default would apply if the own rows were gone: exactly the
      // `clinic_default` answer for the same person without rows.
      const defaultWouldApply =
        scheduleKindFor({ hasOwnActiveRows: false, eligibility, memberClinicCount }) === "clinic_default";
      out.set(id, { kind, canUseClinicHours: kind === "own" && defaultWouldApply });
    }
    return out;
  });
}
