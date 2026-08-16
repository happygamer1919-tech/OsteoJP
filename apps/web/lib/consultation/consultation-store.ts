import "server-only";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { consultations, getDbAdmin } from "@osteojp/db";
import { RETRY_CEILING } from "./retry-policy";

// Persistence seam for the consultation row (migration 0064).
//
// EVERY WRITE HERE GOES THROUGH getDbAdmin() — the sanctioned service-role
// path, the same seam lib/ingestion/store.ts uses, with tenant_id set
// EXPLICITLY on the insert (CLAUDE.md rule 3). Two reasons, and the second is
// the one that decided the RLS shape in 0064:
//
//   1. The retry function runs from Inngest with NO Supabase session at all, so
//      RLS has nothing to key on. It resolves tenant_id from the row it is
//      already holding and never widens beyond it.
//   2. fire_status is a MACHINE VERDICT about whether the partner received the
//      consultation. 0064 grants `authenticated` SELECT and no write policy at
//      all, so no staff session can mark a consultation delivered. A row that
//      reads 'fired' always means a machine observed a terminal response.
//
// NOTHING IN HERE LOGS OR STORES PAYLOAD CONTENT. `last_error` takes a status
// code or an error class name — never a response body, never clinical data.

/** How many pending rows one scanner tick will read. See listDueCandidates. */
export const SCAN_LIMIT = 100;

/**
 * A pending row, in a JSON-SAFE shape: every field is a string or a number.
 *
 * That is not cosmetic. These rows cross an Inngest `step.run()` boundary, and
 * a step's return value is MEMOISED AS JSON — a Date goes in and an ISO string
 * comes back on the next step. Typing this as Date would have compiled against
 * a value that is a string at runtime, and `lastAttemptAt.getTime()` would have
 * thrown inside the scanner rather than at the boundary. Making the boundary
 * shape explicit means the conversion happens once, here, where it is visible.
 *
 * The two consultation instants are ISO strings for a second reason: they are
 * forwarded to the partner as text, and `toISOString()` reproduces exactly the
 * canonical form `machineStamp()` produced at record time. See the round-trip
 * guard in consultation-store.test.ts — if it ever stopped being identical, a
 * retry would present a different idempotency key from the first fire, which is
 * the duplicate this whole table exists to prevent.
 */
export type ConsultationRetryRow = {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  audioObjectKey: string;
  /** ISO-8601, byte-identical to what the first fire sent. */
  consultationStartedAt: string;
  consultationEndedAt: string;
  attemptCount: number;
  /** ISO-8601, or null when never attempted. */
  lastAttemptAt: string | null;
};

const RETRY_COLUMNS = {
  id: consultations.id,
  tenantId: consultations.tenantId,
  patientId: consultations.patientId,
  doctorId: consultations.doctorId,
  audioObjectKey: consultations.audioObjectKey,
  consultationStartedAt: consultations.consultationStartedAt,
  consultationEndedAt: consultations.consultationEndedAt,
  attemptCount: consultations.attemptCount,
  lastAttemptAt: consultations.lastAttemptAt,
} as const;

export type PersistConsultationArgs = {
  tenantId: string;
  patientId: string;
  doctorId: string;
  audioObjectKey: string;
  /** ISO-8601, exactly as the recorder stamped it. Stored, never re-derived. */
  consultationStartedAt: string;
  consultationEndedAt: string;
};

/**
 * Write the consultation row BEFORE the fire is attempted, and return its id.
 *
 * Idempotent on the partner's own grain: 0064's unique constraint is
 * (tenant, patient, started, ended), which is what their idempotency key is
 * derived from. A double-submitted fire therefore RE-USES the existing row
 * rather than opening a second retry stream that would race the first against
 * the same key. The conflicting insert is a no-op and the existing row is read
 * back — its attempt_count and fire_status are left exactly as they were,
 * because the machine that set them knows more than this call does.
 *
 * Throws if the row can neither be inserted nor read back. The caller MUST NOT
 * swallow that into the ordinary "we will retry" path: nothing is persisted, so
 * nothing will retry, and telling the clinician otherwise is the promise this
 * whole card exists to stop making.
 */
