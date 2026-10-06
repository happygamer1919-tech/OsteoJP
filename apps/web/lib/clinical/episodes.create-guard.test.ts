import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// createEpisode, "+ Episódio" on the Registos tab (EPI-01b, piece 2), on a mock
// transaction. The real rows are in episodes.create.db.test.ts.
//
//   WHO      a therapist, and no other role: owner, admin and reception are
//            refused before any transaction opens. Then a patient the therapist
//            may write registos for (the narrow scope is in the patient read's
//            WHERE), in their tenant: a patient the read does not find is
//            `not_found`, and nothing is inserted.
//   TITLE    a specialty and a date, by ruling: built on the server from a word
//            on the closed list and the Lisbon day. A word off the list is
//            `invalid`; a title (or any other text) a caller adds to the input
//            is never read.
//   OPEN     with an open app episode of the specialty already there, nothing
//            is opened and the answer names it, unless the call confirms
//            against exactly that episode. The lock is taken before the read.
//   IDS      a malformed patient id or confirmation id is `invalid` before any
//            read (EPI-01b, R4 rounds 1 and 2 on #1526), and an id posted in
//            uppercase is the same patient.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("./audit", () => ({
  writeClinicalAudit: vi.fn(async () => {}),
  clientIp: vi.fn(async () => null),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { clinicalEpisodes, clinicalRecords, migrationStagingRows, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { writeClinicalAudit } from "./audit";
import { createEpisode, listOpenAppEpisodes, specialtyEpisodeLock } from "./episodes";
import { isClinicalError } from "./errors";

const mockRunScoped = vi.mocked(runScoped);
const mockAudit = vi.mocked(writeClinicalAudit);
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as SQL);

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const OTHER_PATIENT = "45454545-4545-4545-8545-454545454545";
const NEW_ID = "66666666-6666-4666-8666-666666666666";
const EP_OLD = "7777cccc-7777-4777-8777-777777777771";
const EP_NEW = "7777cccc-7777-4777-8777-777777777772";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: "33333333-3333-4333-8333-333333333333" };
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "33333333-3333-4333-8333-333333333334" };
const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: "33333333-3333-4333-8333-333333333335" };

/** An open app episode row, as `findOpenEpisodeOfSpecialty` and `listOpenAppEpisodes` read it. */
const episode = (id: string, title: string, openedAt: string, over: Record<string, unknown> = {}) => ({
  id,
  tenantId: TENANT,
  patientId: PATIENT,
  status: "open",
  title,
  openedAt: new Date(openedAt),
  ...over,
});

/**
 * A fake transaction. Each `select(...)` (or `selectDistinct(...)`) chain
 * answers the next entry of `selects` and records the table it read and its
 * WHERE; a chain answers at `.limit()`, at `.orderBy()` or when awaited at
 * `.where()`. `execute(...)` (the advisory lock) is recorded with how many
 * reads had started before it. Every insert is recorded.
 */
function fakeTx(selects: unknown[][]) {
  const queue = [...selects];
  const read: unknown[] = [];
  const wheres: unknown[] = [];
  const inserted: { table: unknown; v: Record<string, unknown> }[] = [];
  const executed: { query: unknown; readsBefore: number }[] = [];
  const chain = () => {
    const rows = queue.shift();
    if (rows === undefined) throw new Error("fakeTx: an unexpected select");
    const b: Record<string, unknown> = {};
    b.from = (table: unknown) => {
      read.push(table);
      return b;
    };
    b.where = (w: unknown) => {
      wheres.push(w);
      return b;
    };
    b.limit = async () => rows;
    b.orderBy = async () => rows;
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject);
    return b;
  };
  const tx = {
    select: () => chain(),
    selectDistinct: () => chain(),
    execute: async (query: unknown) => {
      executed.push({ query, readsBefore: read.length });
      return [];
    },
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserted.push({ table, v });
          return [{ id: NEW_ID }];
        },
      }),
    }),
  };
  mockRunScoped.mockImplementation((_ctx, cb) => Promise.resolve(cb(tx as never)));
  return { read, wheres, inserted, executed, pending: queue };
}

/** The ClinicalError code, the error's name for any other error, or "resolved". */
async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (isClinicalError(e)) return e.code;
    return (e as Error).name;
  }
  return "resolved";
}

