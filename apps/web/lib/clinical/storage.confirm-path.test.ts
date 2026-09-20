import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { isClinicalError } from "./errors";
import { confirmAttachment } from "./storage";

/**
 * SEC-attachment-download-by-path-skips-the-patient-scope, the confirm half.
 *
 * ===========================================================================
 * WHY A TENANT PREFIX IS NOT ENOUGH ON A CONFIRM
 * ===========================================================================
 * `createAttachmentUploadUrl` mints exactly one shape of path:
 *
 *     `${tenantId}/${recordId}/${uuid}__${safeName}`
 *
 * `confirmAttachment` used to accept ANY path beginning `${tenantId}/`, and
 * `attachments.storage_path` carries no unique constraint. So the row a confirm
 * writes did not have to point at the object the upload created: a caller could
 * confirm an attachment on a registo they legitimately hold with somebody
 * ELSE'S path, and the download would then serve that object through the arm
 * that asks only "does this path hang off a registo you may read".
 *
 * The download's scope check answers the question it is asked. This file closes
 * the other one: the path must be the one this record's own upload could have
 * minted, so a confirm cannot launder a foreign object into a record the caller
 * owns.
 *
 * The prefix asserted here is the SAME STRING the minting function builds. If
 * one moves, this file goes red - which is the point of pinning both to the
 * same expression in the test.
 */

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const RECORD = "22222222-2222-4222-8222-222222222222";
const FOREIGN_RECORD = "33333333-3333-4333-8333-333333333333";
const THERAPIST = "44444444-4444-4444-8444-444444444444";

const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST };

/** The exact shape `createAttachmentUploadUrl` mints, for a given record. */
const minted = (tenant: string, record: string) =>
  `${tenant}/${record}/550e8400-e29b-41d4-a716-446655440000__scan.pdf`;

type Op = { kind: "select" | "insert"; values?: Record<string, unknown> };

/** A recording fake transaction: the draft read answers, the insert records. */
function fakeTx(status: string | null = "draft") {
  const ops: Op[] = [];
  const tx = {
    select: () => {
      ops.push({ kind: "select" });
      const b: Record<string, unknown> = {};
      for (const m of ["from", "where", "limit"]) b[m] = () => b;
      b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(status ? [{ status }] : []).then(ok, fail);
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
        Promise.resolve([{ id: "att-1" }]).then(ok, fail);
      return b;
    },
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return ops;
}

const input = (path: string, recordId = RECORD) => ({
  recordId,
  path,
  fileName: "scan.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
});

const expectInvalid = (p: Promise<unknown>) =>
  expect(p).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "invalid");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmAttachment — the path must be one THIS record's upload could have minted", () => {
  it("REFUSES an in-tenant path that sits under ANOTHER registo's folder, before any read", async () => {
    const ops = fakeTx();

    await expectInvalid(confirmAttachment(therapist, input(minted(TENANT, FOREIGN_RECORD))));

    // Nothing is read and nothing is written: the refusal is a string check that
    // happens before the transaction opens.
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("ACCEPTS this record's own minted path, in the same run — the control", async () => {
    const ops = fakeTx();

    await expect(confirmAttachment(therapist, input(minted(TENANT, RECORD)))).resolves.toEqual({
      id: "att-1",
    });

    const insert = ops.find((o) => o.kind === "insert");
    expect(insert?.values).toMatchObject({
      tenantId: TENANT,
      clinicalRecordId: RECORD,
      storagePath: minted(TENANT, RECORD),
      uploadedBy: THERAPIST,
    });
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it("REFUSES a path outside the tenant prefix — the older guarantee still holds", async () => {
    fakeTx();
    await expectInvalid(confirmAttachment(therapist, input(minted(OTHER_TENANT, RECORD))));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a record id that is only a PREFIX of the path's folder", async () => {
    // `${tenant}/rec-1` startsWith-matches `${tenant}/rec-10/...` unless the
    // separator is part of the compared prefix. It is.
    fakeTx();
    await expectInvalid(
      confirmAttachment(therapist, {
        ...input(`${TENANT}/${RECORD}0/uuid__scan.pdf`),
        recordId: RECORD,
      }),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES the record's folder itself with no object name under it", async () => {
    fakeTx();
    await expectInvalid(confirmAttachment(therapist, input(`${TENANT}/${RECORD}`)));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES the prefix followed by an EMPTY object name", async () => {
    fakeTx();
    await expectInvalid(confirmAttachment(therapist, input(`${TENANT}/${RECORD}/`)));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  /**
   * A PREFIX TEST IS NOT A CONTAINMENT TEST, and this is why the check asks for
   * exactly one segment rather than for a leading string.
   *
   * The stored path is later spliced into a URL and handed to `fetch`, which
   * NORMALISES it: `.../TEN/REC/../migration/fisiozero/x.pdf` leaves this
   * process as `.../TEN/migration/fisiozero/x.pdf`, and a doubled `..` leaves
   * the tenant folder altogether. Percent-encoded dots collapse the same way,
   * so rejecting the literal `..` is not enough either. Measured against
   * `new Request(url).url` on 2026-09-20; the signing client passes the built
   * string straight to fetch.
   *
   * The minters cannot produce any of these: `safeName` strips everything
   * outside [A-Za-z0-9._-], so a legitimate object name has no `/` and no `%`.
   */
  it("REFUSES a path that CLIMBS OUT of the record folder", async () => {
    fakeTx();
    await expectInvalid(
      confirmAttachment(therapist, input(`${TENANT}/${RECORD}/../migration/fisiozero/exame.pdf`)),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a climb that leaves the TENANT folder entirely", async () => {
    fakeTx();
    await expectInvalid(
      confirmAttachment(
        therapist,
        input(`${TENANT}/${RECORD}/../../${OTHER_TENANT}/migration/fisiozero/exame.pdf`),
      ),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a PERCENT-ENCODED climb, which the URL layer collapses just the same", async () => {
    fakeTx();
    await expectInvalid(
      confirmAttachment(therapist, input(`${TENANT}/${RECORD}/%2e%2e/migration/x.pdf`)),
    );
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("REFUSES a nested object name, which no minter produces", async () => {
    fakeTx();
    await expectInvalid(confirmAttachment(therapist, input(`${TENANT}/${RECORD}/sub/scan.pdf`)));
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a legitimate path on a FINALIZED record is still refused by the status read, not the prefix", async () => {
    // The prefix check must not become the only gate: the draft-only rule is
    // what stops an attachment landing on a locked registo, and it runs inside
    // the transaction as before.
    const ops = fakeTx("locked");
    await expect(
      confirmAttachment(therapist, input(minted(TENANT, RECORD))),
    ).rejects.toSatisfy((e: unknown) => isClinicalError(e) && e.code === "finalized");
    expect(ops.some((o) => o.kind === "insert")).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
