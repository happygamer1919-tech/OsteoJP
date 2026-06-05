import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runAsPatient } = vi.hoisted(() => ({ runAsPatient: vi.fn() }));
vi.mock("@/lib/auth/patient", () => ({ runAsPatient }));

import { listOwnDocuments, getOwnDocumentLocation, toDocumentDTO } from "./documents";

const PRINCIPAL = { tenantId: "11111111-1111-1111-1111-111111111111", patientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", userId: "u-1" };
const OTHER_PATIENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function fakeTx(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return b;
}
function withRows(rows: unknown[]) {
  runAsPatient.mockImplementation(async (_p: unknown, fn: (tx: unknown) => unknown) => fn(fakeTx(rows)));
}

const ownDocRow = (id: string) => ({
  id,
  patientId: PRINCIPAL.patientId,
  tenantId: PRINCIPAL.tenantId,
  fileName: "declaracao.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  storagePath: `${PRINCIPAL.tenantId}/${PRINCIPAL.patientId}/x.pdf`,
  createdAt: new Date("2026-04-06T09:00:00Z"),
});

// NB: no beforeEach reset — each test sets runAsPatient via withRows(). Under
// vitest v4, mockReset/mockClear in a hook + an async mockImplementation that
// calls its fn arg drops that arg; setting the impl per test avoids it.

describe("toDocumentDTO — whitelist (no storagePath / internal linkage)", () => {
  it("exposes ONLY display metadata", () => {
    const dto = toDocumentDTO(ownDocRow("d1") as never);
    expect(Object.keys(dto).sort()).toEqual(
      ["createdAt", "fileName", "id", "mimeType", "sizeBytes"].sort(),
    );
    expect(dto).not.toHaveProperty("storagePath");
    expect(dto).not.toHaveProperty("patientId");
    expect(dto).not.toHaveProperty("clinicalRecordId");
  });
});

describe("listOwnDocuments — self-scope", () => {
  it("derives the query from the verified principal", async () => {
    withRows([ownDocRow("d1")]);
    await listOwnDocuments(PRINCIPAL);
    expect(runAsPatient).toHaveBeenCalledWith(PRINCIPAL, expect.any(Function));
  });

  it("returns the caller's own documents", async () => {
    withRows([ownDocRow("d1"), ownDocRow("d2")]);
    const docs = await listOwnDocuments(PRINCIPAL);
    expect(docs.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("ADVERSARIAL: filters out a foreign-owned row (explicit patient_id guard)", async () => {
    const foreign = { ...ownDocRow("d-foreign"), patientId: OTHER_PATIENT };
    withRows([ownDocRow("d1"), foreign]);
    const docs = await listOwnDocuments(PRINCIPAL);
    expect(docs.map((d) => d.id)).toEqual(["d1"]); // foreign row dropped
  });
});

describe("getOwnDocumentLocation — self-scope", () => {
  it("returns the storage path for an own document", async () => {
    withRows([ownDocRow("d1")]);
    await expect(getOwnDocumentLocation(PRINCIPAL, "d1")).resolves.toEqual({
      storagePath: `${PRINCIPAL.tenantId}/${PRINCIPAL.patientId}/x.pdf`,
      fileName: "declaracao.pdf",
    });
  });

  it("ADVERSARIAL: returns null for another patient's document (cross-patient)", async () => {
    withRows([{ ...ownDocRow("d-b"), patientId: OTHER_PATIENT }]);
    await expect(getOwnDocumentLocation(PRINCIPAL, "d-b")).resolves.toBeNull();
  });

  it("ADVERSARIAL: returns null for a cross-tenant row", async () => {
    withRows([{ ...ownDocRow("d-x"), tenantId: "22222222-2222-2222-2222-222222222222" }]);
    await expect(getOwnDocumentLocation(PRINCIPAL, "d-x")).resolves.toBeNull();
  });

  it("returns null when the document does not exist", async () => {
    withRows([]);
    await expect(getOwnDocumentLocation(PRINCIPAL, "nope")).resolves.toBeNull();
  });
});
