/**
 * The preview URL helper: what it will sign, and everything it refuses.
 *
 * THE POINT OF THESE ARMS IS THAT A PREVIEW MUST NOT WIDEN ANYTHING. It accepts
 * an ID and signs only the row the Documentos tab's own predicate returned, so
 * the interesting assertions are the refusals, and the fact that the path handed
 * to Storage comes from the ROW rather than from the caller. (The download
 * helper next to it took a client-supplied path when this was written; SR-62
 * PU-4 gave it an id too, so the two now resolve the same way.)
 *
 * The real module runs against a fake transaction and a fake Storage client, so
 * what is asserted is what the app actually hands each of them.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
// server-only modules, stubbed to their one exported constant / functions.
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/clinical/audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachments } from "@osteojp/db";
import { createPatientDocumentPreviewUrl } from "./documents";
import type { RequestContext } from "@osteojp/auth";

const mockRunScoped = vi.mocked(runScoped);
const mockAdmin = vi.mocked(createSupabaseAdminClient);

const TENANT = "tenant-1";
const PATIENT = "99999999-9999-4999-8999-999999999999";
const DOC = "11111111-1111-4111-8111-111111111111";

/** A therapist: holds patients:read, which is what the Documentos tab gates on. */
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: "u-1" };

type Row = { fileName: string; mimeType: string | null; storagePath: string };

/** A select chain yielding `rows`, remembering which table was read. */
function fakeTx(rows: Row[]) {
  const tablesRead: unknown[] = [];
  const chain = {
    from: (t: unknown) => {
      tablesRead.push(t);
      return chain;
    },
    where: () => chain,
    limit: async () => rows,
  };
  return { tx: { select: () => chain }, tablesRead };
}

/** A Storage stub that records exactly what was asked of it. */
function fakeStorage() {
  const calls: { bucket: string; path: string; ttl: number; options: unknown }[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string, ttl: number, options?: unknown) => {
            calls.push({ bucket, path, ttl, options });
            return { data: { signedUrl: `https://storage.example/${path}?token=abc` }, error: null };
          },
        };
      },
    },
  };
  return { client, calls };
}

function arrange(rows: Row[]) {
  const { tx, tablesRead } = fakeTx(rows);
  mockRunScoped.mockImplementation(async (_c, fn) => fn(tx as never));
  const { client, calls } = fakeStorage();
  mockAdmin.mockReturnValue(client as never);
  return { tablesRead, calls };
}

const pdfRow: Row = {
  fileName: "consentimento.pdf",
  mimeType: "application/pdf",
  storagePath: `${TENANT}/patient-documents/${PATIENT}/abc__consentimento.pdf`,
};

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAdmin.mockReset();
});

describe("a therapist inside the tab's scope gets a preview", () => {
  it("signs the row's own path, in the attachments bucket, and says how to render it", async () => {
    const { tablesRead, calls } = arrange([pdfRow]);

    const out = await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);

    expect(out.kind).toBe("pdf");
    expect(out.fileName).toBe("consentimento.pdf");
    expect(out.url).toContain("token=abc");
    expect(tablesRead).toEqual([attachments]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bucket).toBe("clinical-attachments");
    // THE PATH CAME FROM THE ROW, not from the caller: the caller only ever
    // supplied an id.
    expect(calls[0]!.path).toBe(pdfRow.storagePath);
  });

  it("asks for SIXTY SECONDS, the same as the download it sits beside", async () => {
    const { calls } = arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    // A preview is not a longer-lived handle on the bytes. If this number ever
    // grows, the token outlives the panel that needed it.
    expect(calls[0]!.ttl).toBe(60);
  });

  it("signs it INLINE - no download option - which is the whole difference", async () => {
    const { calls } = arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    // With a `download` option Supabase serves Content-Disposition: attachment
    // and the panel would save the file instead of rendering it.
    expect(calls[0]!.options).toBeUndefined();
  });

  it("renders an uploaded photo of a paper form as an image", async () => {
    const { calls } = arrange([
      { ...pdfRow, fileName: "ficha.jpg", mimeType: "image/jpeg", storagePath: `${TENANT}/x/ficha.jpg` },
    ]);
    const out = await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    expect(out.kind).toBe("image");
    expect(calls).toHaveLength(1);
  });
});

