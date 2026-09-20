import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// SR-62 PU-4 — soft delete of a patient document, and every staff reader and the
// download honouring it. Owner ruling, final: SOFT delete, REQUIRED reason, one
// audit row naming actor and timestamp; the reason never enters audit_log.
//
// The transaction is a recording fake (no database), the way
// records.hard-delete.test.ts does it. Filters are asserted by RENDERING the
// captured WHERE through Drizzle's real Postgres dialect, so "the query has
// deleted_at IS NULL" is read off the SQL Postgres would receive rather than off
// a mock's argument list. The database half (the CHECK, the portal policy) is
// packages/db/tests/attachments-soft-delete.db.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/clinical/audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
const { createSignedUrl } = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));
// The readers resolve the viewer's clinic scope before the transaction
// (SEC-document-urls-skip-the-therapist-scope). Unassigned here: these arms are
// about deleted_at, and documents.visibility-scope.test.ts owns the scope.
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  // The REAL matrix runs; the spy only lets a test assert which capability was asked.
  return { ...actual, assertCan: vi.fn(actual.assertCan) };
});

import { attachments, patients } from "@osteojp/db";
import { assertCan, can, ForbiddenError, type RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import { writeClinicalAudit } from "@/lib/clinical/audit";
import { isClinicalError } from "@/lib/clinical/errors";
import { assertPiiFreeAuditMetadata } from "@/lib/audit/metadata-contract";
import {
  createPatientDocumentDownloadUrl,
  isDocumentosRow,
  listImportedPatientDocuments,
  listPatientDocuments,
  softDeletePatientDocument,
} from "./documents";
import { DOCUMENT_DELETE_REASON_MAX } from "./document-validation";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);
const mockAssertCan = vi.mocked(assertCan);

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const DOC = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const RECORD = "44444444-4444-4444-8444-444444444444";
const REASON = "Carregado no paciente errado: e do irmao";

const CLINIC = "77777777-7777-4777-8777-777777777777";
const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: "55555555-5555-4555-8555-555555555555" };
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: "66666666-6666-4666-8666-666666666666" };

const dialect = new PgDialect();
const render = (w: SQL | undefined) => dialect.sqlToQuery(w!);

type Query = {
  op: "select" | "update";
  table: unknown;
  wheres: SQL[];
  set?: Record<string, unknown>;
};

/** A recording tx. Every chain is awaitable; `respond` decides its rows. */
function fakeTx(respond: (q: Query) => unknown[]) {
  const log: Query[] = [];
  const chain = (q: Query) => {
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      q.table = t;
      return b;
    };
    b.where = (w: SQL) => {
      q.wheres.push(w);
      return b;
    };
    b.set = (v: Record<string, unknown>) => {
      q.set = v;
      return b;
    };
    for (const m of ["innerJoin", "leftJoin", "orderBy", "limit", "returning"]) b[m] = () => b;
    b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => respond(q))
        .then(ok, fail);
    return b;
  };
  const tx = {
    select: () => {
      const q: Query = { op: "select", table: undefined, wheres: [] };
      log.push(q);
      return chain(q);
    },
    update: (t: unknown) => {
      const q: Query = { op: "update", table: t, wheres: [] };
      log.push(q);
      return chain(q);
    },
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return log;
}

type Row = {
  id: string;
  patientId: string | null;
  clinicalRecordId: string | null;
  storagePath: string;
  deletedAt: Date | null;
};

const patientLevel = (over: Partial<Row> = {}): Row => ({
  id: DOC,
  patientId: PATIENT,
  clinicalRecordId: null,
  storagePath: `${TENANT}/patient-documents/${PATIENT}/x__RGPD.pdf`,
  deletedAt: null,
  ...over,
});

