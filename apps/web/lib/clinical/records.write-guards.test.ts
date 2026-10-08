import { beforeEach, describe, expect, it, vi } from "vitest";

// The registo writers in records.ts follow the permission matrix, which 0097
// (held, packages/db/migrations-pending/NEXT-AFTER-0096_clinical_records_
// write_matrix.sql) enforces in the clinical_records write policies once
// applied, and say WHY a write that touched no row did not happen.
//
//   * updateRecordData, signAndLockRecord and hardDeleteClinicalRecord read the
//     row first and read back the rows their write touched. 0 rows writes NO
//     audit row, and its code is chosen from the row read first
//     (`zeroRowRefusal`): a therapist on a registo WITH ANOTHER AUTHOR is
//     `not_author` (from 0097 row level security admits no row for them);
//     anyone else, and any registo with NO author yet, lost a race and gets
//     the writer's own code (`not_found` for a save or a delete, `stale` for a
//     sign). So a colleague's sign is never reported as "changed in the
//     meantime", and a race on an unauthored draft is never reported as
//     someone else's.
//   * createDraftRecord and createAddendum ask, for a therapist, whether the
//     patient is one they treat or created BEFORE the INSERT, so a patient
//     outside that scope is `not_found`. Before 0097 this refusal is the
//     app's own (0045's INSERT admits a therapist filing in their own name for
//     any patient); from 0097 it also keeps the INSERT from reaching the policy
//     as a raw 42501. EPI-01b (R4 round 1): every OTHER role is asked too, with
//     a plain patient read under its RLS, because 0097's owner arm checks only
//     tenant_id and the foreign key ignores RLS: an owner could otherwise file
//     for another tenant's patient id.
//
// On a mock transaction (no live DB): each guard is shown to fire on its 0-row
// or empty-scope answer, and its control shows the same call succeeding and
// auditing on the non-empty answer. Deleting a guard, or collapsing the two
// 0-row codes into one, turns an arm red. The policies themselves are measured
// against a real database in
// packages/db/tests/clinical-records-write-matrix.db.test.ts.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => "127.0.0.1"),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { clinicalEpisodes, clinicalRecords, migrationStagingRows, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { specialtyEpisodeLock } from "./episodes";
import { isClinicalError } from "./errors";
import { EPISODE_PATIENT_TENANT_KEY } from "./episode-key-refusal";
import {
  assertEpisodeIsThePatients,
  createAddendum,
  createDraftRecord,
  hardDeleteClinicalRecord,
  signAndLockRecord,
  updateRecordData,
  zeroRowRefusal,
} from "./records";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);

const TENANT = "11111111-1111-4111-8111-111111111111";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const COLLEAGUE_ID = "88888888-8888-4888-8888-888888888888";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: "33333333-3333-4333-8333-333333333333" };
const PATIENT = "44444444-4444-4444-8444-444444444444";
const RECORD = "55555555-5555-4555-8555-555555555555";
const HASH = "0123456789abcdef0123456789abcdef";

/**
 * A fake transaction. Each `select(...)` chain answers the next entry of
 * `selects` (and records which table it read); `update(...).returning()` and
 * `delete(...).returning()` on clinical_records answer `written`, on any other
 * table one row; `insert(...).returning()` answers one new id. Every write is
 * recorded in `ops`, in order. A chain answers at `.limit()`, at `.orderBy()`
 * or when awaited at `.where()`. `execute(...)` (the R31 advisory lock) answers
 * nothing and is recorded in `executed`, with how many selects had started
 * before it. `registoInsertFails`, when given, is what the INSERT into
 * clinical_records rejects with (the insert is still recorded in `ops`).
 */
