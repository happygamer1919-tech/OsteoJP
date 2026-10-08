import { beforeEach, describe, expect, it, vi } from "vitest";

// EPI-01b, piece 3: the episode's PDF, on a mock transaction. The real rows
// and the real RLS are in episode-export.db.test.ts.
//
//   WHO      a reader of clinical records; reception is refused before any
//            read. Every read is the caller's own: `runScoped` with the
//            caller's context, the therapist read scope in the registo read's
//            WHERE, and each registo loaded by the per-record engine with the
//            caller's claims.
//   WHICH    the episode must be this patient's, in the caller's tenant, and
//            not an imported one; then the selection rule (finalized, not
//            under AI review; an annulled registo is in the file), oldest first.
//   NOTHING  on every refusal nothing is rendered and nothing is written.
//   AUDIT    one row per export, ids and counts only.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));
vi.mock("@/lib/patients/scope", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    // The narrowing itself is scope.ts's (scope-callers.test.ts and the DB
    // suites); here it is a marker, so its place in the WHERE can be read.
    therapistPatientReadScope: vi.fn(async (ctx: { role: string; userId: string }, col: unknown) =>
      ctx.role === "therapist" ? sql`THERAPIST_READ_SCOPE(${col}, ${ctx.userId})` : undefined,
    ),
  };
});
vi.mock("./generate", () => ({ generateClinicalReportPdf: vi.fn() }));
vi.mock("./episode-pdf", () => ({ mergeReportPdfs: vi.fn() }));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  auditLog,
  clinicalEpisodes,
  clinicalRecords,
  migrationStagingRows,
  patients,
  recordAnnulments,
} from "@osteojp/db";
import { ForbiddenError, type RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { therapistPatientReadScope } from "@/lib/patients/scope";
import { ClinicalError } from "../errors";
import { AuditMetadataError } from "@/lib/audit/metadata-contract";
import { generateClinicalReportPdf } from "./generate";
import { mergeReportPdfs } from "./episode-pdf";
import {
  readEpisodeExportRows,
  readEpisodeExportSelection,
  recordEpisodeExport,
  renderEpisodeReport,
} from "./episode-export";

const mockRunScoped = vi.mocked(runScoped);
const mockScope = vi.mocked(therapistPatientReadScope);
const mockGenerate = vi.mocked(generateClinicalReportPdf);
const mockMerge = vi.mocked(mergeReportPdfs);
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as SQL);

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const EPISODE = "7777cccc-7777-4777-8777-777777777771";
const R1 = "aaaaaaaa-0000-4000-8000-000000000001";
const R2 = "aaaaaaaa-0000-4000-8000-000000000002";
const R3 = "aaaaaaaa-0000-4000-8000-000000000003";
const R4 = "aaaaaaaa-0000-4000-8000-000000000004";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const therapist: RequestContext = { tenantId: TENANT, role: "therapist", userId: THERAPIST_ID };
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: "33333333-3333-4333-8333-333333333333" };
const admin: RequestContext = { tenantId: TENANT, role: "admin", userId: "33333333-3333-4333-8333-333333333334" };
const reception: RequestContext = { tenantId: TENANT, role: "reception", userId: "33333333-3333-4333-8333-333333333335" };

/** A registo row, as the scoped read returns it. */
const registo = (id: string, at: string, over: Record<string, unknown> = {}) => ({
  id,
  status: "signed",
  aiReviewState: null,
  createdAt: new Date(at),
  version: 1,
  ...over,
});

/**
 * A fake transaction. Each `select(...)` chain answers the next entry of
 * `selects` and records the table it read, each table it inner-joined with the
 * join's condition, and its WHERE; a chain answers at `.limit()`, at
 * `.orderBy()` or when awaited at `.where()`. Every insert is recorded.
 * `runScoped` hands it out and records whose context asked.
 */
function fakeTx(selects: unknown[][]) {
  const queue = [...selects];
  const read: unknown[] = [];
  const wheres: unknown[] = [];
  /** One entry per read, in order: the inner joins that read made. */
  const joins: { table: unknown; on: unknown }[][] = [];
  const inserted: { table: unknown; v: Record<string, unknown> }[] = [];
  const contexts: unknown[] = [];
  const chain = () => {
    const rows = queue.shift();
    if (rows === undefined) throw new Error("fakeTx: an unexpected select");
    const b: Record<string, unknown> = {};
    b.from = (table: unknown) => {
      read.push(table);
      joins.push([]);
      return b;
    };
    b.innerJoin = (table: unknown, on: unknown) => {
      joins[joins.length - 1]!.push({ table, on });
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
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push({ table, v });
      },
    }),
  };
  mockRunScoped.mockImplementation((ctx, cb) => {
    contexts.push(ctx);
    return Promise.resolve(cb(tx as never));
  });
  return { read, wheres, joins, inserted, contexts, pending: queue };
}

