import "server-only";
import type { DbTx } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { resolveViewerLocationIds } from "@/lib/auth/viewer-locations";
import { listSharedResources, listSharedResourcesTx } from "./shared-resources";
import { therapistSecondParticipantVerdict } from "./shared-resource-guard";

/**
 * SCHED-29 - the server half of "Terapeuta 2" for a therapist.
 *
 * Called by EVERY path that writes `practitioner_2_id` from a therapist's
 * request: create, and clone ("Marcar novamente"), which copies the source's
 * second participant. A rule placed in one of them would guard that one only.
 * Update and reschedule never touch the column.
 *
 * Owner, admin and reception pass straight through: the requirement narrows the
 * therapist's choice and nobody else's.
 */
export async function secondParticipantCheck(
  actor: RequestContext,
  args: { practitionerTwoId: string | null | undefined; primaryId: string; locationId: string },
  tx?: DbTx,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "shared_resource_location" }> {
  if (actor.role !== "therapist" || !args.practitionerTwoId) return { ok: true };
  const resources = tx ? await listSharedResourcesTx(tx) : await listSharedResources(actor);
  const verdict = therapistSecondParticipantVerdict({
    practitionerTwoId: args.practitionerTwoId,
    primaryId: args.primaryId,
    targetLocationId: args.locationId,
    actorLocationIds: await resolveViewerLocationIds(actor),
    resources,
  });
  if (verdict === "ok") return { ok: true };
  return { ok: false, error: verdict === "resource_location" ? "shared_resource_location" : "forbidden" };
}
