import { beforeEach, describe, expect, it, vi } from "vitest";

// SIGN-CONFIRM-AND-SAVE-FIRST, the server half: a sign names the fingerprint of
// the content the signer's form last loaded or saved, and commits only while
// the stored content still has it. This pins, on a fake transaction (no live
// DB), that:
//   - a fingerprint that differs from the stored one refuses BEFORE any write;
//   - the fingerprint is ALSO in the sign UPDATE's own WHERE (so it holds
//     against a concurrent writer, not just against the read), rendered here
//     by drizzle's own PgDialect;
//   - an UPDATE that matched no row signed nothing and writes no audit row;
//   - a save hands back the fingerprint of what it stored.
// The same holds for Revisao Consulta's finalize, on both of its branches.
// 0097: every row here is the signer's own (practitionerId "thera-1"), so a
// write that matched no row is the race these arms pin; a therapist who is not
// the author gets `not_author` instead (records.write-guards.test.ts).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import type { RequestContext } from "@osteojp/auth";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { isClinicalError } from "./errors";
import { signAndLockRecord, updateRecordData } from "./records";
import { editReviewNarrative, finalizeReview, saveReviewFicha } from "./review";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);
const dialect = new PgDialect();

const therapist: RequestContext = { tenantId: "tenant-A", role: "therapist", userId: "thera-1" };
const LOADED = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
const FINGERPRINT_SQL = 'md5("clinical_records"."data"::text)';

type UpdateCall = { where?: SQL; returning?: Record<string, SQL> };

/**
 * A fake tx. Every select resolves to `selectRows` (each select takes the next
 * entry), every update records its WHERE and RETURNING and resolves to
 * `updateRows` (the same way). Only the builder shapes these functions use.
 */
function makeTx(selectRows: unknown[][], updateRows: unknown[][]) {
  const updates: UpdateCall[] = [];
  let s = 0;
  let u = 0;
  const selectChain = () => {
    const rows = selectRows[s++] ?? [];
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  };
  const tx = {
    select: selectChain,
    update: () => {
      const call: UpdateCall = {};
      updates.push(call);
      const rows = updateRows[u++] ?? [];
      return {
        set: () => ({
          where: (where: SQL) => {
            call.where = where;
            return {
              returning: async (returning: Record<string, SQL>) => {
                call.returning = returning;
                return rows;
              },
            };
          },
        }),
      };
    },
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { updates };
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (isClinicalError(e)) return e.code;
    throw e;
  }
  return "resolved";
}

function rendered(where: SQL | undefined) {
  expect(where, "the UPDATE had a WHERE").toBeDefined();
  return dialect.sqlToQuery(where!);
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
});

