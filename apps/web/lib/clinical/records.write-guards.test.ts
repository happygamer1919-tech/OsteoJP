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
//     as a raw 42501. The owner is not asked.
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

import { clinicalEpisodes, clinicalRecords, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { isClinicalError } from "./errors";
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
 * recorded in `ops`, in order.
 */
function fakeTx(opts: { selects: unknown[][]; written?: unknown[] }) {
  const selects = [...opts.selects];
  const read: unknown[] = [];
  const ops: string[] = [];
  const inserted: unknown[] = [];
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
    return b;
  };
  const answer = (verb: string, table: unknown) => async () => {
    const own = table === clinicalRecords;
    ops.push(`${verb}:${own ? "clinical_records" : "other"}`);
    return own ? (opts.written ?? []) : [{ id: "99999999-9999-4999-8999-999999999999" }];
  };
  const tx = {
    select: () => selectChain(),
    update: (table: unknown) => ({
      set: () => ({ where: () => ({ returning: answer("update", table) }) }),
    }),
    delete: (table: unknown) => ({ where: () => ({ returning: answer("delete", table) }) }),
    insert: (table: unknown) => ({
      values: (v: unknown) => ({
        returning: async () => {
          ops.push(table === clinicalRecords ? "insert:clinical_records" : "insert:other");
          inserted.push(v);
          return [{ id: "66666666-6666-4666-8666-666666666666" }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { read, ops, inserted, pendingSelects: selects };
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

  it("the owner is not asked: no scope read, the INSERT runs", async () => {
    const { read, ops } = fakeTx({ selects: [] });
    expect(await codeOf(createDraftRecord(owner, input))).toBe("resolved");
    expect(read).toEqual([]);
    expect(ops).toEqual(["insert:clinical_records"]);
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

  it("the owner is not asked: one read of the source, the INSERT runs", async () => {
    const { read, ops } = fakeTx({ selects: [[SOURCE]] });
    expect(await codeOf(createAddendum(owner, RECORD))).toBe("resolved");
    expect(read).toEqual([clinicalRecords]);
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
      selects: [[{ ...SOURCE, episodeId: EPISODE }], [{ tenantId: TENANT, patientId: PATIENT }]],
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
  const mine = { tenantId: TENANT, patientId: PATIENT };

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

  it("the owner is held to it too: no patient read, the episode read, refused", async () => {
    const { read, ops } = fakeTx({ selects: [[{ tenantId: TENANT, patientId: OTHER_PATIENT }]] });
    expect(await codeOf(createDraftRecord(owner, input))).toBe("episode_mismatch");
    expect(read).toEqual([clinicalEpisodes]);
    expect(ops).toEqual([]);
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

describe("Q7: '+ Avaliação' on an imported group opens a NEW episode and files the registo there", () => {
  const input = { patientId: PATIENT, formTemplateId: "77777777-7777-4777-8777-777777777777" };
  const NEW_ID = "66666666-6666-4666-8666-666666666666"; // fakeTx answers every INSERT with this id

  it("a specialty on the list: one open episode titled with it and the Lisbon date, then the registo in it, both audited", async () => {
    const { read, ops, inserted } = fakeTx({ selects: [[{ id: PATIENT }]] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, newEpisodeSpecialty: "Osteopatia" }))).toBe("resolved");
    expect(read).toEqual([patients]); // no episode is read: none is written into but the new one
    expect(ops).toEqual(["insert:other", "insert:clinical_records"]);
    expect(inserted[0]).toMatchObject({
      tenantId: TENANT,
      patientId: PATIENT,
      primaryPractitionerId: THERAPIST_ID,
      status: "open",
    });
    expect((inserted[0] as { title: string }).title).toMatch(/^Osteopatia \(\d{2}\/\d{2}\/\d{4}\)$/);
    expect(inserted[1]).toMatchObject({ patientId: PATIENT, episodeId: NEW_ID });
    expect(mockAudit.mock.calls.map((c) => c[1].action)).toEqual(["clinical_episode.create", "clinical_record.create"]);
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

  it("a patient outside the therapist's scope: not_found, and NO episode is opened", async () => {
    const { ops } = fakeTx({ selects: [[]] });
    expect(await codeOf(createDraftRecord(therapist, { ...input, newEpisodeSpecialty: "Fisioterapia" }))).toBe("not_found");
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

  it("passes only on a row of this tenant AND this patient", async () => {
    expect(await codeOf(run([{ tenantId: TENANT, patientId: PATIENT }]).p)).toBe("resolved");
    expect(await codeOf(run([{ tenantId: TENANT, patientId: RECORD }]).p)).toBe("episode_mismatch");
    expect(await codeOf(run([{ tenantId: RECORD, patientId: PATIENT }]).p)).toBe("episode_mismatch");
    expect(await codeOf(run([]).p)).toBe("episode_mismatch");
  });
});
