import "server-only";
import { desc, eq } from "drizzle-orm";
import { assertCan, type RequestContext } from "@osteojp/auth";
import { patientNoteRevisions, users } from "@osteojp/db";
import { runScoped } from "../auth/context";

/** One append-only patient note revision, for the profile Notas tab. */
export type PatientNoteRevision = {
  id: string;
  content: string;
  /** Author's full name, or null for a system/backfill revision (0030). */
  authorName: string | null;
  createdAt: string; // ISO UTC
};

/**
 * A patient's note history from `patient_note_revisions` (0030), NEWEST FIRST.
 * Tenant-scoped via RLS (runScoped sets the JWT context). The 0030 backfill
 * seeded the current `patients.notes` as revision 1 (author NULL), so existing
 * notes appear here without touching `patients.notes`.
 */
export async function listPatientNoteRevisions(
  ctx: RequestContext,
  patientId: string,
): Promise<PatientNoteRevision[]> {
  assertCan(ctx.role, "patients:read");
  return runScoped(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: patientNoteRevisions.id,
        content: patientNoteRevisions.content,
        authorName: users.fullName,
        createdAt: patientNoteRevisions.createdAt,
      })
      .from(patientNoteRevisions)
      .leftJoin(users, eq(users.id, patientNoteRevisions.authorUserId))
      .where(eq(patientNoteRevisions.patientId, patientId))
      .orderBy(desc(patientNoteRevisions.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });
}
