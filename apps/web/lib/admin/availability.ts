import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { assertCan } from "@osteojp/auth";
import { availabilityTemplates, locations, users } from "@osteojp/db";
import { runScoped, type RequestContext } from "@/lib/auth/context";
import { writeAudit } from "./audit";
import { AdminError } from "./errors";
import { timesOverlap } from "./availability-core";

export type AvailabilityTemplateView = {
  id: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

export type AvailabilityTemplateInput = {
  userId: string;
  locationId: string;
  weekday: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

/** Normalize a DB `time` value ("HH:MM:SS") to "HH:MM" for display/forms. */
function hm(t: string): string {
  return t.slice(0, 5);
}

export async function listAvailabilityTemplates(
  actor: RequestContext,
): Promise<AvailabilityTemplateView[]> {
  assertCan(actor.role, "settings:read");
  return runScoped(actor, async (tx) => {
    const rows = await tx
      .select({
        id: availabilityTemplates.id,
        userId: availabilityTemplates.userId,
        userName: users.fullName,
        locationId: availabilityTemplates.locationId,
        locationName: locations.name,
        weekday: availabilityTemplates.weekday,
        startTime: availabilityTemplates.startTime,
        endTime: availabilityTemplates.endTime,
      })
      .from(availabilityTemplates)
      .innerJoin(users, eq(users.id, availabilityTemplates.userId))
      .innerJoin(locations, eq(locations.id, availabilityTemplates.locationId))
      .where(eq(availabilityTemplates.isActive, true))
      .orderBy(asc(users.fullName), asc(availabilityTemplates.weekday), asc(availabilityTemplates.startTime));
    return rows.map((r) => ({ ...r, startTime: hm(r.startTime), endTime: hm(r.endTime) }));
  });
}

function validate(input: AvailabilityTemplateInput): void {
  if (!input.userId || !input.locationId) throw new AdminError("invalid", "user and location required");
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    throw new AdminError("invalid", "weekday must be 0..6");
  }
  const re = /^\d{2}:\d{2}$/;
  if (!re.test(input.startTime) || !re.test(input.endTime)) {
    throw new AdminError("invalid", "times must be HH:MM");
  }
  // end strictly after start (mirrors the DB CHECK).
  if (input.endTime <= input.startTime) throw new AdminError("invalid", "end must be after start");
}

/**
 * Reject an overlapping ACTIVE template for the same therapist + weekday +
 * location (pre-ruled default, DECISIONS 2026-07-03). `excludeId` skips the row
 * being edited. Keeps availability data unambiguous even though the consumer
 * merges windows.
 */
async function assertNoOverlap(
  tx: Parameters<Parameters<typeof runScoped>[1]>[0],
  input: AvailabilityTemplateInput,
  excludeId: string | null,
): Promise<void> {
  const siblings = await tx
    .select({
      id: availabilityTemplates.id,
      startTime: availabilityTemplates.startTime,
      endTime: availabilityTemplates.endTime,
    })
    .from(availabilityTemplates)
    .where(
      and(
        eq(availabilityTemplates.isActive, true),
        eq(availabilityTemplates.userId, input.userId),
        eq(availabilityTemplates.locationId, input.locationId),
        eq(availabilityTemplates.weekday, input.weekday),
        ...(excludeId ? [ne(availabilityTemplates.id, excludeId)] : []),
      ),
    );
  for (const s of siblings) {
    if (timesOverlap(input.startTime, input.endTime, hm(s.startTime), hm(s.endTime))) {
      throw new AdminError("invalid", "overlapping template for this therapist/weekday/location");
    }
  }
}

export async function createAvailabilityTemplate(
  actor: RequestContext,
  input: AvailabilityTemplateInput,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  validate(input);
  await runScoped(actor, async (tx) => {
    await assertNoOverlap(tx, input, null);
    const [row] = await tx
      .insert(availabilityTemplates)
      .values({
        tenantId: actor.tenantId, // NOT NULL + RLS WITH CHECK
        userId: input.userId,
        locationId: input.locationId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
      })
      .returning({ id: availabilityTemplates.id });
    await writeAudit(tx, actor, {
      action: "availability_template.create",
      entityType: "availability_template",
      entityId: row?.id ?? null,
    });
  });
}

export async function updateAvailabilityTemplate(
  actor: RequestContext,
  id: string,
  input: AvailabilityTemplateInput,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  validate(input);
  await runScoped(actor, async (tx) => {
    await assertNoOverlap(tx, input, id);
    const rows = await tx
      .update(availabilityTemplates)
      .set({
        userId: input.userId,
        locationId: input.locationId,
        weekday: input.weekday,
        startTime: input.startTime,
        endTime: input.endTime,
      })
      .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
      .returning({ id: availabilityTemplates.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "availability_template.update",
      entityType: "availability_template",
      entityId: id,
    });
  });
}

/** Soft archive (is_active=false) — the consumer only reads active rows.
 *  Never hard-delete: a template may have shaped historical availability. */
export async function archiveAvailabilityTemplate(
  actor: RequestContext,
  id: string,
): Promise<void> {
  assertCan(actor.role, "settings:manage");
  await runScoped(actor, async (tx) => {
    const rows = await tx
      .update(availabilityTemplates)
      .set({ isActive: false })
      .where(and(eq(availabilityTemplates.id, id), eq(availabilityTemplates.isActive, true)))
      .returning({ id: availabilityTemplates.id });
    if (!rows[0]) throw new AdminError("not_found");
    await writeAudit(tx, actor, {
      action: "availability_template.archive",
      entityType: "availability_template",
      entityId: id,
    });
  });
}