export async function persistConsultation(
  args: PersistConsultationArgs,
): Promise<{ id: string; attemptCount: number; fireStatus: string }> {
  const db = getDbAdmin();
  const values = {
    tenantId: args.tenantId,
    patientId: args.patientId,
    doctorId: args.doctorId,
    audioObjectKey: args.audioObjectKey,
    consultationStartedAt: new Date(args.consultationStartedAt),
    consultationEndedAt: new Date(args.consultationEndedAt),
  };

  const inserted = await db
    .insert(consultations)
    .values(values)
    .onConflictDoNothing()
    .returning({
      id: consultations.id,
      attemptCount: consultations.attemptCount,
      fireStatus: consultations.fireStatus,
    });
  if (inserted[0]) return inserted[0];

  // Conflict: the row already exists on the natural key. Read it back.
  const existing = await db
    .select({
      id: consultations.id,
      attemptCount: consultations.attemptCount,
      fireStatus: consultations.fireStatus,
    })
    .from(consultations)
    .where(
      and(
        eq(consultations.tenantId, values.tenantId),
        eq(consultations.patientId, values.patientId),
        eq(consultations.consultationStartedAt, values.consultationStartedAt),
        eq(consultations.consultationEndedAt, values.consultationEndedAt),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  // The insert said "conflict" and the select found nothing. That is not a case
  // to paper over with a fresh uuid: it means the two disagree about what is in
  // the table, and continuing would fire against a consultation id that no row
  // carries.
  throw new Error("consultation-store: insert conflicted but the existing row could not be read");
}

/** Terminal success. attemptNumber is the attempt that got the answer. */
export async function markDelivered(id: string, attemptNumber: number, at: Date): Promise<void> {
  await getDbAdmin()
    .update(consultations)
    .set({
      fireStatus: "fired",
      attemptCount: attemptNumber,
      lastAttemptAt: at,
      lastError: null,
    })
    .where(eq(consultations.id, id));
}

/** Still owed. Leaves every recovery value intact and bumps the attempt trail. */
export async function markPending(
  id: string,
  attemptNumber: number,
  at: Date,
  error: string,
): Promise<void> {
  await getDbAdmin()
    .update(consultations)
    .set({
      fireStatus: "pending",
      attemptCount: attemptNumber,
      lastAttemptAt: at,
      lastError: error,
    })
    .where(eq(consultations.id, id));
}

/** Ceiling reached. The row stops being retried and starts being a human's problem. */
export async function markNeedsAttention(
  id: string,
  attemptNumber: number,
  at: Date,
  error: string,
): Promise<void> {
  await getDbAdmin()
    .update(consultations)
    .set({
      fireStatus: "needs_attention",
      attemptCount: attemptNumber,
      lastAttemptAt: at,
      lastError: error,
    })
    .where(eq(consultations.id, id));
}

/**
 * Pending rows that have not yet reached the ceiling, oldest attempt first.
 *
 * The BACKOFF is deliberately NOT applied here. Whether a row is due depends on
 * attempt_count and last_attempt_at together, and that arithmetic lives in
 * retry-policy.ts where it is tested without a database. This query narrows to
 * the candidates; `isDue` decides. The cost is reading some rows that turn out
 * not to be due yet, bounded by SCAN_LIMIT.
 *
 * Cross-tenant on purpose: the scanner has no tenant context and must see every
 * clinic's backlog. It never widens beyond `fire_status = 'pending'`, and every
 * write it makes afterwards is keyed by row id.
 */
export async function listDueCandidates(limit: number = SCAN_LIMIT): Promise<ConsultationRetryRow[]> {
  const rows = await getDbAdmin()
    .select(RETRY_COLUMNS)
    .from(consultations)
    .where(
      and(
        eq(consultations.fireStatus, "pending"),
        lt(consultations.attemptCount, RETRY_CEILING),
      ),
    )
    .orderBy(asc(sql`${consultations.lastAttemptAt} NULLS FIRST`))
    .limit(limit);
  return rows.map(toRetryRow);
}

/**
 * Pending rows already at or past the ceiling.
 *
 * These should not exist: the scanner moves a row to needs_attention in the same
 * tick that its last attempt fails. They exist if that write was lost — a crash
 * between the fire and the mark, a redeploy mid-tick. Without this sweep such a
 * row is invisible in BOTH directions: `isDue` refuses it (correctly, it is over
 * the ceiling) so it is never retried, and it is not needs_attention so nobody
 * is told. It would sit pending until the audio aged out of the bucket.
 */
export async function listOverCeiling(limit: number = SCAN_LIMIT): Promise<ConsultationRetryRow[]> {
  const rows = await getDbAdmin()
    .select(RETRY_COLUMNS)
    .from(consultations)
    .where(
      and(
        eq(consultations.fireStatus, "pending"),
        gte(consultations.attemptCount, RETRY_CEILING),
      ),
    )
    .limit(limit);
  return rows.map(toRetryRow);
}

/** The one place a driver Date becomes the ISO text the rest of the path uses. */
export function toRetryRow(row: {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  audioObjectKey: string;
  consultationStartedAt: Date;
  consultationEndedAt: Date;
  attemptCount: number;
  lastAttemptAt: Date | null;
}): ConsultationRetryRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    patientId: row.patientId,
    doctorId: row.doctorId,
    audioObjectKey: row.audioObjectKey,
    consultationStartedAt: row.consultationStartedAt.toISOString(),
    consultationEndedAt: row.consultationEndedAt.toISOString(),
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt === null ? null : row.lastAttemptAt.toISOString(),
  };
}