/** The four reads of an app episode with registos: episode, ledger, registos, annulments. */
const appEpisode = (registos: unknown[], annulled: string[] = []) =>
  fakeTx([[{ id: EPISODE }], [], registos, annulled.map((recordId) => ({ recordId }))]);

const ask = { patientId: PATIENT, episodeId: EPISODE };

beforeEach(() => {
  mockRunScoped.mockReset();
  mockScope.mockClear();
  mockGenerate.mockReset();
  mockMerge.mockReset();
});

describe("readEpisodeExportRows: who may ask, and under whose scope it reads", () => {
  it("reception is refused before any read", async () => {
    const t = fakeTx([]);
    await expect(readEpisodeExportRows(reception, ask)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(mockScope).not.toHaveBeenCalled();
    expect(t.read).toEqual([]);
  });

  it.each([
    ["owner", owner],
    ["admin", admin],
    ["therapist", therapist],
  ] as const)("%s: every read runs in ONE scoped transaction opened with the caller's own context", async (_label, ctx) => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    const rows = await readEpisodeExportRows(ctx, ask);
    expect(rows?.map((r) => r.id)).toEqual([R1]);
    expect(mockRunScoped).toHaveBeenCalledTimes(1);
    expect(t.contexts).toEqual([ctx]);
    expect(t.read).toEqual([clinicalEpisodes, migrationStagingRows, clinicalRecords, recordAnnulments]);
    expect(t.pending).toEqual([]);
  });

  it("a THERAPIST: the registo read carries the therapist read scope on the registo's patient", async () => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    await readEpisodeExportRows(therapist, ask);
    expect(mockScope).toHaveBeenCalledWith(therapist, clinicalRecords.patientId);
    const where = render(t.wheres[2]);
    expect(where.sql).toContain("THERAPIST_READ_SCOPE(");
    expect(where.params).toContain(THERAPIST_ID);
    // And it is ANDed with the episode and the patient, never an alternative to them.
    expect(where.sql).not.toMatch(/\bor\b/i);
    expect(where.params).toEqual(expect.arrayContaining([EPISODE, PATIENT]));
  });

  it.each([
    ["owner", owner],
    ["admin", admin],
  ] as const)("%s: no therapist scope in the app predicate, the same episode and patient tests", async (_label, ctx) => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    await readEpisodeExportRows(ctx, ask);
    const where = render(t.wheres[2]);
    expect(where.sql).not.toContain("THERAPIST_READ_SCOPE(");
    expect(where.params).toEqual(expect.arrayContaining([EPISODE, PATIENT]));
  });
});

describe("readEpisodeExportRows: the registo read joins the patient, as the per-record load does", () => {
  it.each([
    ["owner", owner],
    ["admin", admin],
    ["therapist", therapist],
  ] as const)("%s: an INNER join to patients on the registo's own patient, and on no other read", async (_label, ctx) => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    await readEpisodeExportRows(ctx, ask);
    // The reads, in order: episode, ledger, registos, annulments.
    expect(t.joins.map((j) => j.map((x) => x.table))).toEqual([[], [], [patients], []]);
    const on = render(t.joins[2]![0]!.on);
    expect(on.sql).toBe('"patients"."id" = "clinical_records"."patient_id"');
    expect(on.params).toEqual([]);
  });
});

