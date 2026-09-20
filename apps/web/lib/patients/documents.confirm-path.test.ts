import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("@/lib/clinical/audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));
vi.mock("@/lib/clinical/storage", () => ({ ATTACHMENTS_BUCKET: "clinical-attachments" }));
vi.mock("@/lib/auth/viewer-locations", () => ({ viewerLocationScope: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({}) } }),
}));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "@/lib/clinical/audit";
import { isClinicalError } from "@/lib/clinical/errors";
import { confirmPatientDocument } from "./documents";

/**
 * SEC-attachment-download-by-path-skips-the-patient-scope, the confirm half.
 *
 * ===========================================================================
 * WHY A TENANT PREFIX IS NOT ENOUGH ON A CONFIRM
 * ===========================================================================
 * `createPatientDocumentUploadUrl` mints exactly one shape of path:
 *
 *     `${tenantId}/patient-documents/${patientId}/${uuid}__${safeName}`
 *
 * `confirmPatientDocument` used to accept ANY path beginning `${tenantId}/`,
 * and `attachments.storage_path` carries no unique constraint. So a caller with
 * `patients:write` on a patient they may see could file a Documentos row
 * pointing at somebody else's object — a registo attachment, or an imported
 * original whose path is derivable (`${tenant}/migration/fisiozero/<name>`, no
 * random part) — and then download it by the NEW row's id, through the id door
 * that was just taught to apply the ficha's visibility rule.
 *
 * The visibility rule answers "may you see this PATIENT". This file closes the
 * other question: the path must be one this patient's own upload could have
 * minted, so a confirm cannot launder a foreign object into a visible patient.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const PATIENT = "22222222-2222-4222-8222-222222222222";
const FOREIGN_PATIENT = "33333333-3333-4333-8333-333333333333";
const RECORD = "44444444-4444-4444-8444-444444444444";
const RECEPTION = "55555555-5555-4555-8555-555555555555";

const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: RECEPTION };

/** The exact shape `createPatientDocumentUploadUrl` mints, for a given patient. */
const minted = (tenant: string, patient: string) =>
  `${tenant}/patient-documents/${patient}/550e8400-e29b-41d4-a716-446655440000__exame.pdf`;

type Op = { kind: "select" | "insert"; values?: Record<string, unknown> };

function fakeTx(patientVisible = true) {
  const ops: Op[] = [];
  const tx = {
    select: () => {
      ops.push({ kind: "select" });
      const b: Record<string, unknown> = {};
      for (const m of ["from", "where", "limit"]) b[m] = () => b;
      b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(patientVisible ? [{ id: PATIENT }] : []).then(ok, fail);
      return b;
    },
    insert: () => {
      const op: Op = { kind: "insert" };
      ops.push(op);
      const b: Record<string, unknown> = {};
      b.values = (v: Record<string, unknown>) => {
        op.values = v;
        return b;
      };
      b.returning = () => b;
      b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve([{ id: "doc-1" }]).then(ok, fail);
      return b;
    },
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return ops;
}

const input = (path: string, patientId = PATIENT) => ({
  patientId,
  path,
  fileName: "exame.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
});

const expectInvalid = (p: Promise<unknown>) =>
  expect(p).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "invalid");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmPatientDocument — the path must be one THIS patient's upload could have minted", () => {
  it("REFUSES an in-tenant path under ANOTHER patient's folder, before any read", async () => {
    const ops = fakeTx();

    await expectInvalid(confirmPatientDocument(reception, input(minted(TENANT, FOREIGN_PATIENT))));

    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("REFUSES a REGISTO attachment's path — the laundering route the download's registo arm would then serve", async () => {
    fakeTx();
    await expectInvalid(confirmPatientDocument(reception, input(`${TENANT}/${RECORD}/uuid__scan.pdf`)));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES an IMPORTED original's path, whose shape carries no random part", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(reception, input(`${TENANT}/migration/fisiozero/exame-2019.pdf`)),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("ACCEPTS this patient's own minted path, in the same run — the control", async () => {
    const ops = fakeTx();

    await expect(
      confirmPatientDocument(reception, input(minted(TENANT, PATIENT))),
    ).resolves.toEqual({ id: "doc-1" });

    const insert = ops.find((o) => o.kind === "insert");
    expect(insert?.values).toMatchObject({
      tenantId: TENANT,
      patientId: PATIENT,
      storagePath: minted(TENANT, PATIENT),
      uploadedBy: RECEPTION,
    });
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it("REFUSES a path outside the tenant prefix — the older guarantee still holds", async () => {
    fakeTx();
    await expectInvalid(confirmPatientDocument(reception, input(minted(OTHER_TENANT, PATIENT))));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a patient id that is only a PREFIX of the path's folder", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(reception, {
        ...input(`${TENANT}/patient-documents/${PATIENT}0/uuid__exame.pdf`),
        patientId: PATIENT,
      }),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES the prefix followed by an EMPTY object name", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(reception, input(`${TENANT}/patient-documents/${PATIENT}/`)),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  /**
   * A PREFIX TEST IS NOT A CONTAINMENT TEST. The stored path is later spliced
   * into a URL and handed to `fetch`, which normalises it, so a `..` segment
   * walks back out of the folder the prefix just pinned and a doubled one
   * leaves the tenant. Percent-encoded dots collapse identically. Measured
   * against `new Request(url).url` on 2026-09-20. `safeName` strips everything
   * outside [A-Za-z0-9._-], so no minted object name contains `/` or `%`.
   */
  it("REFUSES a path that CLIMBS OUT of the patient folder", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(
        reception,
        input(`${TENANT}/patient-documents/${PATIENT}/../../migration/fisiozero/exame.pdf`),
      ),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a climb that leaves the TENANT folder entirely", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(
        reception,
        input(`${TENANT}/patient-documents/${PATIENT}/../../../${OTHER_TENANT}/migration/x.pdf`),
      ),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a PERCENT-ENCODED climb", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(
        reception,
        input(`${TENANT}/patient-documents/${PATIENT}/%2e%2e/%2e%2e/migration/x.pdf`),
      ),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a nested object name, which no minter produces", async () => {
    fakeTx();
    await expectInvalid(
      confirmPatientDocument(reception, input(`${TENANT}/patient-documents/${PATIENT}/sub/x.pdf`)),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a legitimate path with a REFUSED type is still refused by the type check, not the prefix", async () => {
    // The prefix check must not become the only gate: the server-side type and
    // size re-validation is what stops an executable being filed as a document.
    const ops = fakeTx();
    await expect(
      confirmPatientDocument(reception, {
        ...input(minted(TENANT, PATIENT)),
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "validation");
    expect(ops).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