describe("signAndLockRecord: signs only the content the signer saw", () => {
  it("a fingerprint that differs from the stored one is refused as stale, before any write", async () => {
    const { updates } = makeTx([[{ practitionerId: "thera-1", status: "draft", dataHash: OTHER }]], []);
    expect(await codeOf(signAndLockRecord(therapist, "rec-1", LOADED))).toBe("stale");
    expect(updates).toHaveLength(0);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("the sign UPDATE carries the fingerprint and the draft status in its own WHERE", async () => {
    const { updates } = makeTx([[{ practitionerId: "thera-1", status: "draft", dataHash: LOADED }]], [[{ id: "rec-1" }]]);
    expect(await codeOf(signAndLockRecord(therapist, "rec-1", LOADED))).toBe("resolved");
    expect(updates).toHaveLength(1);
    const q = rendered(updates[0]!.where);
    expect(q.sql).toContain(`${FINGERPRINT_SQL} = $`);
    expect(q.params).toContain(LOADED);
    expect(q.sql).toContain('"clinical_records"."status" = $');
    expect(q.params).toContain("draft");
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ action: "clinical_record.sign" });
  });

  it("an UPDATE that matched no row (something moved in between) signs nothing and writes no audit", async () => {
    makeTx([[{ practitionerId: "thera-1", status: "draft", dataHash: LOADED }]], [[]]);
    expect(await codeOf(signAndLockRecord(therapist, "rec-1", LOADED))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a record that is no longer a draft is still reported as finalized", async () => {
    makeTx([[{ practitionerId: "thera-1", status: "signed", dataHash: LOADED }]], []);
    expect(await codeOf(signAndLockRecord(therapist, "rec-1", LOADED))).toBe("finalized");
  });
});

describe("updateRecordData: a save hands back the fingerprint of what it stored", () => {
  it("returns the RETURNING fingerprint, computed by the database from the stored data", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", schema: null, createdAt: new Date("2026-09-27T10:00:00Z") }]],
      [[{ dataHash: OTHER }]],
    );
    await expect(updateRecordData(therapist, "rec-1", { consultation_reason: "dor" })).resolves.toEqual({
      dataHash: OTHER,
    });
    const returning = updates[0]!.returning;
    expect(returning && dialect.sqlToQuery(returning["dataHash"]!).sql).toBe(FINGERPRINT_SQL);
  });

  it("an UPDATE that returned no row saved nothing: not_found, no audit", async () => {
    makeTx([[{ practitionerId: "thera-1", status: "draft", schema: null, createdAt: new Date() }]], [[]]);
    expect(await codeOf(updateRecordData(therapist, "rec-1", {}))).toBe("not_found");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("finalizeReview: the reviewer signs the content they saw, on both branches", () => {
  it("AI draft: a differing fingerprint is refused as stale before any write", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", dataHash: OTHER }]],
      [],
    );
    expect(await codeOf(finalizeReview(therapist, "rec-1", LOADED))).toBe("stale");
    expect(updates).toHaveLength(0);
  });

  it("AI draft: the finalize UPDATE carries the fingerprint in its own WHERE", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", dataHash: LOADED }]],
      [[{ id: "rec-1" }]],
    );
    expect(await codeOf(finalizeReview(therapist, "rec-1", LOADED))).toBe("resolved");
    const q = rendered(updates[0]!.where);
    expect(q.sql).toContain(`${FINGERPRINT_SQL} = $`);
    expect(q.params).toContain(LOADED);
    expect(q.params).toContain("in_review");
  });

  it("AI draft: an UPDATE that matched no row finalizes nothing and writes no audit", async () => {
    makeTx([[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", dataHash: LOADED }]], [[]]);
    expect(await codeOf(finalizeReview(therapist, "rec-1", LOADED))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("patient submission: the record UPDATE carries the fingerprint in its own WHERE", async () => {
    const { updates } = makeTx(
      [
        [{ practitionerId: "thera-1", status: "draft", source: "patient", aiState: null, dataHash: LOADED }],
        [{ id: "sub-1", state: "in_review" }],
      ],
      [[{ id: "rec-1" }], []],
    );
    expect(await codeOf(finalizeReview(therapist, "rec-1", LOADED))).toBe("resolved");
    const q = rendered(updates[0]!.where);
    expect(q.sql).toContain(`${FINGERPRINT_SQL} = $`);
    expect(q.params).toContain(LOADED);
  });

  it("patient submission: a differing fingerprint is refused as stale before any write", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "patient", aiState: null, dataHash: OTHER }]],
      [],
    );
    expect(await codeOf(finalizeReview(therapist, "rec-1", LOADED))).toBe("stale");
    expect(updates).toHaveLength(0);
  });
});

describe("the review saves hand back the fingerprint a finalize must name", () => {
  it("saveReviewFicha returns the RETURNING fingerprint", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", formTemplateId: null, createdAt: new Date() }]],
      [[{ dataHash: OTHER }]],
    );
    await expect(saveReviewFicha(therapist, "rec-1", { consultation_reason: "dor" }, null, "tpl-1")).resolves.toEqual({
      dataHash: OTHER,
    });
    expect(dialect.sqlToQuery(updates[0]!.returning!["dataHash"]!).sql).toBe(FINGERPRINT_SQL);
  });

  it("saveReviewFicha: an UPDATE that matched no row saved nothing (finalized in between)", async () => {
    makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", formTemplateId: null, createdAt: new Date() }]],
      [[]],
    );
    expect(await codeOf(saveReviewFicha(therapist, "rec-1", {}, null, null))).toBe("finalized");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("editReviewNarrative with nothing to apply writes nothing and returns the stored fingerprint", async () => {
    const { updates } = makeTx(
      [[{ practitionerId: "thera-1", status: "draft", source: "ai_ingested", aiState: "in_review", data: {}, dataHash: LOADED, schema: null }]],
      [],
    );
    await expect(editReviewNarrative(therapist, "rec-1", {})).resolves.toEqual({ dataHash: LOADED });
    expect(updates).toHaveLength(0);
  });
});