describe("readEpisodeExportRows: which episode", () => {
  it.each([
    ["a patient id that is not a uuid", { patientId: "../../admin", episodeId: EPISODE }],
    ["an episode id that is not a uuid", { patientId: PATIENT, episodeId: "1 or 1=1" }],
    ["an empty episode id", { patientId: PATIENT, episodeId: "" }],
  ] as const)("%s: null before any read", async (_label, input) => {
    const t = fakeTx([]);
    expect(await readEpisodeExportRows(owner, input)).toBeNull();
    expect(mockRunScoped).not.toHaveBeenCalled();
    expect(t.read).toEqual([]);
  });

  it("the episode read asks for THIS episode, THIS patient and the caller's tenant", async () => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    await readEpisodeExportRows(owner, ask);
    const where = render(t.wheres[0]);
    expect(where.sql).toContain('"clinical_episodes"."id" =');
    expect(where.sql).toContain('"clinical_episodes"."patient_id" =');
    expect(where.sql).toContain('"clinical_episodes"."tenant_id" =');
    expect(where.sql).not.toMatch(/\bor\b/i);
    expect(where.params).toEqual([EPISODE, PATIENT, TENANT]);
  });

  it("no such episode for this patient (another patient's, or another tenant's: no row under RLS): null, and no registo is read", async () => {
    const t = fakeTx([[]]);
    expect(await readEpisodeExportRows(owner, ask)).toBeNull();
    expect(t.read).toEqual([clinicalEpisodes]);
  });

  it("an episode the import ledger names: null, and no registo is read", async () => {
    const t = fakeTx([[{ id: EPISODE }], [{ id: EPISODE }]]);
    expect(await readEpisodeExportRows(owner, ask)).toBeNull();
    expect(t.read).toEqual([clinicalEpisodes, migrationStagingRows]);
    const where = render(t.wheres[1]);
    expect(where.params).toEqual(["clinical_episode", EPISODE]);
  });

  it("an episode with no registo the caller reads: an empty list, and no annulment is read", async () => {
    const t = fakeTx([[{ id: EPISODE }], [], []]);
    expect(await readEpisodeExportRows(therapist, ask)).toEqual([]);
    expect(t.read).toEqual([clinicalEpisodes, migrationStagingRows, clinicalRecords]);
  });

  it("ids posted in uppercase name the same episode and patient: read in lowercase", async () => {
    const t = appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    expect(PATIENT.toUpperCase()).not.toBe(PATIENT);
    await readEpisodeExportRows(owner, { patientId: PATIENT.toUpperCase(), episodeId: EPISODE.toUpperCase() });
    expect(render(t.wheres[0]).params).toEqual([EPISODE, PATIENT, TENANT]);
  });

  it("each registo carries its status, its AI review state and whether an annulment names it", async () => {
    const t = appEpisode(
      [
        registo(R1, "2026-09-01T09:00:00Z", { status: "locked" }),
        registo(R2, "2026-09-02T09:00:00Z", { status: "draft", aiReviewState: "pending_review" }),
        registo(R3, "2026-09-03T09:00:00Z"),
      ],
      [R3],
    );
    const rows = await readEpisodeExportRows(owner, ask);
    expect(rows?.map((r) => [r.id, r.status, r.aiReviewState, r.annulled])).toEqual([
      [R1, "locked", null, false],
      [R2, "draft", "pending_review", false],
      [R3, "signed", null, true],
    ]);
    // The annulments asked for are these registos', and no others.
    expect(render(t.wheres[3]).params).toEqual([R1, R2, R3]);
  });
});