function fakeTx(opts: { selects: unknown[][]; written?: unknown[]; registoInsertFails?: unknown }) {
  const selects = [...opts.selects];
  const read: unknown[] = [];
  const ops: string[] = [];
  const inserted: unknown[] = [];
  const executed: { query: unknown; readsBefore: number }[] = [];
  const selectChain = () => {
    const rows = selects.shift();
    if (rows === undefined) throw new Error("fakeTx: an unexpected select");
    const b: Record<string, unknown> = {};
    b.from = (table: unknown) => {
      read.push(table);
      return b;
    };
    b.leftJoin = () => b;
    b.where = () => b;
    b.limit = async () => rows;
    b.orderBy = async () => rows;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
    return b;
  };
  const answer = (verb: string, table: unknown) => async () => {
    const own = table === clinicalRecords;
    ops.push(`${verb}:${own ? "clinical_records" : "other"}`);
    return own ? (opts.written ?? []) : [{ id: "99999999-9999-4999-8999-999999999999" }];
  };
  const tx = {
    select: () => selectChain(),
    execute: async (query: unknown) => {
      executed.push({ query, readsBefore: read.length });
      return [];
    },
    update: (table: unknown) => ({
      set: () => ({ where: () => ({ returning: answer("update", table) }) }),
    }),
    delete: (table: unknown) => ({ where: () => ({ returning: answer("delete", table) }) }),
    insert: (table: unknown) => ({
      values: (v: unknown) => ({
        returning: async () => {
          ops.push(table === clinicalRecords ? "insert:clinical_records" : "insert:other");
          if (table === clinicalRecords && opts.registoInsertFails !== undefined) throw opts.registoInsertFails;
          inserted.push(v);
          return [{ id: "66666666-6666-4666-8666-666666666666" }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { read, ops, inserted, executed, pendingSelects: selects };
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

const draft = (author: string | null) => ({
  status: "draft",
  practitionerId: author,
  schema: null,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  dataHash: HASH,
  version: 1,
});

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
});

describe("zeroRowRefusal: which code a write that touched no row gets", () => {
  it("a therapist who is not the author: not_author, whatever the writer's own code", () => {
    for (const moved of ["not_found", "stale", "finalized"] as const) {
      expect(zeroRowRefusal(therapist, COLLEAGUE_ID, moved).code).toBe("not_author");
    }
  });

  it("a registo with no author yet (every claimed AI draft before 0097): the writer's own code, a race", () => {
    for (const moved of ["not_found", "stale", "finalized"] as const) {
      expect(zeroRowRefusal(therapist, null, moved).code).toBe(moved);
      expect(zeroRowRefusal(therapist, undefined, moved).code).toBe(moved);
    }
  });

  it("CONTROL the author: the writer's own code (the row moved in between)", () => {
    expect(zeroRowRefusal(therapist, THERAPIST_ID, "stale").code).toBe("stale");
    expect(zeroRowRefusal(therapist, THERAPIST_ID, "not_found").code).toBe("not_found");
  });

  it("CONTROL the owner, whose arm admits every registo: the writer's own code", () => {
    expect(zeroRowRefusal(owner, COLLEAGUE_ID, "stale").code).toBe("stale");
  });
});

describe("updateRecordData: an UPDATE that touched no row is a refusal, never a save", () => {
  it("0 rows on a colleague's draft: not_author, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[draft(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(updateRecordData(therapist, RECORD, { observations: "x" }))).toBe("not_author");
    expect(ops).toEqual(["update:clinical_records"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft (it moved in between): not_found, and no audit row", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [] });
    expect(await codeOf(updateRecordData(therapist, RECORD, { observations: "x" }))).toBe("not_found");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: 1 row saves and writes one audit row", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [{ dataHash: HASH }] });
    expect(await codeOf(updateRecordData(therapist, RECORD, { observations: "x" }))).toBe("resolved");
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ action: "clinical_record.update", entityId: RECORD });
  });
});

describe("signAndLockRecord: a sign that touched no row says why", () => {
  it("0 rows on a colleague's draft: not_author, never stale, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[draft(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(signAndLockRecord(therapist, RECORD, HASH))).toBe("not_author");
    expect(ops).toEqual(["update:clinical_records"]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft (another save or sign won): stale, and no audit row", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [] });
    expect(await codeOf(signAndLockRecord(therapist, RECORD, HASH))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on a draft with no author yet: stale (a race), never not_author, and no audit row", async () => {
    fakeTx({ selects: [[draft(null)]], written: [] });
    expect(await codeOf(signAndLockRecord(therapist, RECORD, HASH))).toBe("stale");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: 1 row signs and writes one audit row", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [{ id: RECORD }] });
    expect(await codeOf(signAndLockRecord(therapist, RECORD, HASH))).toBe("resolved");
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ action: "clinical_record.sign", entityId: RECORD });
  });
});

describe("hardDeleteClinicalRecord: a DELETE that touched no row says why", () => {
  it("0 rows on a colleague's draft: not_author, and no audit row", async () => {
    const { ops } = fakeTx({ selects: [[draft(COLLEAGUE_ID)]], written: [] });
    expect(await codeOf(hardDeleteClinicalRecord(therapist, RECORD))).toBe("not_author");
    expect(ops.at(-1)).toBe("delete:clinical_records");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("0 rows on the caller's own draft: not_found, as on main", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [] });
    expect(await codeOf(hardDeleteClinicalRecord(therapist, RECORD))).toBe("not_found");
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: 1 row deletes and writes one audit row", async () => {
    fakeTx({ selects: [[draft(THERAPIST_ID)]], written: [{ id: RECORD }] });
    expect(await codeOf(hardDeleteClinicalRecord(therapist, RECORD))).toBe("resolved");
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });
});

describe("createDraftRecord: a therapist files only for a patient they treat or created", () => {
  const input = { patientId: PATIENT, formTemplateId: "77777777-7777-4777-8777-777777777777" };

  it("a patient outside the therapist's scope: not_found, before any INSERT, and no audit row", async () => {
    const { read, ops } = fakeTx({ selects: [[]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("not_found");
    expect(read).toEqual([patients]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: a patient in scope is filed and audited", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("resolved");
    expect(read).toEqual([patients]);
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it("the owner is asked too (EPI-01b R4): one patient read under RLS, then the INSERT", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(owner, input))).toBe("resolved");
    expect(read).toEqual([patients]);
    expect(ops).toEqual(["insert:clinical_records"]);
  });

  it("the owner, with a patient RLS does not show (another tenant's): not_found, no INSERT, no audit", async () => {
    const { read, ops } = fakeTx({ selects: [[]] });
    expect(await codeOf(createDraftRecord(owner, input))).toBe("not_found");
    expect(read).toEqual([patients]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a malformed patient id: not_found before any read, for the owner and a therapist", async () => {
    for (const who of [owner, therapist]) {
      const { read, ops } = fakeTx({ selects: [] });
      expect(await codeOf(createDraftRecord(who, { ...input, patientId: "not-a-uuid" }))).toBe("not_found");
      expect(read).toEqual([]);
      expect(ops).toEqual([]);
    }
  });
});

describe("createAddendum: a new version meets the same test as any registo", () => {
  const SOURCE = { patientId: PATIENT, episodeId: null, formTemplateId: null, appointmentId: null, data: {}, version: 1 };

  it("a patient outside the therapist's scope: not_found, before any INSERT, and no audit row", async () => {
    const { read, ops } = fakeTx({ selects: [[SOURCE], []] });
    expect(await codeOf(createAddendum(therapist, RECORD))).toBe("not_found");
    expect(read).toEqual([clinicalRecords, patients]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: a patient in scope gets the new version, audited", async () => {
    const { read, ops } = fakeTx({ selects: [[SOURCE], [{ id: PATIENT }]] });
    expect(await codeOf(createAddendum(therapist, RECORD))).toBe("resolved");
    expect(read).toEqual([clinicalRecords, patients]);
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ action: "clinical_record.version" });
  });

  it("the owner: the source, then the patient under RLS (EPI-01b R4), then the INSERT", async () => {
    const { read, ops } = fakeTx({ selects: [[SOURCE], [{ id: PATIENT }]] });
    expect(await codeOf(createAddendum(owner, RECORD))).toBe("resolved");
    expect(read).toEqual([clinicalRecords, patients]);
    expect(ops).toEqual(["insert:clinical_records"]);
  });

  // EPI-01a: the Registos tab keeps a new version in its record's episode group
  // because the version COPIES the source's episode_id. Pinned here, at the
  // writer, so a version that stopped copying it (and so fell into "Sem
  // episódio") is red.
  it("a new version carries the source's episode, so it stays in that episode's group", async () => {
    const EPISODE = "77777777-7777-4777-8777-777777777777";
    // EPI-01b: the version's episode is now held to Q9's app half, so the
    // writer also reads the episode (the same patient, in this tenant).
    const { inserted } = fakeTx({
      selects: [[{ ...SOURCE, episodeId: EPISODE }], [{ id: PATIENT }], [{ tenantId: TENANT, patientId: PATIENT }]],
    });
    expect(await codeOf(createAddendum(owner, RECORD))).toBe("resolved");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ episodeId: EPISODE });
  });
});

// ---------------------------------------------------------------------------
// EPI-01b (S-1002-D P2.2): Q9, THE APP HALF. A registo with an episode_id is
// filed only in an episode of the SAME patient, in the SAME tenant. The guard
// (`assertEpisodeIsThePatients`) reads the episode in the writer's own
// transaction, before the INSERT: a refusal is `episode_mismatch`, nothing is
// inserted and no audit row is written. Every refusal arm has a control that
// differs from it in ONE value and files. The real policies and rows are in
// records.episode-guard.db.test.ts.
// ---------------------------------------------------------------------------
describe("Q9 app half: createDraftRecord files a registo only in the same patient's episode", () => {
  const EPISODE = "77777777-7777-4777-8777-777777777771";
  const OTHER_PATIENT = "44444444-4444-4444-8444-444444444445";
  const OTHER_TENANT = "11111111-1111-4111-8111-111111111112";
  const input = { patientId: PATIENT, formTemplateId: "77777777-7777-4777-8777-777777777777", episodeId: EPISODE };
  const mine = { tenantId: TENANT, patientId: PATIENT, status: "open" };

  it("another patient's episode: episode_mismatch, read after the patient test, no INSERT, no audit", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }], [{ tenantId: TENANT, patientId: OTHER_PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("episode_mismatch");
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("another tenant's episode (RLS shows no row): episode_mismatch, no INSERT, no audit", async () => {
    const { ops } = fakeTx({ selects: [[{ id: PATIENT }], []] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("episode_mismatch");
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("another tenant's episode READ BACK (the tenant is compared, not left to the policy): episode_mismatch", async () => {
    const { ops } = fakeTx({ selects: [[{ id: PATIENT }], [{ tenantId: OTHER_TENANT, patientId: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("episode_mismatch");
    expect(ops).toEqual([]);
  });

  it("a malformed episode id: episode_mismatch before any episode read (never a raw 22P02)", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, episodeId: "not-a-uuid" }))).toBe("episode_mismatch");
    expect(read).toEqual([patients]);
    expect(ops).toEqual([]);
  });

  it("the owner is held to it too: the patient read, the episode read, refused", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }], [{ tenantId: TENANT, patientId: OTHER_PATIENT, status: "open" }]] });
    expect(await codeOf(createDraftRecord(owner, input))).toBe("episode_mismatch");
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(ops).toEqual([]);
  });

  it("a CLOSED episode of the same patient (every imported one is): episode_closed, no INSERT, no audit (R4 round 1)", async () => {
    const { read, ops } = fakeTx({ selects: [[{ id: PATIENT }], [{ ...mine, status: "closed" }]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("episode_closed");
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: the same patient's episode in this tenant is filed in it, and audited with it", async () => {
    const { read, ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [mine]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("resolved");
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(inserted[0]).toMatchObject({ patientId: PATIENT, episodeId: EPISODE, practitionerId: THERAPIST_ID });
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({
      action: "clinical_record.create",
      metadata: { patientId: PATIENT, episodeId: EPISODE },
    });
  });

  it("CONTROL: no episode asks nothing about episodes and files with none", async () => {
    const { read, inserted } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, episodeId: null }))).toBe("resolved");
    expect(read).toEqual([patients]);
    expect(inserted[0]).toMatchObject({ episodeId: null });
  });

  it("the refusal logs one line, and the line carries no identifier (rule 7)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fakeTx({ selects: [[{ id: PATIENT }], [{ tenantId: TENANT, patientId: OTHER_PATIENT }]] });
      await codeOf(createDraftRecord(therapist, input));
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]![0]);
      expect(line).toContain("episode_mismatch");
      for (const id of [EPISODE, PATIENT, OTHER_PATIENT, TENANT, THERAPIST_ID]) expect(line).not.toContain(id);
    } finally {
      warn.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// EPI-01b, strategy ruling R31 (Q7): "+ Avaliação" on an imported group "reuses
// the patient's open app episode of that specialty and creates one only when
// none exists". The decision is the SERVER'S, in the writer's own transaction:
// after the patient test, under an advisory lock, the patient's open episodes
// are read, then the import ledger for the ones whose title names the
// specialty, and the one chosen goes through Q9's guard like a posted id.
//
// The fake transaction answers each read with the rows an arm gives it, so an
// arm can hand the writer a row the real WHERE clause would never return (a
// closed episode, another patient's): the writer must still not reuse it. The
// choice itself is pinned value by value in episode-reuse-core.test.ts, and the
// real rows, RLS and lock in records.episode-guard.db.test.ts.
// ---------------------------------------------------------------------------
describe("Q7, R31: '+ Avaliação' on an imported group reuses the open app episode of the specialty, or opens one", () => {
  const input = { patientId: PATIENT, formTemplateId: "77777777-7777-4777-8777-777777777777" };
  const NEW_ID = "66666666-6666-4666-8666-666666666666"; // fakeTx answers every INSERT with this id
  const OPEN_EP = "77777777-7777-4777-8777-777777777781";
  const OTHER_PATIENT = "44444444-4444-4444-8444-444444444445";
  const open = (over: Record<string, unknown> = {}) => ({
    id: OPEN_EP,
    tenantId: TENANT,
    patientId: PATIENT,
    status: "open",
    title: "Osteopatia (01/10/2026)",
    openedAt: new Date("2026-10-01T09:00:00Z"),
    ...over,
  });
  /** What the guard reads back for the chosen episode. */
  const guardRow = { tenantId: TENANT, patientId: PATIENT, status: "open" };
  const osteo = { ...input, newEpisodeSpecialty: "Osteopatia" };
  const OPENED_NEW = ["insert:other", "insert:clinical_records"];
  const auditActions = () => mockAudit.mock.calls.map((c) => c[1].action);

  it("CREATE, none exists: one open episode titled with the specialty and the Lisbon date, then the registo in it, both audited", async () => {
    const { read, ops, inserted, pendingSelects } = fakeTx({ selects: [[{ id: PATIENT }], []] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    // The patient test, then the patient's open episodes; no ledger read (nothing to ask about).
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(pendingSelects).toEqual([]);
    expect(ops).toEqual(OPENED_NEW);
    expect(inserted[0]).toMatchObject({
      tenantId: TENANT,
      patientId: PATIENT,
      primaryPractitionerId: THERAPIST_ID,
      status: "open",
    });
    expect((inserted[0] as { title: string }).title).toMatch(/^Osteopatia \(\d{2}\/\d{2}\/\d{4}\)$/);
    expect(inserted[1]).toMatchObject({ patientId: PATIENT, episodeId: NEW_ID });
    expect(auditActions()).toEqual(["clinical_episode.create", "clinical_record.create"]);
  });

  it("REUSE, one open app episode of the specialty: the registo is filed in it and NO episode is opened", async () => {
    const { read, ops, inserted, pendingSelects } = fakeTx({ selects: [[{ id: PATIENT }], [open()], [], [guardRow]] });
    const filed = await createDraftRecord(therapist, osteo);
    expect(filed.episodeId).toBe(OPEN_EP);
    // The patient, the open episodes, the ledger for the candidate, then Q9's guard on the chosen one.
    expect(read).toEqual([patients, clinicalEpisodes, migrationStagingRows, clinicalEpisodes]);
    expect(pendingSelects).toEqual([]);
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ patientId: PATIENT, episodeId: OPEN_EP, practitionerId: THERAPIST_ID });
    // One audit row, the registo's, naming the episode it went into; no clinical_episode.create.
    expect(auditActions()).toEqual(["clinical_record.create"]);
    expect(mockAudit.mock.calls[0]![1]).toMatchObject({ metadata: { patientId: PATIENT, episodeId: OPEN_EP } });
  });

  it("the owner reuses it the same way", async () => {
    const { ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [open()], [], [guardRow]] });
    expect(await codeOf(createDraftRecord(owner, osteo))).toBe("resolved");
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(inserted[0]).toMatchObject({ episodeId: OPEN_EP, practitionerId: owner.userId });
  });

  it("a CLOSED episode of the specialty is not reused: a new one is opened", async () => {
    const { ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [open({ status: "closed" })], []] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(ops).toEqual(OPENED_NEW);
    expect(inserted[1]).toMatchObject({ episodeId: NEW_ID });
    expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
  });

  it("ANOTHER PATIENT'S open episode of the specialty is never reused: a new one is opened for this patient", async () => {
    const { ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [open({ patientId: OTHER_PATIENT })], []] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(ops).toEqual(OPENED_NEW);
    expect(inserted[0]).toMatchObject({ patientId: PATIENT });
    expect(inserted[1]).toMatchObject({ patientId: PATIENT, episodeId: NEW_ID });
    expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
  });

  it("ANOTHER TENANT'S is never reused", async () => {
    const { ops, inserted } = fakeTx({
      selects: [[{ id: PATIENT }], [open({ tenantId: "11111111-1111-4111-8111-111111111112" })], []],
    });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(ops).toEqual(OPENED_NEW);
    expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
  });

  it("ANOTHER SPECIALTY'S open episode is not reused: a new one is opened, and the ledger is not even asked", async () => {
    const { read, ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [open({ title: "Fisioterapia (01/10/2026)" })]] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(read).toEqual([patients, clinicalEpisodes]);
    expect(ops).toEqual(OPENED_NEW);
    expect((inserted[0] as { title: string }).title).toMatch(/^Osteopatia \(/);
    expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
  });

  it("an open episode that names no specialty (the 'Novo episódio' default) is not reused", async () => {
    const { ops } = fakeTx({ selects: [[{ id: PATIENT }], [open({ title: "Episódio (01/10/2026)" })]] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(ops).toEqual(OPENED_NEW);
  });

  it("an episode THE IMPORT LEDGER NAMES is never reused, even open: a new one is opened", async () => {
    const { read, ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], [open({ title: "Osteopatia" })], [{ id: OPEN_EP }]] });
    expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
    expect(read).toEqual([patients, clinicalEpisodes, migrationStagingRows]);
    expect(ops).toEqual(OPENED_NEW);
    expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
  });

  it("MORE THAN ONE open app episode of the specialty: the most recently opened, whatever order they are read in", async () => {
    const OLDER = "77777777-7777-4777-8777-77777777778f";
    const older = open({ id: OLDER, title: "Osteopatia (01/09/2026)", openedAt: new Date("2026-09-01T09:00:00Z") });
    for (const rows of [
      [older, open()],
      [open(), older],
    ]) {
      mockAudit.mockReset();
      const { ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }], rows, [], [guardRow]] });
      expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("resolved");
      expect(ops).toEqual(["insert:clinical_records"]);
      expect(inserted[0]).toMatchObject({ episodeId: OPEN_EP });
    }
  });

  it("the reused episode is held to Q9's guard: one the guard reads as another patient's, or closed, files nothing and opens nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const [row, code] of [
        [{ ...guardRow, patientId: OTHER_PATIENT }, "episode_mismatch"],
        [{ ...guardRow, status: "closed" }, "episode_closed"],
      ] as const) {
        mockAudit.mockReset();
        const { ops } = fakeTx({ selects: [[{ id: PATIENT }], [open()], [], [row]] });
        expect(await codeOf(createDraftRecord(therapist, osteo)), code).toBe(code);
        expect(ops).toEqual([]);
        expect(mockAudit).not.toHaveBeenCalled();
      }
    } finally {
      warn.mockRestore();
    }
  });

  it("THE LOCK: one, for this tenant, patient and specialty, taken after the patient test and before the episodes are read", async () => {
    const { executed } = fakeTx({ selects: [[{ id: PATIENT }], []] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, newEpisodeSpecialty: "Fisioterapia" }))).toBe("resolved");
    expect(executed).toHaveLength(1);
    expect(executed[0]!.readsBefore).toBe(1); // patients only
    const dialect = new PgDialect();
    const taken = dialect.sqlToQuery(executed[0]!.query as SQL);
    expect(taken).toEqual(dialect.sqlToQuery(specialtyEpisodeLock(TENANT, PATIENT, "Fisioterapia")));
    // Transaction-scoped, and keyed on all three: never table-wide, never session-held.
    expect(taken.sql.replace(/\s+/g, " ")).toBe("select pg_advisory_xact_lock(hashtextextended($1, 0))");
    expect(taken.params).toEqual([`clinical-episode-specialty:${TENANT}:${PATIENT}:Fisioterapia`]);
    // Another patient or specialty is another lock.
    expect(dialect.sqlToQuery(specialtyEpisodeLock(TENANT, PATIENT, "Osteopatia")).params).not.toEqual(taken.params);
    expect(dialect.sqlToQuery(specialtyEpisodeLock(TENANT, OTHER_PATIENT, "Fisioterapia")).params).not.toEqual(taken.params);
  });

  // R4 on the R31 commit, MINOR 1: an id posted in UPPERCASE names the same
  // patient (Postgres reads a uuid in either case, so the patient test passes),
  // but the choice of episode, the guard and the lock key work on TEXT. The
  // writer puts the id in its canonical lowercase form once, before any of them.
  describe("a patient id posted in UPPERCASE is the same patient", () => {
    const UPPER = PATIENT.toUpperCase().replace(/4/g, "A"); // hex letters, so the two really differ as text
    const LOWER = UPPER.toLowerCase();
    const row = open({ patientId: LOWER });
    const guardOf = { tenantId: TENANT, patientId: LOWER, status: "open" };
    const dialect = new PgDialect();
    const lockOf = (q: unknown) => dialect.sqlToQuery(q as SQL).params;

    it("control: the posted id and the row's differ as text", () => {
      expect(UPPER).not.toBe(LOWER);
      expect(UPPER).toMatch(/[A-F]/);
    });

    it("REUSE: the open episode is reused, NO second one is opened, and the registo carries the canonical id", async () => {
      const { ops, inserted, executed } = fakeTx({ selects: [[{ id: LOWER }], [row], [], [guardOf]] });
      const filed = await createDraftRecord(therapist, { ...osteo, patientId: UPPER });
      expect(filed.episodeId).toBe(OPEN_EP);
      expect(ops).toEqual(["insert:clinical_records"]);
      expect(inserted[0]).toMatchObject({ patientId: LOWER, episodeId: OPEN_EP });
      expect(mockAudit.mock.calls[0]![1]).toMatchObject({ metadata: { patientId: LOWER, episodeId: OPEN_EP } });
      // THE SAME LOCK as the lowercase request: the two wait for each other.
      expect(executed).toHaveLength(1);
      expect(lockOf(executed[0]!.query)).toEqual(lockOf(specialtyEpisodeLock(TENANT, LOWER, "Osteopatia")));
      expect(lockOf(executed[0]!.query)).toEqual([`clinical-episode-specialty:${TENANT}:${LOWER}:Osteopatia`]);
    });

    it("the lowercase request, for comparison: the same episode and the same lock key", async () => {
      const { ops, inserted, executed } = fakeTx({ selects: [[{ id: LOWER }], [row], [], [guardOf]] });
      expect((await createDraftRecord(therapist, { ...osteo, patientId: LOWER })).episodeId).toBe(OPEN_EP);
      expect(ops).toEqual(["insert:clinical_records"]);
      expect(inserted[0]).toMatchObject({ patientId: LOWER, episodeId: OPEN_EP });
      expect(lockOf(executed[0]!.query)).toEqual([`clinical-episode-specialty:${TENANT}:${LOWER}:Osteopatia`]);
    });

    it("CREATE with an uppercase id: the new episode and the registo carry the canonical id, under the same lock key", async () => {
      const { ops, inserted, executed } = fakeTx({ selects: [[{ id: LOWER }], []] });
      expect(await codeOf(createDraftRecord(therapist, { ...osteo, patientId: UPPER }))).toBe("resolved");
      expect(ops).toEqual(OPENED_NEW);
      expect(inserted[0]).toMatchObject({ patientId: LOWER });
      expect(inserted[1]).toMatchObject({ patientId: LOWER, episodeId: NEW_ID });
      expect(lockOf(executed[0]!.query)).toEqual([`clinical-episode-specialty:${TENANT}:${LOWER}:Osteopatia`]);
    });

    it("the lock key is canonical whoever builds it: uppercase tenant and patient give the lowercase key", () => {
      const UPPER_TENANT = "1111ABCD-1111-4111-8111-11111111ABCD"; // TENANT has no hex letter, so it has no uppercase form
      expect(UPPER_TENANT).not.toBe(UPPER_TENANT.toLowerCase());
      expect(lockOf(specialtyEpisodeLock(UPPER_TENANT, UPPER, "Osteopatia"))).toEqual([
        `clinical-episode-specialty:${UPPER_TENANT.toLowerCase()}:${LOWER}:Osteopatia`,
      ]);
      expect(lockOf(specialtyEpisodeLock(UPPER_TENANT, LOWER, "Osteopatia"))).toEqual(
        lockOf(specialtyEpisodeLock(UPPER_TENANT.toLowerCase(), LOWER, "Osteopatia")),
      );
      expect(lockOf(specialtyEpisodeLock(TENANT, UPPER, "Osteopatia"))).toEqual(lockOf(specialtyEpisodeLock(TENANT, LOWER, "Osteopatia")));
    });

    it("a posted EPISODE of the patient is accepted with an uppercase patient id too (the guard gets the canonical id)", async () => {
      const { ops, inserted } = fakeTx({ selects: [[{ id: LOWER }], [guardOf]] });
      const posted = { ...input, patientId: UPPER, episodeId: OPEN_EP };
      expect(await codeOf(createDraftRecord(therapist, posted))).toBe("resolved");
      expect(ops).toEqual(["insert:clinical_records"]);
      expect(inserted[0]).toMatchObject({ patientId: LOWER, episodeId: OPEN_EP });
    });

    it("CONTROL: case is all it forgives. An uppercase id of ANOTHER patient does not reuse this one's episode", async () => {
      const other = OTHER_PATIENT.toUpperCase();
      const { ops, inserted } = fakeTx({ selects: [[{ id: OTHER_PATIENT }], [row], []] });
      expect(await codeOf(createDraftRecord(therapist, { ...osteo, patientId: other }))).toBe("resolved");
      expect(ops).toEqual(OPENED_NEW);
      expect(inserted[1]).toMatchObject({ patientId: OTHER_PATIENT, episodeId: NEW_ID });
      expect(JSON.stringify(inserted)).not.toContain(OPEN_EP);
    });
  });

  it("no specialty: no lock and no episode read (the /clinical/new form is untouched)", async () => {
    const { read, executed } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, input))).toBe("resolved");
    expect(read).toEqual([patients]);
    expect(executed).toEqual([]);
  });

  it("a word that is not on the list: invalid, before any transaction, nothing written", async () => {
    for (const word of ["Lombalgia aguda", "osteopatia", "Osteopatia (02/10/2026)", "Episódio"]) {
      mockRunScoped.mockReset();
      expect(await codeOf(createDraftRecord(therapist, { ...input, newEpisodeSpecialty: word })), word).toBe("invalid");
      expect(mockRunScoped).not.toHaveBeenCalled();
    }
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("an episode id AND a specialty: invalid, nothing written", async () => {
    const both = { ...input, episodeId: "77777777-7777-4777-8777-777777777771", newEpisodeSpecialty: "Osteopatia" };
    expect(await codeOf(createDraftRecord(therapist, both))).toBe("invalid");
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a patient outside the therapist's scope: not_found, NO lock, no episode read, and NO episode is opened or reused", async () => {
    const { read, ops, executed } = fakeTx({ selects: [[]] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, newEpisodeSpecialty: "Fisioterapia" }))).toBe("not_found");
    expect(read).toEqual([patients]);
    expect(executed).toEqual([]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("Q9 app half: a new version is held to the same rule as a new registo", () => {
  const SOURCE_IN = (episodeId: string) => ({
    patientId: PATIENT,
    episodeId,
    formTemplateId: null,
    appointmentId: null,
    data: {},
    version: 1,
  });
  const EPISODE = "77777777-7777-4777-8777-777777777772";

  it("a source already filed in another patient's episode: episode_mismatch, no second one", async () => {
    const { read, ops } = fakeTx({
      selects: [[SOURCE_IN(EPISODE)], [{ id: PATIENT }], [{ tenantId: TENANT, patientId: "44444444-4444-4444-8444-444444444445" }]],
    });
    expect(await codeOf(createAddendum(therapist, RECORD))).toBe("episode_mismatch");
    expect(read).toEqual([clinicalRecords, patients, clinicalEpisodes]);
    expect(ops).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("a source in a CLOSED episode of its own patient still gets its version there (EPI-01a: versions keep their episode)", async () => {
    const { ops, inserted } = fakeTx({
      selects: [[SOURCE_IN(EPISODE)], [{ id: PATIENT }], [{ tenantId: TENANT, patientId: PATIENT, status: "closed" }]],
    });
    expect(await codeOf(createAddendum(therapist, RECORD))).toBe("resolved");
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(inserted[0]).toMatchObject({ episodeId: EPISODE });
  });

  it("CONTROL: a source in its own patient's episode gets its version, in that episode", async () => {
    const { ops, inserted } = fakeTx({
      selects: [[SOURCE_IN(EPISODE)], [{ id: PATIENT }], [{ tenantId: TENANT, patientId: PATIENT }]],
    });
    expect(await codeOf(createAddendum(therapist, RECORD))).toBe("resolved");
    expect(ops).toEqual(["insert:clinical_records"]);
    expect(inserted[0]).toMatchObject({ episodeId: EPISODE });
  });
});

describe("assertEpisodeIsThePatients: the guard on its own", () => {
  const EPISODE = "77777777-7777-4777-8777-777777777773";
  const run = (rows: unknown[]) => {
    const { read } = fakeTx({ selects: [rows] });
    return { read, p: mockRunScoped(therapist, (tx) => assertEpisodeIsThePatients(tx, therapist, EPISODE, PATIENT)) };
  };

  it("requireOpen: a closed episode is episode_closed; open, or not asked, passes", async () => {
    const asked = (rows: unknown[], requireOpen: boolean) => {
      fakeTx({ selects: [rows] });
      return mockRunScoped(therapist, (tx) => assertEpisodeIsThePatients(tx, therapist, EPISODE, PATIENT, { requireOpen }));
    };
    const closed = { tenantId: TENANT, patientId: PATIENT, status: "closed" };
    expect(await codeOf(asked([closed], true))).toBe("episode_closed");
    expect(await codeOf(asked([closed], false))).toBe("resolved");
    expect(await codeOf(asked([{ ...closed, status: "open" }], true))).toBe("resolved");
    // Another patient's closed episode is still the mismatch, not the closed refusal.
    expect(await codeOf(asked([{ ...closed, patientId: RECORD }], true))).toBe("episode_mismatch");
  });

  it("passes only on a row of this tenant AND this patient", async () => {
    expect(await codeOf(run([{ tenantId: TENANT, patientId: PATIENT }]).p)).toBe("resolved");
    expect(await codeOf(run([{ tenantId: TENANT, patientId: RECORD }]).p)).toBe("episode_mismatch");
    expect(await codeOf(run([{ tenantId: RECORD, patientId: PATIENT }]).p)).toBe("episode_mismatch");
    expect(await codeOf(run([]).p)).toBe("episode_mismatch");
  });
});

// ---------------------------------------------------------------------------
// REG-03: the same rule, when it is the DATABASE that refuses. Where the
// database carries the key `episode-key-refusal.ts` names, the registo INSERT
// itself can be refused with a foreign-key violation naming it. The two writers
// that file a registo in an episode answer that refusal with the one the
// application already returns, `episode_mismatch`: no audit row, one log line
// with no identifier. Every other error leaves the writer exactly as the
// database raised it.
//
// The fake transaction passes every read (the patient test and the episode
// guard both answer yes) and rejects the INSERT with the error an arm gives it,
// in the shape Drizzle raises: its own error, the driver's at `.cause`. Which
// errors are the key's refusal is pinned value by value in
// episode-key-refusal.test.ts; the wrapped shape, against the real driver, in
// records.episode-guard.db.test.ts.
// ---------------------------------------------------------------------------
describe("REG-03: the registo INSERT refused by the database's episode key is episode_mismatch", () => {
  const EPISODE = "77777777-7777-4777-8777-777777777771";
  const TEMPLATE = "77777777-7777-4777-8777-777777777777";
  const input = { patientId: PATIENT, formTemplateId: TEMPLATE, episodeId: EPISODE };
  const mine = { tenantId: TENANT, patientId: PATIENT, status: "open" };
  const SOURCE = { patientId: PATIENT, episodeId: EPISODE, formTemplateId: TEMPLATE, appointmentId: null, data: {}, version: 1 };
  const driverError = (code: string, constraintName: string) =>
    Object.assign(new Error("a driver message that is never read"), { code, constraint_name: constraintName });
  const wrapped = (cause: unknown) => new Error("Failed query: insert into clinical_records", { cause });
  const keyRefusal = () => wrapped(driverError("23503", EPISODE_PATIENT_TENANT_KEY));
  /** The two writers, each with the reads it makes before its INSERT. */
  const writers = [
    ["createDraftRecord", [[{ id: PATIENT }], [mine]], () => createDraftRecord(therapist, input)],
    ["createAddendum", [[SOURCE], [{ id: PATIENT }], [mine]], () => createAddendum(therapist, RECORD)],
  ] as const;
  const quietly = async <T>(fn: (warn: ReturnType<typeof vi.spyOn>) => Promise<T>): Promise<T> => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return await fn(warn);
    } finally {
      warn.mockRestore();
    }
  };

  for (const [name, selects, call] of writers) {
    it(`${name}: the key's refusal, wrapped as Drizzle raises it, is episode_mismatch; no audit row`, async () => {
      await quietly(async () => {
        const { ops } = fakeTx({ selects: selects.map((r) => [...r]), registoInsertFails: keyRefusal() });
        expect(await codeOf(call())).toBe("episode_mismatch");
        // The INSERT was reached (the application's own guard had passed), and nothing follows it.
        expect(ops).toEqual(["insert:clinical_records"]);
        expect(mockAudit).not.toHaveBeenCalled();
      });
    });

    it(`${name}: the refusal logs one line, and the line carries no identifier (rule 7)`, async () => {
      await quietly(async (warn) => {
        fakeTx({ selects: selects.map((r) => [...r]), registoInsertFails: keyRefusal() });
        await codeOf(call());
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0]![0]);
        expect(line).toContain("episode_mismatch");
        for (const id of [EPISODE, PATIENT, TENANT, THERAPIST_ID, RECORD, TEMPLATE]) expect(line).not.toContain(id);
      });
    });

    it(`${name}: a foreign-key violation naming ANOTHER key reaches the caller as it was raised, unmapped`, async () => {
      const other = wrapped(driverError("23503", "clinical_records_form_template_id_form_templates_id_fk"));
      fakeTx({ selects: selects.map((r) => [...r]), registoInsertFails: other });
      await expect(call()).rejects.toBe(other);
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it(`${name}: ANOTHER SQLSTATE naming the key reaches the caller as it was raised, unmapped`, async () => {
      const other = wrapped(driverError("23514", EPISODE_PATIENT_TENANT_KEY));
      fakeTx({ selects: selects.map((r) => [...r]), registoInsertFails: other });
      await expect(call()).rejects.toBe(other);
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it(`${name} CONTROL: the same reads with an INSERT that succeeds file the registo and audit it`, async () => {
      const { ops } = fakeTx({ selects: selects.map((r) => [...r]) });
      expect(await codeOf(call())).toBe("resolved");
      expect(ops).toEqual(["insert:clinical_records"]);
      expect(mockAudit).toHaveBeenCalledTimes(1);
    });
  }

  it("'+ Avaliação' that opened an episode for the registo: the key's refusal is still episode_mismatch, and only the episode's own audit row was written before it", async () => {
    await quietly(async () => {
      // The patient test, then no open episode of the specialty: the writer opens one, then files in it.
      const { ops } = fakeTx({ selects: [[{ id: PATIENT }], []], registoInsertFails: keyRefusal() });
      const osteo = { patientId: PATIENT, formTemplateId: TEMPLATE, newEpisodeSpecialty: "Osteopatia" };
      expect(await codeOf(createDraftRecord(therapist, osteo))).toBe("episode_mismatch");
      expect(ops).toEqual(["insert:other", "insert:clinical_records"]);
      // The episode insert audits itself; the registo's audit row is never reached. The
      // refusal throws, so the writer's transaction rolls both back (proved on real rows
      // in records.episode-guard.db.test.ts, "one transaction").
      expect(mockAudit.mock.calls.map((c) => c[1].action)).toEqual(["clinical_episode.create"]);
    });
  });
});
