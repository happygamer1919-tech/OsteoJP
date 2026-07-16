"use server";
import { revalidatePath } from "next/cache";
import { requireRequestContext } from "@/lib/auth/context";
import { adjustPackInstance, getActivePackBalance, type AdjustOutcome } from "./instances";
import type { AdjustDirection } from "./instances-core";

/**
 * W8-01c — server actions for the pack booking + patient-profile surfaces.
 * getPatientPackBalanceAction feeds the drawer's remaining-sessions banner;
 * adjustPackSessionAction is the staff manual consume/restore control on the
 * patient profile. Both re-authorize server-side (never trust the client).
 */

export async function getPatientPackBalanceAction(
  patientId: string,
  packId: string,
): Promise<{ sessionsTotal: number; sessionsRemaining: number } | null> {
  const actor = await requireRequestContext();
  if (!patientId || !packId) return null;
  return getActivePackBalance(actor, patientId, packId);
}

export async function adjustPackSessionAction(
  instanceId: string,
  direction: AdjustDirection,
  patientId: string,
): Promise<AdjustOutcome> {
  const actor = await requireRequestContext();
  const result = await adjustPackInstance(actor, instanceId, direction);
  if (result.ok && patientId) revalidatePath(`/patients/${patientId}`);
  return result;
}
