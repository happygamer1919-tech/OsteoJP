import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// 0099 (held, packages/db/migrations-pending/NEXT-AFTER-0098_clinical_records_
// write_matrix.sql): the review path in review.ts.
//
//   * editReviewNarrative, saveReviewFicha and finalizeReview read back the rows
//     their UPDATE touched, and 0 rows writes NO audit row. Its code is chosen
//     from the row read first (`zeroRowRefusal`, records.ts): a therapist who
//     is not the author is `not_author` (from 0099 row level security admits
//     no row for them); the author, or the owner, lost a race and gets the
//     writer's own code (`finalized` for the two saves, `stale` for finalize).
//     So a refusal is never reported as "finalized" or "changed in the
//     meantime".
//   * claimReviewItem, for a patient submission, asks whether the submission's
//     patient is one the therapist treats or created BEFORE it files the
//     registo, as createDraftRecord does, so a posted submission id for any
//     other patient is `not_found` and never reaches the INSERT.
//   * listReviewQueue shows a therapist an AI draft only while it has no author
//     or when they are its author: a draft another therapist has taken, or one
//     whose author was set by a direct call to the claim function, is theirs.
//     Asserted by rendering the captured WHERE through drizzle's real dialect,
//     with the owner as the control (no author predicate).
//
// On a mock transaction (no live DB). Deleting a guard, collapsing the two
// 0-row codes into one, or deleting the queue's author predicate turns an arm
// red.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import { clinicalRecords, patientFormSubmissions, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { isClinicalError } from "./errors";
import { claimReviewItem, editReviewNarrative, finalizeReview, listReviewQueue, saveReviewFicha } from "./review";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const COLLEAGUE_ID = "88888888-8888-4888-8888-888888888888";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: "33333333-3333-4333-8333-333333333333" };
const RECORD = "55555555-5555-4555-8555-555555555555";
const SUBMISSION = "77777777-7777-4777-8777-777777777777";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const HASH = "0123456789abcdef0123456789abcdef";

/**
 * A fake transaction. Each select chain answers the next entry of `selects`
 * and records the table it read; an UPDATE of clinical_records answers
 * `written`, of any other table one row; an INSERT answers one new id. Every
 * write is recorded in `ops`, in order.
 */