describe("everything it refuses, and it never signs on the way out", () => {
  it("REFUSES A DOCUMENT THE TAB WOULD NOT LIST, without saying why", async () => {
    // The scoped read returns nothing: another patient's document, another
    // tenant's, one that lives on a registo rather than the tab, or simply
    // absent. All four arrive here as an empty result and leave as one refusal.
    const { calls } = arrange([]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    // The refusal happened BEFORE the service-role client was ever asked for a
    // URL. That ordering is the guarantee: the admin client bypasses RLS, so
    // nothing may be signed until the scoped read has agreed.
    expect(calls).toHaveLength(0);
  });

  it("refuses a type no browser renders, rather than signing it anyway", async () => {
    const { calls } = arrange([
      {
        fileName: "relatorio.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storagePath: `${TENANT}/patient-documents/${PATIENT}/relatorio.docx`,
      },
    ]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses an imported document with no recorded type", async () => {
    // Every Fisiozero row whose vendor export omitted tipo_mime looks like this.
    const { calls } = arrange([
      { fileName: "scan", mimeType: null, storagePath: `${TENANT}/migration/fisiozero/scan` },
    ]);
    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses a row whose stored path escapes the tenant prefix", async () => {
    // Defense in depth: this should be impossible, and it is refused rather
    // than signed if it ever is not.
    const { calls } = arrange([{ ...pdfRow, storagePath: "other-tenant/x/leak.pdf" }]);
    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("reads through runScoped, so RLS is in force for the lookup", async () => {
    arrange([pdfRow]);
    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(mockRunScoped.mock.calls[0]![0]).toBe(therapist);
  });
});

/**
 * SR-62 PU-4 — A SOFT-DELETED DOCUMENT HAS NO PREVIEW.
 *
 * #1338 landed `deleted_at` on `attachments` AFTER this preview was written, and
 * every staff reader in documents.ts filters it. The preview now resolves
 * through `documentosRowSql` plus `deleted_at IS NULL` — the list's own
 * predicate, by calling the same function rather than copying its body.
 *
 * THE FILTER IS ASSERTED BY RENDERING THE CAPTURED `WHERE` THROUGH DRIZZLE'S
 * REAL POSTGRES DIALECT, the technique documents.soft-delete.test.ts uses. That
 * matters here more than anywhere: the fake transaction answers with whatever
 * rows the test hands it, REGARDLESS of the WHERE, so "the read came back empty
 * and the preview refused" would pass just as well against a preview carrying no
 * filter at all. Reading the SQL Postgres would actually receive is what makes
 * the arm fail when the filter is removed — and removing it is how this was
 * checked, not assumed.
 */
describe("SR-62 PU-4: a soft-deleted document is never previewed", () => {
  const dialect = new PgDialect();

  /** fakeTx's sibling: it KEEPS the WHERE so the SQL can be rendered. */
  function capturingTx(rows: Row[]) {
    const wheres: SQL[] = [];
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = (w: SQL) => {
      wheres.push(w);
      return chain;
    };
    chain.limit = async () => rows;
    mockRunScoped.mockImplementation(async (_c, fn) => fn({ select: () => chain } as never));
    const { client, calls } = fakeStorage();
    mockAdmin.mockReturnValue(client as never);
    return { wheres, calls };
  }

  it("sends deleted_at IS NULL, inside the tab's own predicate", async () => {
    const { wheres } = capturingTx([pdfRow]);

    await createPatientDocumentPreviewUrl(therapist, PATIENT, DOC);

    const q = dialect.sqlToQuery(wheres[0]!);
    expect(q.sql).toContain('"attachments"."deleted_at" is null');
    // In the SAME where, beside the id, the patient and the tenant: it is the
    // list's predicate this sits in, not a second filter bolted on elsewhere.
    expect(q.params).toEqual(expect.arrayContaining([DOC, PATIENT, TENANT]));
  });

  it("refuses the removed document Postgres therefore withholds, and signs nothing", async () => {
    // The filter is in the query, so the soft-deleted row never comes back.
    const { wheres, calls } = capturingTx([]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, DOC)).rejects.toThrow();
    expect(calls).toHaveLength(0);
    // The refusal above would also pass against a preview with NO filter, since
    // this fake returns [] either way. This line is what makes it mean
    // something: the query that came back empty is one that asked Postgres to
    // exclude removed rows.
    expect(dialect.sqlToQuery(wheres[0]!).sql).toContain('"attachments"."deleted_at" is null');
  });

  it("refuses a malformed id BEFORE any query, like the download below it", async () => {
    // Without the guard this reached Postgres, failed there with 22P02 and rolled
    // a transaction back. The arm above is its control: a well-formed id DOES
    // reach the query.
    const { wheres, calls } = capturingTx([pdfRow]);

    await expect(createPatientDocumentPreviewUrl(therapist, PATIENT, "../x")).rejects.toThrow();
    await expect(createPatientDocumentPreviewUrl(therapist, "patient-9", DOC)).rejects.toThrow();
    expect(wheres).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("POSITIVE CONTROL: the live sibling on the same patient still previews", async () => {
    // Without this, every arm above is satisfied by a preview that refuses
    // everything — which is the failure the refusals exist to catch.
    const { calls } = capturingTx([pdfRow]);

    const out = await createPatientDocumentPreviewUrl(
      therapist,
      PATIENT,
      "22222222-2222-4222-8222-222222222222",
    );

    expect(out.kind).toBe("pdf");
    expect(out.fileName).toBe("consentimento.pdf");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe(pdfRow.storagePath);
  });
});
