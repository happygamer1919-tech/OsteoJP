import { beforeEach, describe, expect, it, vi } from "vitest";

// H5 — THE UPLOAD GATE RUNS BEFORE THE BYTES, AND THE AUDIT ROW CARRIES NO MIME
// STRING.
//
// Two properties, one file, because they are the two halves of one upload:
//
//  1. A type the Documentos picker ADVERTISES must complete. The 71-character
//     .docx type is on ALLOWED_DOCUMENT_MIME, so the picker offers it, the
//     browser PUTs the bytes, and the confirm then has to write both rows.
//  2. A type this clinic does not accept must be refused BEFORE a signed upload
//     URL exists, so the browser has nowhere to PUT and no object is created.
//
// THE AUDIT HELPER IS REAL HERE, DELIBERATELY. `writeClinicalAudit` is left
// unmocked so the real assertPiiFreeAuditMetadata (lib/audit/metadata-contract.ts)
// runs inside the transaction exactly as it does in production — the contract is
// the thing these arms are about, and a mocked contract asserts nothing about
// it. Only `clientIp` is stubbed, because it reads next/headers.
// Mocking the audit helper (as documents.soft-delete.test.ts does, correctly,
// for a suite about deleted_at) would mock away the very thing under test.
//
// No database: the transaction is a recording fake, the shape the neighbouring
// suites use.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
// PARTIAL mock: the real writeClinicalAudit and the real contract run.
vi.mock("@/lib/clinical/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/clinical/audit")>()),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
const { createSignedUploadUrl } = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUploadUrl }) } }),
}));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));

import { attachments, auditLog } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { isClinicalError } from "@/lib/clinical/errors";
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from "./document-validation";
import { confirmPatientDocument, createPatientDocumentUploadUrl } from "./documents";

/** 71 characters, and on the allowlist — the picker offers it (document-validation.ts). */
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const PATH = `${TENANT}/patient-documents/${PATIENT}/aaaaaaaa__contrato.docx`;

const reception: RequestContext = {
  tenantId: TENANT,
  role: "reception",
  userId: "55555555-5555-4555-8555-555555555555",
};

const docx = (over: Partial<{ mimeType: string | null; sizeBytes: number }> = {}) => ({
  patientId: PATIENT,
  path: PATH,
  fileName: "contrato.docx",
  mimeType: DOCX as string | null,
  sizeBytes: 12_345,
  ...over,
});

type Insert = { table: unknown; values: Record<string, unknown> };

/**
 * A recording tx. Selects answer "this patient is here"; every insert is
 * captured with the TABLE it targeted, so "one attachments row and one audit
 * row" is read off what the transaction was asked to write.
 */
function fakeTx(): Insert[] {
  const inserts: Insert[] = [];
  const selectChain = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy"]) b[m] = () => b;
    b.limit = async () => [{ id: PATIENT }];
    return b;
  };
  const tx = {
    select: selectChain,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const rows = Promise.resolve(table === attachments ? [{ id: DOC }] : []);
        return {
          returning: () => rows,
          // The audit insert is awaited without .returning().
          then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => rows.then(ok, no),
        };
      },
    }),
  };
  vi.mocked(runScoped).mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return inserts;
}

const rejectsValidation = (p: Promise<unknown>) =>
  expect(p).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "validation");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmPatientDocument — a .docx completes, audit row included", () => {
  it("resolves, and writes one attachments row and one audit row", async () => {
    const inserts = fakeTx();

    await expect(confirmPatientDocument(reception, docx())).resolves.toEqual({ id: DOC });

    expect(inserts.filter((i) => i.table === attachments)).toHaveLength(1);
    expect(inserts.filter((i) => i.table === auditLog)).toHaveLength(1);
  });

  it("keeps the MIME type on the attachments row and out of the audit metadata", async () => {
    const inserts = fakeTx();

    await confirmPatientDocument(reception, docx());

    // The type is not lost. It is on the domain column, written in this same
    // transaction, and audit_log.entity_id points at that row.
    expect(inserts.find((i) => i.table === attachments)!.values.mimeType).toBe(DOCX);
    const meta = inserts.find((i) => i.table === auditLog)!.values.metadata;
    expect(meta).toEqual({ patientId: PATIENT, sizeBytes: 12_345 });
    expect(JSON.stringify(meta)).not.toContain("wordprocessingml");
  });

  it.each([...ALLOWED_DOCUMENT_MIME])(
    "%s: an advertised type reaches the audit row without tripping the contract",
    async (mime) => {
      const inserts = fakeTx();

      await expect(
        confirmPatientDocument(reception, docx({ mimeType: mime, sizeBytes: 10 })),
      ).resolves.toEqual({ id: DOC });

      expect(inserts.filter((i) => i.table === auditLog)).toHaveLength(1);
    },
  );
});

describe("createPatientDocumentUploadUrl — a refused file never gets a signed URL", () => {
  const slot = { data: { path: PATH, token: "tok" }, error: null };

  it("refuses application/zip before minting, and before the patient read", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await rejectsValidation(
      createPatientDocumentUploadUrl(reception, PATIENT, "x.zip", {
        mimeType: "application/zip",
        sizeBytes: 10,
      }),
    );

    // NO TOKEN, SO NOTHING CAN BE PUT. This is the assertion the dispatch asks
    // for: the refusal happens while the object still does not exist.
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
    // And ahead of the patient read, so a refused type costs no query either.
    expect(vi.mocked(runScoped)).not.toHaveBeenCalled();
  });

  it("refuses a file over MAX_DOCUMENT_BYTES before minting", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await rejectsValidation(
      createPatientDocumentUploadUrl(reception, PATIENT, "scan.pdf", {
        mimeType: "application/pdf",
        sizeBytes: MAX_DOCUMENT_BYTES + 1,
      }),
    );

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  // THE CONTROL. Without it, a gate that refused everything would read as a fix.
  it("still mints for a .docx, so the gate refuses nothing the picker accepts", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await expect(
      createPatientDocumentUploadUrl(reception, PATIENT, "contrato.docx", {
        mimeType: DOCX,
        sizeBytes: 12_345,
      }),
    ).resolves.toEqual({ path: PATH, token: "tok" });

    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});
