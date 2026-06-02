import "server-only";
import { and, eq } from "drizzle-orm";
import {
  aiIngestionRequests,
  clinicalRecords,
  getDbAdmin,
  patients,
} from "@osteojp/db";
import { resolveOutcomeStatus } from "./ingestion-status";
import type {
  CreateDraftArgs,
  CreateDraftResult,
  ExistingIngestionRequest,
  IngestionStore,
} from "./ingest";

// Service_role persistence for AI ingestion.
//
// UNLIKE the reminder jobs (lib/reminders/context.ts), ingestion deliberately
// uses getDbAdmin() — the BYPASSRLS handle. This is the SANCTIONED service_role
// path (CLAUDE.md rule #3, and the 0008 schema note): the request arrives with
// no Supabase session and no tenant context, so RLS has nothing to key on. We
// therefore resolve tenant_id from the patient row and set it EXPLICITLY on
// every write. Never global, never from the payload. ai_ingestion_requests is
// RLS ENABLE (not FORCE), so BYPASSRLS writes are permitted; the same RLS still
// fail-closes the authenticated review queue.

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

export const drizzleIngestionStore: IngestionStore = {
  async resolvePatientTenant(patientId: string): Promise<string | null> {
    const rows = await getDbAdmin()
      .select({ tenantId: patients.tenantId, deletedAt: patients.deletedAt })
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);
    const row = rows[0];
    // Soft-deleted patients are treated as unknown — no ingestion into them.
    if (!row || row.deletedAt) return null;
    return row.tenantId;
  },

  async findRequest(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<ExistingIngestionRequest | null> {
    const rows = await getDbAdmin()
      .select({
        requestId: aiIngestionRequests.requestId,
        status: aiIngestionRequests.status,
        clinicalRecordId: aiIngestionRequests.clinicalRecordId,
        payloadHash: aiIngestionRequests.payloadHash,
      })
      .from(aiIngestionRequests)
      .where(
        and(
          eq(aiIngestionRequests.tenantId, tenantId),
          eq(aiIngestionRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async createDraftWithRequest(args: CreateDraftArgs): Promise<CreateDraftResult> {
    const status = resolveOutcomeStatus(true); // draft created -> 'accepted'
    try {
      return await getDbAdmin().transaction(async (tx) => {
        const [record] = await tx
          .insert(clinicalRecords)
          .values({
            tenantId: args.tenantId, // explicit — from the resolved patient
            patientId: args.patientId,
            source: "ai_ingested",
            status: "draft", // unlocked: does NOT trip the immutability trigger
            aiReviewState: "pending_review", // human review queue (rule #4)
            aiPayloadId: args.requestId,
            // TODO(andrei): per-field mapping + bodychart region→marker mapping.
            // Until the field-list contract lands we persist the raw payload
            // verbatim under a namespaced key so the reviewer has the source of
            // truth; nothing here is interpreted as form data yet.
            data: { _aiIngestionRaw: args.payload },
          })
          .returning({ id: clinicalRecords.id });

        const [req] = await tx
          .insert(aiIngestionRequests)
          .values({
            tenantId: args.tenantId, // explicit — never from the payload
            idempotencyKey: args.idempotencyKey,
            requestId: args.requestId,
            payloadHash: args.payloadHash,
            clinicalRecordId: record.id,
            status,
          })
          .returning({ requestId: aiIngestionRequests.requestId });

        return {
          clinicalRecordId: record.id,
          requestId: req.requestId,
          status,
          deduped: false,
        };
      });
    } catch (err) {
      // Lost the race on (tenant_id, idempotency_key): the constraint is the
      // real idempotency guarantee. Re-read and replay the winner's row.
      if (isUniqueViolation(err)) {
        const existing = await this.findRequest(args.tenantId, args.idempotencyKey);
        if (existing) {
          return {
            clinicalRecordId: existing.clinicalRecordId ?? "",
            requestId: existing.requestId,
            status: existing.status,
            deduped: true,
          };
        }
      }
      throw err;
    }
  },
};
