import { vi, describe, it, expect, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/clinical/audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn() }));

import { runScoped } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { viewerLocationScope } from "@/lib/auth/viewer-locations";
import {
  createPatientDocumentDownloadUrl,
  createPatientDocumentPreviewUrl,
  listImportedPatientDocuments,
  listPatientDocuments,
} from "./documents";
import type { RequestContext } from "@osteojp/auth";

/**
 * SEC-document-urls-skip-the-therapist-scope.
 *
 * ===========================================================================
 * THE GAP, FOUND BY A FRESH-CONTEXT REVIEW OF #1403 ON 2026-09-20
 * ===========================================================================
 * The permission matrix says a therapist sees OWN PATIENTS ONLY, and a located
 * receptionist or admin sees the patients of their clinics. `getPatient`
 * enforces both (queries.ts), so `/patients/<id>` answers 404 for a patient who
 * is not theirs. The four Documentos readers did not: they gated on
 * `patients:read`, the tenant and the row predicate, and on nothing about WHO
 * the patient is. `attachments` carries a tenant-only policy for staff, so RLS
 * does not catch it either.
 *
 * `createPatientDocumentDownloadUrl(ctx, documentId)` is reached from a server
 * action with the document id alone. A therapist holding the uuid of a document
 * that belongs to another therapist's patient was given a signed URL for it.
 * Exploiting it needs a leaked random uuid, which is why it is a gap and not an
 * incident; it is still the one read of a patient's files the matrix did not
 * govern.
 *
 * ===========================================================================
 * HOW IT IS ASSERTED, AND WHY BOTH DIRECTIONS
 * ===========================================================================
 * The fake transaction answers with whatever rows it is handed, whatever the
 * WHERE says, so "it refused" would prove nothing. Each arm renders the captured
 * WHERE through drizzle's real Postgres dialect and reads the SQL Postgres would
 * receive, the technique documents.soft-delete.test.ts established.
 *
 * THE ADMIN WITH NO CLINIC ASSIGNMENT IS THE CONTROL: for them the same four
 * readers must carry NEITHER scope. Without that arm, a scope string that is
 * always present (or a test that matches something unrelated) would pass every
 * positive arm.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockAdmin = vi.mocked(createSupabaseAdminClient);
const mockLocations = vi.mocked(viewerLocationScope);

const TENANT = "tenant-1";
const PATIENT = "99999999-9999-4999-8999-999999999999";
const DOC = "11111111-1111-4111-8111-111111111111";
const RECORD = "33333333-3333-4333-8333-333333333333";
const THERAPIST_ID = "44444444-4444-4444-8444-444444444444";
const CLINIC = "55555555-5555-4555-8555-555555555555";

const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: "u-rec" };
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "u-adm" };

const row = {
  id: DOC,
  fileName: "consentimento.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
  storagePath: `${TENANT}/patient-documents/${PATIENT}/x__consentimento.pdf`,
  createdAt: new Date("2026-09-01T10:00:00Z"),
};

const dialect = new PgDialect();

function capturingTx() {
  const wheres: SQL[] = [];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = (w: SQL) => {
    wheres.push(w);
    return chain;
  };
  chain.limit = async () => [row];
  chain.orderBy = async () => [row];
  mockRunScoped.mockImplementation(async (_c, fn) => fn({ select: () => chain } as never));
  mockAdmin.mockReturnValue({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: "https://s/object/sign/x?token=t" }, error: null }),
      }),
    },
  } as never);
  return wheres;
}

const READERS: ReadonlyArray<[string, (ctx: RequestContext) => Promise<unknown>]> = [
  ["listPatientDocuments", (ctx) => listPatientDocuments(ctx, PATIENT)],
  ["listImportedPatientDocuments", (ctx) => listImportedPatientDocuments(ctx, PATIENT, RECORD)],
  ["createPatientDocumentPreviewUrl", (ctx) => createPatientDocumentPreviewUrl(ctx, PATIENT, DOC)],
  ["createPatientDocumentDownloadUrl", (ctx) => createPatientDocumentDownloadUrl(ctx, DOC)],
];

/** The SQL and params of the ONE attachments read the reader made. */
async function readerQuery(read: (ctx: RequestContext) => Promise<unknown>, ctx: RequestContext) {
  const wheres = capturingTx();
  await read(ctx);
  expect(wheres, "the reader must make exactly one attachments read").toHaveLength(1);
  return dialect.sqlToQuery(wheres[0]!);
}

// The distinctive halves of scope.ts. `ap.practitioner_id` appears only in the
// therapist scope, `ap.location_id IN` only in the location scope.
const THERAPIST_SCOPE = /ap\.practitioner_id = \$\d+ OR ap\.practitioner_2_id = \$\d+/;
const LOCATION_SCOPE = /ap\.location_id IN \(/;

describe.each(READERS)("%s applies the patient visibility scope", (_name, read) => {
  beforeEach(() => {
    mockRunScoped.mockReset();
    mockAdmin.mockReset();
    mockLocations.mockReset();
  });

  it("a THERAPIST is held to their own patients, keyed on the attachment's patient", async () => {
    mockLocations.mockResolvedValue(null);
    const q = await readerQuery(read, therapist);
    expect(q.sql).toMatch(THERAPIST_SCOPE);
    // INSIDE the scope, not merely somewhere in the WHERE: every reader already
    // renders "attachments"."patient_id" in its own predicate, so a bare
    // toContain would stay green with the scope keyed on the wrong table, which
    // Postgres would reject at runtime and the server action would swallow.
    expect(q.sql).toMatch(/po\.id = "attachments"\."patient_id"/);
    expect(q.sql).toMatch(/ap\.patient_id = "attachments"\."patient_id"/);
    expect(q.params).toEqual(expect.arrayContaining([THERAPIST_ID]));
  });

  it("a RECEPTIONIST assigned to a clinic is held to that clinic's patients", async () => {
    mockLocations.mockResolvedValue([CLINIC]);
    const q = await readerQuery(read, reception);
    expect(q.sql).toMatch(LOCATION_SCOPE);
    expect(q.sql).toMatch(/pl\.id = "attachments"\."patient_id"/);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.params).toEqual(expect.arrayContaining([CLINIC]));
  });

  it("THE CONTROL: an admin with no clinic assignment carries NEITHER scope", async () => {
    mockLocations.mockResolvedValue(null);
    const q = await readerQuery(read, admin);
    expect(q.sql).not.toMatch(THERAPIST_SCOPE);
    expect(q.sql).not.toMatch(LOCATION_SCOPE);
    // and the predicates that were always there still are
    expect(q.sql).toContain('"attachments"."deleted_at" is null');
  });
});