function fakeTx(opts: { selects: unknown[][]; written?: unknown[] }) {
  const selects = [...opts.selects];
  const read: unknown[] = [];
  const ops: string[] = [];
  const selectChain = () => {
    const rows = selects.shift();
    if (rows === undefined) throw new Error("fakeTx: an unexpected select");
    const b: Record<string, unknown> = {};
    b.from = (table: unknown) => {
      read.push(table);
      return b;
    };
    for (const m of ["leftJoin", "innerJoin", "where", "orderBy"]) b[m] = () => b;
    b.limit = async () => rows;
    return b;
  };
  const tx = {
    select: () => selectChain(),
    update: (table: unknown) => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            const own = table === clinicalRecords;
            ops.push(own ? "update:clinical_records" : "update:other");
            return own ? (opts.written ?? []) : [{ id: SUBMISSION }];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: () => ({
        returning: async () => {
          ops.push(table === clinicalRecords ? "insert:clinical_records" : "insert:other");
          return [{ id: "66666666-6666-4666-8666-666666666666" }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { read, ops };
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

/** A claimed AI draft: the review path's only precondition is `in_review`. */
const claimed = (author: string | null) => ({
  status: "draft",
  practitionerId: author,
  source: "ai_ingested",
  aiState: "in_review",
  data: {},
  dataHash: HASH,
  schema: null,
  formTemplateId: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
});

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
});

describe("editReviewNarrative: an UPDATE that touched no row is a refusal, never an edit", () => {
  it("0 rows on a draft another therapist authored: not_author, never finalized, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[claimed(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(editReviewNarrative(therapist, RECORD, { observations: "revisto" }))).toBe("not_author");
    expect(ops).toEqual(["update:clinical_records"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft (finalized in between): finalized, and no audit row", async () => {
    fakeTx({ selects: [[claimed(THERAPIST_ID)]], written: [] });
    expect(await codeOf(editReviewNarrative(therapist, RECORD, { observations: "revisto" }))).toBe("finalized");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: 1 row edits and writes one audit row", async () => {
    fakeTx({ selects: [[claimed(THERAPIST_ID)]], written: [{ dataHash: HASH }] });
    expect(await codeOf(editReviewNarrative(therapist, RECORD, { observations: "revisto" }))).toBe("resolved");
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });
});

describe("saveReviewFicha: an UPDATE that touched no row is a refusal, never a save", () => {
  it("0 rows on a draft another therapist authored: not_author, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[claimed(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(saveReviewFicha(therapist, RECORD, { observations: "revisto" }, null))).toBe("not_author");
    expect(ops).toEqual(["update:clinical_records"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft: finalized, and no audit row", async () => {
    fakeTx({ selects: [[claimed(THERAPIST_ID)]], written: [] });
    expect(await codeOf(saveReviewFicha(therapist, RECORD, { observations: "revisto" }, null))).toBe("finalized");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: 1 row saves and writes one audit row", async () => {
    fakeTx({ selects: [[claimed(THERAPIST_ID)]], written: [{ dataHash: HASH }] });
    expect(await codeOf(saveReviewFicha(therapist, RECORD, { observations: "revisto" }, null))).toBe("resolved");
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });
});

describe("finalizeReview: a finalize that touched no row says why", () => {
  it("0 rows on a draft another therapist authored: not_author, never stale, and no audit row", async () => {
    fakeTx({ selects: [[claimed(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(finalizeReview(therapist, RECORD, HASH))).toBe("not_author");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft (it moved in between): stale, and no audit row", async () => {
    fakeTx({ selects: [[claimed(THERAPIST_ID)]], written: [] });
    expect(await codeOf(finalizeReview(therapist, RECORD, HASH))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL the owner, on a draft another therapist authored: 0 rows is a race, stale", async () => {
    fakeTx({ selects: [[claimed(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(finalizeReview(owner, RECORD, HASH))).toBe("stale");
  });

  const fromSubmission = (author: string) => ({ ...claimed(author), source: "patient", aiState: null });
  const LINKED = { id: SUBMISSION, state: "in_review" };

  it("a patient submission's registo another therapist filed: not_author, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[fromSubmission(COLLEAGUE_ID)], [LINKED]], written: [] });
    expect(await codeOf(finalizeReview(therapist, RECORD, HASH))).toBe("not_author");
    expect(ops).toEqual(["update:clinical_records"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL a patient submission's registo the caller filed, moved in between: stale", async () => {
    fakeTx({ selects: [[fromSubmission(THERAPIST_ID)], [LINKED]], written: [] });
    expect(await codeOf(finalizeReview(therapist, RECORD, HASH))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("claimReviewItem, a patient submission: the claimer files only for a patient they treat or created", () => {
  const SUB = { reviewState: "pending_review", patientId: PATIENT, clinicalRecordId: null, payload: {} };
  const ref = { source: "patient" as const, submissionId: SUBMISSION };

  it("a patient outside the therapist's scope: not_found, before the INSERT, and no audit row", async () => {
    const { read, ops } = fakeTx({ selects: [[SUB], []] });
    expect(await codeOf(claimReviewItem(therapist, ref))).toBe("not_found");
    expect(read).toEqual([patientFormSubmissions, patients]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: a patient in scope is filed in the claimer's name, linked and audited", async () => {
    const { read, ops } = fakeTx({ selects: [[SUB], [{ id: PATIENT }]] });
    expect(await codeOf(claimReviewItem(therapist, ref))).toBe("resolved");
    expect(read).toEqual([patientFormSubmissions, patients]);
    expect(ops).toEqual(["insert:clinical_records", "update:other"]);
    expect(mockAudit).toHaveBeenCalledTimes(2);
  });

  it("the owner is not asked: one read of the submission, the INSERT runs", async () => {
    const { read, ops } = fakeTx({ selects: [[SUB]] });
    expect(await codeOf(claimReviewItem(owner, ref))).toBe("resolved");
    expect(read).toEqual([patientFormSubmissions]);
    expect(ops).toEqual(["insert:clinical_records", "update:other"]);
  });
});

describe("listReviewQueue: a therapist's AI queue holds only drafts with no author, or their own", () => {
  function captureQueue() {
    const wheres: SQL[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "from", "innerJoin", "leftJoin", "orderBy"]) b[m] = () => b;
    b.where = (w: SQL) => {
      wheres.push(w);
      return b;
    };
    b.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve([]).then(ok, fail);
    mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(b as never)));
    return wheres;
  }
  const dialect = new PgDialect();
  const AUTHOR =
    /\("clinical_records"\."practitioner_id" is null or "clinical_records"\."practitioner_id" = \$(\d+)\)/;

  it("therapist: the AI rows' WHERE carries the author predicate, bound to the caller", async () => {
    const wheres = captureQueue();
    await listReviewQueue(therapist);
    expect(wheres).toHaveLength(2);
    const ai = dialect.sqlToQuery(wheres[0]!);
    const m = ai.sql.match(AUTHOR);
    expect(m).not.toBeNull();
    expect(ai.params[Number(m![1]) - 1]).toBe(THERAPIST_ID);
    // The patient submissions carry no author yet; their WHERE is untouched.
    expect(dialect.sqlToQuery(wheres[1]!).sql).not.toContain("practitioner_id\" is null");
  });

  it("CONTROL owner: no author predicate on the AI rows", async () => {
    const wheres = captureQueue();
    await listReviewQueue(owner);
    expect(dialect.sqlToQuery(wheres[0]!).sql).not.toMatch(AUTHOR);
  });
});