beforeEach(() => {
  mockRunScoped.mockReset();
  mockAudit.mockReset();
  vi.useFakeTimers();
  // 5 October 2026, 23:30 UTC: already 6 October, 00:30, in Lisbon (summer time).
  vi.setSystemTime(new Date("2026-10-05T23:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createEpisode: therapists only, refused on the server before anything is read", () => {
  it.each([
    ["owner", owner],
    ["admin", admin],
    ["reception", reception],
  ] as const)("%s: ForbiddenError, no transaction, nothing inserted, no audit row", async (_label, who) => {
    fakeTx([[{ id: PATIENT }], []]);
    expect(await codeOf(createEpisode(who, { patientId: PATIENT, specialty: "Osteopatia" }))).toBe("ForbiddenError");
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("CONTROL: the therapist, with the same input and the same answers, opens one", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], []]);
    expect(await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" })).toEqual({ kind: "created", id: NEW_ID });
    expect(inserted).toHaveLength(1);
  });
});

describe("createEpisode: the patient is one the therapist may write for, in their tenant", () => {
  it("a patient the read does not find (another tenant's, or one the therapist neither treats nor created): not_found, nothing inserted", async () => {
    const { read, inserted, executed } = fakeTx([[]]);
    expect(await codeOf(createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" }))).toBe("not_found");
    expect(read).toEqual([patients]);
    expect(executed).toEqual([]);
    expect(inserted).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("the patient read carries the narrow write scope (created by, or an appointment with, the caller) and the patient id", async () => {
    const { wheres } = fakeTx([[{ id: PATIENT }], []]);
    await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" });
    const where = render(wheres[0]);
    expect(where.sql).toContain("created_by");
    expect(where.sql).toContain("practitioner_id");
    expect(where.params).toContain(PATIENT);
    expect(where.params).toContain(THERAPIST_ID);
  });

  it("not a uuid: invalid, no transaction, no read", async () => {
    for (const bad of ["", "not-a-uuid", "' or 1=1 --", "4444aaaa-4444-4444-8444-44444444bbb", ` ${PATIENT}`]) {
      mockRunScoped.mockReset();
      expect(await codeOf(createEpisode(therapist, { patientId: bad, specialty: "Osteopatia" })), bad).toBe("invalid");
      expect(mockRunScoped).not.toHaveBeenCalled();
    }
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("an id posted in UPPERCASE is the same patient: read, locked and inserted in its canonical form", async () => {
    const { wheres, inserted, executed } = fakeTx([[{ id: PATIENT }], []]);
    const upper = PATIENT.toUpperCase();
    expect(upper).not.toBe(PATIENT);
    await createEpisode(therapist, { patientId: upper, specialty: "Osteopatia" });
    expect(render(wheres[0]).params).toContain(PATIENT);
    expect(render(wheres[0]).params).not.toContain(upper);
    expect(render(executed[0]!.query)).toEqual(render(specialtyEpisodeLock(TENANT, PATIENT, "Osteopatia")));
    expect(inserted[0]!.v.patientId).toBe(PATIENT);
  });
});

describe("createEpisode: the title is a specialty and a date, built on the server", () => {
  it("the row: the server-built title with the Lisbon day, open, this patient, the caller's tenant and name; one audit row, ids only", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], []]);
    await createEpisode(therapist, { patientId: PATIENT, specialty: "Fisioterapia" });
    expect(inserted).toEqual([
      {
        table: clinicalEpisodes,
        v: {
          tenantId: TENANT,
          patientId: PATIENT,
          title: "Fisioterapia (06/10/2026)",
          primaryPractitionerId: THERAPIST_ID,
          status: "open",
        },
      },
    ]);
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]![1]).toEqual({
      tenantId: TENANT,
      actorUserId: THERAPIST_ID,
      action: "clinical_episode.create",
      entityType: "clinical_episode",
      entityId: NEW_ID,
      metadata: { patientId: PATIENT },
      ip: null,
    });
  });

  it("a title, or any other text, added to the input is never read: the row carries the server-built title and nothing else", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], []]);
    const typed = "Texto escrito pelo cliente";
    const input = { patientId: PATIENT, specialty: "Osteopatia", title: typed, complaint: typed, diagnosis: typed, notes: typed };
    await createEpisode(therapist, input);
    expect(inserted[0]!.v.title).toBe("Osteopatia (06/10/2026)");
    expect(JSON.stringify(inserted.map((i) => i.v))).not.toContain(typed);
    expect(JSON.stringify(mockAudit.mock.calls)).not.toContain(typed);
  });

  it("a specialty that is not exactly a word on the list: invalid, no transaction, nothing inserted", async () => {
    for (const bad of [
      "",
      "osteopatia",
      " Osteopatia",
      "Osteopatia ",
      "Osteopatia (06/10/2026)",
      "Episódio",
      "Texto escrito pelo cliente",
      "Osteopatia\nTexto",
    ]) {
      mockRunScoped.mockReset();
      expect(await codeOf(createEpisode(therapist, { patientId: PATIENT, specialty: bad })), JSON.stringify(bad)).toBe("invalid");
      expect(mockRunScoped).not.toHaveBeenCalled();
    }
    // Look-alikes of a listed word, written with escapes: fullwidth letters (what
    // NFKC would fold into the word), a zero-width space inside it (no listed
    // word has an accent, so there is no NFD form), and a Cyrillic or Greek
    // letter in place of a Latin one. The list is compared exactly.
    const fullwidth = (word: string) => [...word].map((c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0)).join("");
    expect(fullwidth("Osteopatia").normalize("NFKC")).toBe("Osteopatia");
    for (const [label, bad] of [
      ["fullwidth Osteopatia", fullwidth("Osteopatia")],
      ["fullwidth Fisioterapia", fullwidth("Fisioterapia")],
      ["Osteopatia with a zero-width space inside", "Osteo\u200bpatia"],
      ["Fisioterapia with a zero-width space inside", "Fisio\u200bterapia"],
      ["Osteopatia with a Cyrillic capital O", "\u041esteopatia"],
      ["Osteopatia with a Greek capital omicron", "\u039fsteopatia"],
      ["Fisioterapia with a Cyrillic small a", "Fisioter\u0430pia"],
    ] as const) {
      mockRunScoped.mockReset();
      expect(bad, label).not.toBe("Osteopatia");
      expect(bad, label).not.toBe("Fisioterapia");
      expect(await codeOf(createEpisode(therapist, { patientId: PATIENT, specialty: bad })), label).toBe("invalid");
      expect(mockRunScoped, label).not.toHaveBeenCalled();
    }
    for (const bad of [null, undefined, 7, ["Osteopatia"], { specialty: "Osteopatia" }]) {
      expect(await codeOf(createEpisode(therapist, { patientId: PATIENT, specialty: bad as never }))).toBe("invalid");
    }
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("createEpisode: an open app episode of the specialty is shown before another is opened", () => {
  const one = [episode(EP_OLD, "Osteopatia (01/10/2026)", "2026-10-01T09:00:00Z")];
  const two = [episode(EP_NEW, "Osteopatia", "2026-10-03T09:00:00Z"), ...one];

  it("one is open and the call does not confirm: nothing inserted, no audit row, and the answer names it", async () => {
    const { read, inserted, executed } = fakeTx([[{ id: PATIENT }], one, []]);
    expect(await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" })).toEqual({
      kind: "open_exists",
      episodeId: EP_OLD,
    });
    expect(read).toEqual([patients, clinicalEpisodes, migrationStagingRows]);
    expect(inserted).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();
    // The lock, for this tenant, patient and specialty, after the patient read and before the episode read.
    expect(executed).toHaveLength(1);
    expect(executed[0]!.readsBefore).toBe(1);
    expect(render(executed[0]!.query)).toEqual(render(specialtyEpisodeLock(TENANT, PATIENT, "Osteopatia")));
  });

  it("the call confirms against that episode: another is opened, and the existing one is not written to", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], one, []]);
    expect(
      await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia", confirmedOpenEpisodeId: EP_OLD }),
    ).toEqual({ kind: "created", id: NEW_ID });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.table).toBe(clinicalEpisodes);
    expect(inserted[0]!.v.title).toBe("Osteopatia (06/10/2026)");
  });

  it("the confirmation in UPPERCASE names the same episode", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], one, []]);
    expect(EP_OLD.toUpperCase()).not.toBe(EP_OLD);
    const result = await createEpisode(therapist, {
      patientId: PATIENT,
      specialty: "Osteopatia",
      confirmedOpenEpisodeId: EP_OLD.toUpperCase(),
    });
    expect(result.kind).toBe("created");
    expect(inserted).toHaveLength(1);
  });

  it("several are open: the answer names the most recently opened (R31's choice), and only a confirmation against THAT one opens another", async () => {
    let tx = fakeTx([[{ id: PATIENT }], two, []]);
    expect(await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" })).toEqual({
      kind: "open_exists",
      episodeId: EP_NEW,
    });
    expect(tx.inserted).toEqual([]);

    // A confirmation against the older one (the page was drawn before the newer was opened): asked again.
    tx = fakeTx([[{ id: PATIENT }], two, []]);
    expect(
      await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia", confirmedOpenEpisodeId: EP_OLD }),
    ).toEqual({ kind: "open_exists", episodeId: EP_NEW });
    expect(tx.inserted).toEqual([]);
    expect(mockAudit).not.toHaveBeenCalled();

    tx = fakeTx([[{ id: PATIENT }], two, []]);
    expect(
      (await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia", confirmedOpenEpisodeId: EP_NEW })).kind,
    ).toBe("created");
    expect(tx.inserted).toHaveLength(1);
  });

  it("a confirmation that is not a uuid: invalid, no transaction", async () => {
    for (const bad of ["sim", "true", "1", `${EP_OLD} `]) {
      mockRunScoped.mockReset();
      expect(
        await codeOf(createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia", confirmedOpenEpisodeId: bad })),
        bad,
      ).toBe("invalid");
      expect(mockRunScoped).not.toHaveBeenCalled();
    }
  });

  it("what does NOT count as one: the other specialty, a title naming none, an episode the import ledger names", async () => {
    // Open episodes of the patient, none of them an app episode of Osteopatia.
    let tx = fakeTx([
      [{ id: PATIENT }],
      [episode(EP_OLD, "Fisioterapia (01/10/2026)", "2026-10-01T09:00:00Z"), episode(EP_NEW, "Episódio (02/10/2026)", "2026-10-02T09:00:00Z")],
    ]);
    expect((await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" })).kind).toBe("created");
    expect(tx.inserted).toHaveLength(1);

    // An OPEN episode titled with the specialty that the ledger names is not an app episode.
    tx = fakeTx([[{ id: PATIENT }], [episode(EP_OLD, "Osteopatia", "2026-10-01T09:00:00Z")], [{ id: EP_OLD }]]);
    expect((await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia" })).kind).toBe("created");
    expect(tx.inserted).toHaveLength(1);
  });

  it("with none open, a stale confirmation changes nothing: one is opened", async () => {
    const { inserted } = fakeTx([[{ id: PATIENT }], []]);
    expect(
      (await createEpisode(therapist, { patientId: PATIENT, specialty: "Osteopatia", confirmedOpenEpisodeId: EP_OLD })).kind,
    ).toBe("created");
    expect(inserted).toHaveLength(1);
  });
});

describe("listOpenAppEpisodes: the Registos tab's read of the patient's open app episodes", () => {
  it("admin and reception hold no authoring capability: refused before any read", async () => {
    for (const who of [admin, reception]) {
      expect(await codeOf(listOpenAppEpisodes(who, PATIENT))).toBe("ForbiddenError");
    }
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("a patient outside the caller's write reach, or a malformed id: an empty list, and no episode is read", async () => {
    const { read } = fakeTx([[]]);
    expect(await listOpenAppEpisodes(therapist, PATIENT)).toEqual([]);
    expect(read).toEqual([patients]);
    mockRunScoped.mockReset();
    expect(await listOpenAppEpisodes(therapist, "not-a-uuid")).toEqual([]);
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("the therapist's patient read carries the narrow write scope; the owner's does not", async () => {
    let tx = fakeTx([[{ id: PATIENT }], []]);
    await listOpenAppEpisodes(therapist, PATIENT);
    expect(render(tx.wheres[0]).sql).toContain("created_by");
    tx = fakeTx([[{ id: PATIENT }], []]);
    await listOpenAppEpisodes(owner, PATIENT);
    expect(render(tx.wheres[0]).sql).not.toContain("created_by");
  });

  it("open app episodes in the order read; an episode the ledger names is left out; `empty` is true only with no registo filed", async () => {
    const rows = [
      episode(EP_NEW, "Osteopatia (03/10/2026)", "2026-10-03T09:00:00Z"),
      episode(EP_OLD, "Osteopatia (01/10/2026)", "2026-10-01T09:00:00Z"),
      episode(OTHER_PATIENT, "Fisioterapia", "2026-09-01T09:00:00Z"),
    ];
    const { read, pending } = fakeTx([[{ id: PATIENT }], rows, [{ id: OTHER_PATIENT }], [{ episodeId: EP_OLD }]]);
    const out = await listOpenAppEpisodes(therapist, PATIENT);
    expect(read).toEqual([patients, clinicalEpisodes, migrationStagingRows, clinicalRecords]);
    expect(pending).toEqual([]);
    expect(out.map((e) => [e.id, e.empty, e.imported])).toEqual([
      [EP_NEW, true, false],
      [EP_OLD, false, false],
    ]);
    expect(out[0]).toMatchObject({ tenantId: TENANT, patientId: PATIENT, status: "open", title: "Osteopatia (03/10/2026)" });
  });
});