/** The writer's world: which attachment row exists, whether the patient is visible, how many rows the UPDATE hits. */
function writerTx(opts: { row?: Row | null; visible?: boolean; updated?: number } = {}) {
  const row = opts.row === undefined ? patientLevel() : opts.row;
  return fakeTx((q) => {
    if (q.op === "update") return Array.from({ length: opts.updated ?? 1 }, () => ({ id: DOC }));
    if (q.table === attachments) return row ? [row] : [];
    if (q.table === patients) return opts.visible === false ? [] : [{ id: PATIENT }];
    return [];
  });
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === code);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("softDeletePatientDocument — the happy path writes exactly what the ruling asks", () => {
  it("sets the three columns in one UPDATE guarded on deleted_at IS NULL, and writes ONE audit row", async () => {
    const log = writerTx();

    const result = await softDeletePatientDocument(reception, { documentId: DOC, reason: `  ${REASON}\n` });

    expect(result).toEqual({ id: DOC, patientId: PATIENT });
    expect(mockAssertCan).toHaveBeenCalledWith("reception", "patients:write");

    const updates = log.filter((q) => q.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.table).toBe(attachments);
    const set = updates[0]!.set!;
    expect(Object.keys(set).sort()).toEqual(["deleteReason", "deletedAt", "deletedByUserId"]);
    expect(set.deletedByUserId).toBe(reception.userId);
    expect(set.deleteReason).toBe(REASON); // trimmed
    // now() in the SAME transaction as the audit insert, so deleted_at equals
    // audit_log.created_at. Not a JS Date, which would be a second clock.
    expect(render(set.deletedAt as SQL).sql).toBe("now()");
    const where = render(updates[0]!.wheres[0]);
    expect(where.sql).toContain('"attachments"."deleted_at" is null');
    expect(where.sql).toContain('"attachments"."tenant_id" = $');
    expect(where.params).toEqual(expect.arrayContaining([DOC, TENANT]));

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const [auditTx, entry] = mockAudit.mock.calls[0]!;
    expect(auditTx).toBeDefined();
    expect(entry).toEqual({
      tenantId: TENANT,
      actorUserId: reception.userId,
      action: "patient_document.soft_delete",
      entityType: "attachment",
      entityId: DOC,
      metadata: { hadReason: true, patientId: PATIENT },
      ip: "127.0.0.1",
    });
    // The real contract, not a restatement of it.
    expect(() => assertPiiFreeAuditMetadata(entry.metadata, "test")).not.toThrow();
    // And the prose is nowhere in the audit call.
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain("irmao");
  });

  it("an imported original LINKED to a registo is a Documentos row and can be deleted", async () => {
    writerTx({
      row: patientLevel({
        clinicalRecordId: RECORD,
        storagePath: `${TENANT}/migration/fisiozero/RGPD-original.pdf`,
      }),
    });
    await expect(
      softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }),
    ).resolves.toEqual({ id: DOC, patientId: PATIENT });
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it("accepts a reason of exactly the maximum length after trimming", async () => {
    const log = writerTx();
    const exact = "a".repeat(DOCUMENT_DELETE_REASON_MAX);
    await softDeletePatientDocument(reception, { documentId: DOC, reason: `   ${exact}   ` });
    expect(log.find((q) => q.op === "update")!.set!.deleteReason).toBe(exact);
  });

  it("the tenant filter is on the READ too, so another tenant's id resolves to nothing", async () => {
    const log = writerTx({ row: null });
    await expectCode(softDeletePatientDocument({ ...reception, tenantId: OTHER_TENANT }, { documentId: DOC, reason: REASON }), "not_found");
    const read = render(log.find((q) => q.table === attachments)!.wheres[0]);
    expect(read.sql).toContain('"attachments"."tenant_id" = $');
    expect(read.params).toContain(OTHER_TENANT);
    expect(log.some((q) => q.op === "update")).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("softDeletePatientDocument — every refusal happens before anything is written", () => {
  const nothingWritten = (log: Query[]) => {
    expect(log.some((q) => q.op === "update")).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  };

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace only", "   \n\t  "],
    ["not a string", 42],
    ["null", null],
  ])("reason %s -> reason_required, and the database is never opened", async (_label, reason) => {
    const log = writerTx();
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason }), "reason_required");
    expect(mockRunScoped).not.toHaveBeenCalled();
    // The clinic lookup is a READ of its own (staff_locations), and door 2 added
    // it ABOVE the transaction. A request refused on its shape must not reach
    // it; nothing else in this file pins that ordering.
    expect(viewerLocationScope).not.toHaveBeenCalled();
    nothingWritten(log);
  });

  it("reason one character over the maximum after trimming -> reason_too_long", async () => {
    const log = writerTx();
    await expectCode(
      softDeletePatientDocument(reception, { documentId: DOC, reason: "a".repeat(DOCUMENT_DELETE_REASON_MAX + 1) }),
      "reason_too_long",
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
    nothingWritten(log);
  });

  it("an already soft-deleted document -> already_deleted", async () => {
    const log = writerTx({ row: patientLevel({ deletedAt: new Date("2026-09-14T10:00:00Z") }) });
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }), "already_deleted");
    nothingWritten(log);
  });

  it("a concurrent delete that won the race (UPDATE hits 0 rows) -> already_deleted, no audit row", async () => {
    const log = writerTx({ updated: 0 });
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }), "already_deleted");
    expect(log.filter((q) => q.op === "update")).toHaveLength(1);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("an attachment a therapist uploaded onto a registo is not a Documentos row -> not_found", async () => {
    const log = writerTx({
      row: patientLevel({ clinicalRecordId: RECORD, storagePath: `${TENANT}/${RECORD}/x__foto.jpg` }),
    });
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }), "not_found");
    nothingWritten(log);
  });

  it("a row with no patient -> not_found", async () => {
    const log = writerTx({ row: patientLevel({ patientId: null }) });
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }), "not_found");
    nothingWritten(log);
  });

  it("a document id that is not a uuid -> invalid, before the database", async () => {
    const log = writerTx();
    await expectCode(softDeletePatientDocument(reception, { documentId: "../x", reason: REASON }), "invalid");
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(viewerLocationScope).not.toHaveBeenCalled();
    nothingWritten(log);
  });

  it("no patients:write -> ForbiddenError, before the reason is even read", async () => {
    const log = writerTx();
    mockAssertCan.mockImplementationOnce((role, capability) => {
      throw new ForbiddenError(role, capability);
    });
    await expect(
      softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockAssertCan).toHaveBeenCalledWith("reception", "patients:write");
    expect(mockRunScoped).not.toHaveBeenCalled();
    nothingWritten(log);
  });

  it("Q-PU4-1 default, pinned: the roles that can delete are exactly the roles that can upload", () => {
    const roles = ["owner", "admin", "therapist", "reception"] as const;
    expect(roles.filter((r) => can(r, "patients:write"))).toEqual(["owner", "admin", "therapist", "reception"]);
  });

  it("a therapist on a patient that is not theirs -> not_found, through the W10-04 scope", async () => {
    const log = writerTx({ visible: false });
    await expectCode(softDeletePatientDocument(therapist, { documentId: DOC, reason: REASON }), "not_found");
    const scoped = render(log.find((q) => q.table === patients)!.wheres[0]);
    expect(scoped.sql).toContain("created_by");
    expect(scoped.params).toContain(therapist.userId);
    nothingWritten(log);
  });

  it("a therapist on their own patient deletes", async () => {
    writerTx({ visible: true });
    await expect(
      softDeletePatientDocument(therapist, { documentId: DOC, reason: REASON }),
    ).resolves.toEqual({ id: DOC, patientId: PATIENT });
  });

  it("reception with NO clinic assignment is not put through any scope (no patients read) - THE CONTROL", async () => {
    vi.mocked(viewerLocationScope).mockResolvedValueOnce(null);
    const log = writerTx();
    await softDeletePatientDocument(reception, { documentId: DOC, reason: REASON });
    expect(log.some((q) => q.table === patients)).toBe(false);
  });

  // SEC-attachment-download-by-path-skips-the-patient-scope, door 2. The readers
  // answer not_found for a document of another clinic's patient; the WRITE did
  // not, so an assigned receptionist could soft delete what they could not see.
  it("reception ASSIGNED to a clinic, on a patient of another clinic -> not_found, through the clinic scope", async () => {
    vi.mocked(viewerLocationScope).mockResolvedValueOnce([CLINIC]);
    const log = writerTx({ visible: false });
    await expectCode(softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }), "not_found");
    const scoped = render(log.find((q) => q.table === patients)!.wheres[0]);
    expect(scoped.sql).toMatch(/ap\.location_id IN \(/);
    expect(scoped.sql).toMatch(/pl\.id = "patients"\."id"/);
    expect(scoped.params).toContain(CLINIC);
    expect(log.some((q) => q.op === "update")).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("reception ASSIGNED to the patient's clinic deletes", async () => {
    vi.mocked(viewerLocationScope).mockResolvedValueOnce([CLINIC]);
    writerTx({ visible: true });
    await expect(
      softDeletePatientDocument(reception, { documentId: DOC, reason: REASON }),
    ).resolves.toEqual({ id: DOC, patientId: PATIENT });
  });

  it("NO EXISTENCE ORACLE: an ALREADY DELETED document of a patient you may not see is not_found, not already_deleted", async () => {
    // The visibility check used to run AFTER the deleted_at check, so
    // `already_deleted` against `not_found` told an out-of-scope viewer that the
    // id exists. The arm below is the matching control.
    const log = writerTx({ row: patientLevel({ deletedAt: new Date("2026-09-01T10:00:00Z") }), visible: false });
    await expectCode(softDeletePatientDocument(therapist, { documentId: DOC, reason: REASON }), "not_found");
    expect(log.some((q) => q.op === "update")).toBe(false);
  });

  it("THE CONTROL FOR IT: a SCOPED viewer who MAY see the patient still gets already_deleted", async () => {
    // Without this arm the one above proves only that a scoped viewer is
    // refused - it cannot tell "the scope answered not_found" apart from "every
    // scoped viewer is refused whatever the row says", which is what a scope
    // predicate accidentally inverted would look like. The existing
    // already_deleted arm runs as UNSCOPED reception (viewerLocationScope is
    // null there), so it is not this control.
    const log = writerTx({
      row: patientLevel({ deletedAt: new Date("2026-09-01T10:00:00Z") }),
      visible: true,
    });
    await expectCode(
      softDeletePatientDocument(therapist, { documentId: DOC, reason: REASON }),
      "already_deleted",
    );
    // It genuinely went through the scope: the patients read happened.
    expect(log.some((q) => q.table === patients)).toBe(true);
    expect(log.some((q) => q.op === "update")).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("isDocumentosRow — the writer's form of the Documentos rule", () => {
  it.each([
    ["a patient-level upload", patientLevel(), true],
    ["an imported original linked to a registo", patientLevel({ clinicalRecordId: RECORD, storagePath: `${TENANT}/migration/fisiozero/a.pdf` }), true],
    ["a registo attachment", patientLevel({ clinicalRecordId: RECORD, storagePath: `${TENANT}/${RECORD}/a.pdf` }), false],
    ["another tenant's import prefix on a registo row", patientLevel({ clinicalRecordId: RECORD, storagePath: `${OTHER_TENANT}/migration/fisiozero/a.pdf` }), false],
    ["a row with no patient", patientLevel({ patientId: null }), false],
  ])("%s -> %s", (_label, row, expected) => {
    expect(isDocumentosRow(TENANT, row)).toBe(expected);
  });
});

describe("staff readers leave soft-deleted rows out", () => {
  const listRows = () =>
    fakeTx(() => [
      {
        id: DOC,
        fileName: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "p",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);

  it("listPatientDocuments (the Documentos tab) filters deleted_at IS NULL, in-tenant", async () => {
    const log = listRows();
    await listPatientDocuments(reception, PATIENT);
    const where = render(log[0]!.wheres[0]);
    expect(where.sql).toContain('"attachments"."deleted_at" is null');
    expect(where.sql).toContain('"attachments"."tenant_id" = $');
    expect(where.params).toEqual(expect.arrayContaining([PATIENT, TENANT]));
  });

  it("listImportedPatientDocuments (under an imported registo) filters deleted_at IS NULL", async () => {
    const log = listRows();
    await listImportedPatientDocuments(reception, PATIENT, RECORD);
    const where = render(log[0]!.wheres[0]);
    expect(where.sql).toContain('"attachments"."deleted_at" is null');
    expect(where.params).toEqual(expect.arrayContaining([PATIENT, TENANT, RECORD]));
  });
});

describe("createPatientDocumentDownloadUrl — a live Documentos row, by id", () => {
  it("signs the path STORED on a live row, never a client path", async () => {
    const stored = `${TENANT}/patient-documents/${PATIENT}/x__a.pdf`;
    const log = fakeTx(() => [{ storagePath: stored }]);
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });

    await expect(createPatientDocumentDownloadUrl(reception, DOC)).resolves.toBe("https://signed.example/x");

    expect(createSignedUrl).toHaveBeenCalledWith(stored, 60);
    const where = render(log[0]!.wheres[0]);
    expect(where.sql).toContain('"attachments"."deleted_at" is null');
    expect(where.sql).toContain('"attachments"."patient_id" is not null');
    expect(where.sql).toContain('"attachments"."clinical_record_id" is null');
    expect(where.params).toEqual(expect.arrayContaining([DOC, TENANT]));
  });

  it("a soft-deleted (or missing, or non-Documentos) id -> not_found, and nothing is signed", async () => {
    fakeTx(() => []);
    await expectCode(createPatientDocumentDownloadUrl(reception, DOC), "not_found");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a document id that is not a uuid -> invalid, BEFORE any read, the clinic-scope read included", async () => {
    // The readers now resolve the viewer's clinic scope with a read of its own,
    // ahead of the transaction. That read is mocked in this file, so
    // `mockRunScoped` cannot see it: it is asserted by name. `reception` is the
    // role it would actually run for. The arm above is the control: a well-formed
    // id DOES reach the database.
    vi.mocked(viewerLocationScope).mockClear();
    mockRunScoped.mockClear();
    await expectCode(createPatientDocumentDownloadUrl(reception, "../x"), "invalid");
    expect(vi.mocked(viewerLocationScope)).not.toHaveBeenCalled();
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a stored path outside the tenant prefix is refused, not signed", async () => {
    fakeTx(() => [{ storagePath: `${OTHER_TENANT}/patient-documents/x.pdf` }]);
    await expectCode(createPatientDocumentDownloadUrl(reception, DOC), "invalid");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("a raw storage path where the id belongs -> invalid, before the database", async () => {
    fakeTx(() => []);
    await expectCode(createPatientDocumentDownloadUrl(reception, `${TENANT}/patient-documents/x.pdf`), "invalid");
    expect(mockRunScoped).not.toHaveBeenCalled();
  });
});
