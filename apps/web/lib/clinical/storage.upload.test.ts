import { beforeEach, describe, expect, it, vi } from "vitest";

// H5, the ficha Anexos twin of documents.upload.test.ts.
//
// Two properties, as in the twin: the mint refuses a candidate outside the rule
// before it signs anything, and a candidate inside the rule completes with an
// audit row that carries no media type. Anexos is the wider surface — it is the
// one the single rule NARROWS (Q-H5-1) — so the refusal arms here cover a type
// off the allowlist, a type carrying a parameter, and a size over the ceiling.
//
// THERAPIST CONTEXT, not the reception fixture the Documentos suite uses: both
// functions here gate on `clinical_records:author`, which reception does not
// hold (packages/auth/permissions.ts). With reception every arm would throw
// ForbiddenError and prove nothing.
//
// As in the Documentos twin, `writeClinicalAudit` is REAL so the contract runs
// inside the transaction; only `clientIp` is stubbed.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./audit")>()),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
const { createSignedUploadUrl } = vi.hoisted(() => ({ createSignedUploadUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ createSignedUploadUrl }) } }),
}));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));

import { attachments, auditLog } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from "@/lib/patients/document-validation";
import { CAPTURE_MIME } from "./camera-capture";
import { isClinicalError } from "./errors";
import { confirmAttachment, createAttachmentUploadUrl } from "./storage";

/** 71 characters. */
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT = "22222222-2222-4222-8222-222222222222";
const RECORD = "44444444-4444-4444-8444-444444444444";
const PATH = `${TENANT}/${RECORD}/aaaaaaaa__contrato.docx`;

const therapist: RequestContext = {
  tenantId: TENANT,
  role: "therapist",
  userId: "66666666-6666-4666-8666-666666666666",
};

const docx = (over: Partial<{ mimeType: string | null; sizeBytes: number }> = {}) => ({
  recordId: RECORD,
  path: PATH,
  fileName: "contrato.docx",
  mimeType: DOCX as string | null,
  sizeBytes: 12_345,
  ...over,
});

type Insert = { table: unknown; values: Record<string, unknown> };

/** Recording tx. Selects answer "the registo is a draft"; inserts are captured. */
function fakeTx(): Insert[] {
  const inserts: Insert[] = [];
  const selectChain = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy"]) b[m] = () => b;
    b.limit = async () => [{ status: "draft" }];
    return b;
  };
  const tx = {
    select: selectChain,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        const rows = Promise.resolve(table === attachments ? [{ id: ATTACHMENT }] : []);
        return {
          returning: () => rows,
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

describe("confirmAttachment — a .docx on a draft ficha completes, audit row included", () => {
  it("resolves, and writes one attachments row and one audit row", async () => {
    const inserts = fakeTx();

    await expect(confirmAttachment(therapist, docx())).resolves.toEqual({ id: ATTACHMENT });

    expect(inserts.filter((i) => i.table === attachments)).toHaveLength(1);
    expect(inserts.filter((i) => i.table === auditLog)).toHaveLength(1);
  });

  it("keeps the MIME type on the attachments row and out of the audit metadata", async () => {
    const inserts = fakeTx();

    await confirmAttachment(therapist, docx());

    expect(inserts.find((i) => i.table === attachments)!.values.mimeType).toBe(DOCX);
    const meta = inserts.find((i) => i.table === auditLog)!.values.metadata;
    expect(meta).toEqual({ recordId: RECORD, sizeBytes: 12_345 });
    expect(JSON.stringify(meta)).not.toContain("wordprocessingml");
  });

  it.each([...ALLOWED_DOCUMENT_MIME])(
    "%s: an accepted type reaches the audit row without tripping the contract",
    async (mime) => {
      const inserts = fakeTx();

      await expect(
        confirmAttachment(therapist, docx({ mimeType: mime, sizeBytes: 10 })),
      ).resolves.toEqual({ id: ATTACHMENT });

      expect(inserts.filter((i) => i.table === auditLog)).toHaveLength(1);
    },
  );
});

/**
 * THE MINT AND THE CONFIRM READ THE SAME VALUES THE SAME WAY (H5).
 *
 * Both take `{ mimeType, sizeBytes }` with a non-nullable size, and both hand it
 * to `validateDocumentUpload` unchanged. The arm below sends the one shape that
 * a rule written as two numeric comparisons answers differently from a rule that
 * asks whether the value is a number at all, and asserts both ends agree: no
 * row, no audit row, no token.
 */
describe("the two ends agree on a size that is not a number", () => {
  const forged = { sizeBytes: Number.NaN as number };

  it("the confirm refuses it, and writes nothing", async () => {
    const inserts = fakeTx();

    await rejectsValidation(confirmAttachment(therapist, docx(forged)));

    expect(inserts).toHaveLength(0);
  });

  it("the mint refuses it, and signs nothing", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue({ data: { path: PATH, token: "tok" }, error: null });

    await rejectsValidation(
      createAttachmentUploadUrl(therapist, RECORD, "contrato.docx", {
        mimeType: DOCX,
        sizeBytes: Number.NaN,
      }),
    );

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("createAttachmentUploadUrl — a refused file never gets a signed URL", () => {
  const slot = { data: { path: PATH, token: "tok" }, error: null };

  it("refuses application/zip before minting, and before the record-status read", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await rejectsValidation(
      createAttachmentUploadUrl(therapist, RECORD, "x.zip", {
        mimeType: "application/zip",
        sizeBytes: 10,
      }),
    );

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
    expect(vi.mocked(runScoped)).not.toHaveBeenCalled();
  });

  // A type carrying a parameter (`text/plain; charset=utf-8`) is one string, not
  // a type plus a decoration: `ALLOWED_DOCUMENT_MIME.includes` answers no, and
  // the mint stops there. Asserted on this surface because it is the one whose
  // picker has always accepted the widest set.
  it("refuses a MIME carrying a parameter before minting", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await rejectsValidation(
      createAttachmentUploadUrl(therapist, RECORD, "notas.txt", {
        mimeType: "text/plain; charset=utf-8",
        sizeBytes: 10,
      }),
    );

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a file over MAX_DOCUMENT_BYTES before minting", async () => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await rejectsValidation(
      createAttachmentUploadUrl(therapist, RECORD, "scan.pdf", {
        mimeType: "application/pdf",
        sizeBytes: MAX_DOCUMENT_BYTES + 1,
      }),
    );

    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  // THE CONTROLS: the camera still works, and so does the type this is all about.
  it.each([
    ["a camera capture", CAPTURE_MIME, 4],
    ["a .docx", DOCX, 12_345],
  ])("still mints for %s", async (_label, mimeType, sizeBytes) => {
    fakeTx();
    createSignedUploadUrl.mockResolvedValue(slot);

    await expect(
      createAttachmentUploadUrl(therapist, RECORD, "ficheiro", { mimeType, sizeBytes }),
    ).resolves.toEqual({ path: PATH, token: "tok" });

    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});
