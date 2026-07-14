import { vi, describe, it, expect, beforeEach } from "vitest";

// W6-01a: hardDeleteClinicalRecord regression. The password gate + capability
// check live in the server action; this exercises the tenant-scoped DB work.
//
// The bug: a DRAFT ficha referenced by ai_ingestion_requests (AI-ingested
// draft) or patient_form_submissions (patient-submission-materialised draft) is
// pointed at by a NO-ACTION FK, so DELETE-ing the record raised a Postgres
// foreign-key violation (23503) that surfaced as the opaque "Ocorreu um erro"
// on the owner's test patients (paol / paul). The fix detaches those nullable
// back-pointers (set clinical_record_id = null, preserving the log/queue rows)
// BEFORE the record delete, inside the same tx. No schema change.
//
// This test asserts, on a mock tx (no live DB), that the two detach UPDATEs run
// and precede the record DELETE. It fails on pre-fix code (no detach) and
// passes post-fix. The FK reality itself is proven against a live DB in
// packages/db/tests/clinical-record-hard-delete-fk.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("../auth/context", () => ({
  runScoped: vi.fn(),
}));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import {
  aiIngestionRequests,
  attachments,
  clinicalRecords,
  patientFormSubmissions,
} from "@osteojp/db";
import { runScoped } from "../auth/context";
import { writeClinicalAudit } from "./audit";
import { hardDeleteClinicalRecord } from "./records";
import { isClinicalError } from "./errors";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "thera-1" };

/** A mock tx that records the ORDER of write ops and returns canned rows.
 *  update(...).set(...).where(...).returning() and
 *  delete(...).where(...).returning() and
 *  select(...).from(...).where(...).limit() are the only shapes hardDelete uses. */
function makeTx(opts: { status?: string } = {}) {
  const status = opts.status ?? "draft";
  const ops: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ status, version: 1 }] }),
      }),
    }),
    update: (table: unknown) => {
      const tag =
        table === aiIngestionRequests
          ? "update:ingestion"
          : table === patientFormSubmissions
            ? "update:submission"
            : "update:other";
      return {
        set: () => ({
          where: () => ({
            returning: async () => {
              ops.push(tag);
              return [{ id: "detached-1" }];
            },
          }),
        }),
      };
    },
    delete: (table: unknown) => {
      const tag =
        table === attachments
          ? "delete:attachments"
          : table === clinicalRecords
            ? "delete:record"
            : "delete:other";
      return {
        where: () => ({
          returning: async () => {
            ops.push(tag);
            return tag === "delete:record" ? [{ id: "rec-1" }] : [];
          },
        }),
      };
    },
  };
  return { tx, ops };
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
});

describe("hardDeleteClinicalRecord (W6-01a FK detach)", () => {
  it("detaches ai_ingestion_requests AND patient_form_submissions BEFORE deleting the record", async () => {
    const { tx, ops } = makeTx({ status: "draft" });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await hardDeleteClinicalRecord(therapist, "rec-1");

    // Both back-pointer detaches must run, and both must precede the record delete.
    expect(ops).toContain("update:ingestion");
    expect(ops).toContain("update:submission");
    expect(ops).toContain("delete:record");
    expect(ops.indexOf("update:ingestion")).toBeLessThan(ops.indexOf("delete:record"));
    expect(ops.indexOf("update:submission")).toBeLessThan(ops.indexOf("delete:record"));
  });

  it("records the PII-free detached counts in the single audit row", async () => {
    const { tx } = makeTx({ status: "draft" });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await hardDeleteClinicalRecord(therapist, "rec-1");

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][1];
    expect(entry.action).toBe("clinical_record.hard_delete");
    expect(entry.metadata).toMatchObject({
      detachedIngestionRequests: 1,
      detachedFormSubmissions: 1,
    });
  });

  it("refuses a non-draft (signed) record with not_draft (no detach, no delete)", async () => {
    const { tx, ops } = makeTx({ status: "signed" });
    mockRunScoped.mockImplementation((_a, cb) => Promise.resolve(cb(tx as never)));

    await expect(hardDeleteClinicalRecord(therapist, "rec-1")).rejects.toSatisfy(
      (e: unknown) => isClinicalError(e) && e.code === "not_draft",
    );
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