describe("readEpisodeExportSelection: what the file holds", () => {
  it("a mixed episode: the finalized registos, oldest first, the annulled one among them; the draft and the AI-pending left out and counted", async () => {
    appEpisode(
      [
        // Handed over out of order: the order is the rule's, not the read's.
        registo(R3, "2026-09-03T09:00:00Z", { status: "locked" }),
        registo(R1, "2026-09-01T09:00:00Z"),
        registo(R2, "2026-09-02T09:00:00Z", { status: "draft" }),
        registo(R4, "2026-09-04T09:00:00Z"),
        registo("aaaaaaaa-0000-4000-8000-000000000005", "2026-09-05T09:00:00Z", {
          status: "draft",
          aiReviewState: "pending_review",
        }),
      ],
      [R4],
    );
    expect(await readEpisodeExportSelection(owner, ask)).toEqual({
      episodeId: EPISODE,
      patientId: PATIENT,
      recordIds: [R1, R3, R4],
      leftOut: 2,
    });
  });

  it.each([
    ["no such episode for this patient", [[]]],
    ["an imported episode", [[{ id: EPISODE }], [{ id: EPISODE }]]],
    ["an empty episode", [[{ id: EPISODE }], [], []]],
    ["drafts only", [[{ id: EPISODE }], [], [registo(R1, "2026-09-01T09:00:00Z", { status: "draft" })], []]],
    [
      "an annulled draft only",
      [[{ id: EPISODE }], [], [registo(R1, "2026-09-01T09:00:00Z", { status: "draft" })], [{ recordId: R1 }]],
    ],
    [
      "under AI review only",
      [[{ id: EPISODE }], [], [registo(R1, "2026-09-01T09:00:00Z", { aiReviewState: "in_review" })], []],
    ],
  ] as const)("%s: null, and nothing is written", async (_label, selects) => {
    const t = fakeTx(selects.map((rows) => [...rows]));
    expect(await readEpisodeExportSelection(owner, ask)).toBeNull();
    expect(t.inserted).toEqual([]);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("EXPORT-01: an episode whose only finalized registo is ANNULLED is exported, the registo in the file", async () => {
    appEpisode([registo(R1, "2026-09-01T09:00:00Z")], [R1]);
    expect(await readEpisodeExportSelection(owner, ask)).toEqual({
      episodeId: EPISODE,
      patientId: PATIENT,
      recordIds: [R1],
      leftOut: 0,
    });
  });

  it("the ids it answers with are the canonical ones, whatever case was posted", async () => {
    appEpisode([registo(R1, "2026-09-01T09:00:00Z")]);
    const selection = await readEpisodeExportSelection(owner, {
      patientId: PATIENT.toUpperCase(),
      episodeId: EPISODE.toUpperCase(),
    });
    expect(selection).toMatchObject({ episodeId: EPISODE, patientId: PATIENT });
  });
});

describe("renderEpisodeReport: each registo through the per-record engine, with the caller's claims", () => {
  const selection = { episodeId: EPISODE, patientId: PATIENT, recordIds: [R1, R2, R3], leftOut: 1 };
  const part = (n: number) => ({ bytes: new Uint8Array([n]), filename: `relatorio-clinico-${n}.pdf` });
  const JOINED = new Uint8Array([9, 9, 9]);

  it("one engine call per registo, in the selection's order, as the caller; the parts are joined in that order", async () => {
    mockGenerate.mockImplementation(async (_claims, id) => part(Number(id.slice(-1))));
    mockMerge.mockResolvedValue(JOINED);

    const pdf = await renderEpisodeReport(therapist, selection, "pt");

    expect(mockGenerate.mock.calls.map((c) => c[1])).toEqual([R1, R2, R3]);
    for (const call of mockGenerate.mock.calls) {
      expect(call[0]).toEqual({ tenant_id: TENANT, user_role: "therapist", sub: THERAPIST_ID });
      expect(call[2]).toBe("pt");
    }
    expect(mockMerge).toHaveBeenCalledTimes(1);
    expect(mockMerge.mock.calls[0]![0]).toEqual([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
    expect(mockMerge.mock.calls[0]![1]).toBe("Relatório Clínico");
    expect(pdf).toEqual({
      bytes: JOINED,
      filename: "relatorio-episodio-7777cccc.pdf",
      recordIds: [R1, R2, R3],
      leftOut: 1,
    });
    // No transaction of its own: the reads are the engine's, under the claims above.
    expect(mockRunScoped).not.toHaveBeenCalled();
  });

  it("the document title follows the locale", async () => {
    mockGenerate.mockResolvedValue(part(1));
    mockMerge.mockResolvedValue(JOINED);
    await renderEpisodeReport(owner, selection, "en");
    expect(mockMerge.mock.calls[0]![1]).toBe("Clinical Report");
    expect(mockGenerate.mock.calls.every((c) => c[2] === "en")).toBe(true);
  });

  it.each(["not_found", "not_printable"] as const)(
    "a registo the engine answers %s for is left out, counted and not named among the file's registos; the others keep their order",
    async (code) => {
      mockGenerate.mockImplementation(async (_claims, id) => {
        if (id === R2) throw new ClinicalError(code);
        return part(Number(id.slice(-1)));
      });
      mockMerge.mockResolvedValue(JOINED);
      const pdf = await renderEpisodeReport(therapist, selection, "pt");
      expect(mockMerge.mock.calls[0]![0]).toEqual([new Uint8Array([1]), new Uint8Array([3])]);
      expect(pdf).toMatchObject({ recordIds: [R1, R3], leftOut: 2 });
    },
  );

  it("the engine refuses every registo: null, and nothing is joined", async () => {
    mockGenerate.mockRejectedValue(new ClinicalError("not_found"));
    expect(await renderEpisodeReport(therapist, selection, "pt")).toBeNull();
    expect(mockMerge).not.toHaveBeenCalled();
  });

  it("any other fault ends the export: it is not swallowed, and nothing is joined", async () => {
    mockGenerate.mockImplementation(async (_claims, id) => {
      if (id === R2) throw new Error("boom");
      return part(1);
    });
    await expect(renderEpisodeReport(therapist, selection, "pt")).rejects.toThrow("boom");
    expect(mockMerge).not.toHaveBeenCalled();
  });
});

describe("recordEpisodeExport: the audit row", () => {
  // The file's order here is NOT the ids' own order, so a row that sorted or
  // reversed them would not match.
  const exported = { episodeId: EPISODE, patientId: PATIENT, recordIds: [R3, R1, R2], leftOut: 3 };

  it.each([
    ["owner", owner],
    ["admin", admin],
    ["therapist", therapist],
  ] as const)("%s: exactly one row, in the caller's scoped transaction and name, with this shape", async (_label, ctx) => {
    const t = fakeTx([]);
    await recordEpisodeExport(ctx, exported);
    expect(t.contexts).toEqual([ctx]);
    expect(t.inserted).toEqual([
      {
        table: auditLog,
        v: {
          tenantId: TENANT,
          actorUserId: ctx.userId,
          action: "episode.export_pdf",
          entityType: "clinical_episode",
          entityId: EPISODE,
          metadata: {
            episodeId: EPISODE,
            patientId: PATIENT,
            recordIds: [R3, R1, R2],
            recordsIncluded: 3,
            recordsLeftOut: 3,
          },
          ip: "203.0.113.7",
        },
      },
    ]);
  });

  it("the metadata is ids and counts and nothing else: two uuids, a list of uuids and two numbers", async () => {
    const t = fakeTx([]);
    await recordEpisodeExport(owner, exported);
    const metadata = t.inserted[0]!.v.metadata as Record<string, unknown>;
    expect(Object.keys(metadata).sort()).toEqual([
      "episodeId",
      "patientId",
      "recordIds",
      "recordsIncluded",
      "recordsLeftOut",
    ]);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const [key, value] of Object.entries(metadata)) {
      if (key === "recordIds") {
        expect(Array.isArray(value), key).toBe(true);
        for (const id of value as unknown[]) expect(id, key).toMatch(uuid);
      } else if (typeof value === "string") expect(value, key).toMatch(uuid);
      else expect(typeof value, key).toBe("number");
    }
  });

  it("recordIds is the registos IN the file, in the file's order, and recordsIncluded is their number", async () => {
    for (const recordIds of [[R2], [R3, R1], [R1, R2, R3], [R4, R3, R2, R1]]) {
      const t = fakeTx([]);
      await recordEpisodeExport(owner, { ...exported, recordIds });
      const metadata = t.inserted[0]!.v.metadata as { recordIds: string[]; recordsIncluded: number };
      expect(metadata.recordIds).toEqual(recordIds);
      expect(metadata.recordsIncluded).toBe(metadata.recordIds.length);
    }
  });

  it("the count left out is a number only: no id of a registo left out is in the row", async () => {
    const t = fakeTx([]);
    // R3 and R1 are in the file; R2 and R4 were left out, and the writer is not told which.
    await recordEpisodeExport(owner, { ...exported, recordIds: [R3, R1], leftOut: 2 });
    const row = JSON.stringify(t.inserted[0]!.v);
    expect(row).toContain(R3);
    expect(row).toContain(R1);
    expect(row).not.toContain(R2);
    expect(row).not.toContain(R4);
    expect((t.inserted[0]!.v.metadata as { recordsLeftOut: number }).recordsLeftOut).toBe(2);
  });

  it.each([
    ["a name where the patient id goes", { patientId: "Zzz Paciente Inventado" }],
    ["clinical text where the episode id goes", { episodeId: "Dor lombar há três semanas" }],
    ["a name among the registos' ids", { recordIds: [R3, "Zzz Paciente Inventado", R1] }],
  ] as const)(
    "the row is written through the clinical audit helper, whose contract refuses free text: %s is refused, and no row is written",
    async (_label, over) => {
      const t = fakeTx([]);
      await expect(recordEpisodeExport(owner, { ...exported, ...over })).rejects.toBeInstanceOf(AuditMetadataError);
      expect(t.inserted).toEqual([]);
      // Control: the same call with ids only writes its row.
      await recordEpisodeExport(owner, exported);
      expect(t.inserted).toHaveLength(1);
    },
  );
});
