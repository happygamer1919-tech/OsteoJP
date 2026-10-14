import { beforeEach, describe, expect, it, vi } from "vitest";

// EXPORT-01, gate G4: the audit row of each document export, on a mock
// transaction. The real table, the real policy and the real actions are in
// export-audit.db.test.ts; the row of an app episode's PDF is
// report/episode-export.test.ts's (`recordEpisodeExport`).
//
//   ONE ROW  each writer inserts exactly one `audit_log` row, in the caller's
//            own scoped transaction, in the caller's name, with the caller's
//            address.
//   IDS      the row holds ids and counts and one word from a closed list. An
//            id that reached the action as a bare string is read back from its
//            row first, in the same transaction, and the row is written from
//            that read; a row the caller does not read writes nothing.
//   NO TEXT  the row goes through the clinical audit helper, whose contract
//            refuses free text.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/context", () => ({ runScoped: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { auditLog, clinicalRecords, locations, patients } from "@osteojp/db";
import type { RequestContext } from "@osteojp/auth";
import { runScoped } from "@/lib/auth/context";
import { AuditMetadataError } from "@/lib/audit/metadata-contract";
import { isClinicalError } from "./errors";
import {
  recordDeclaracaoExport,
  recordImportedGroupExport,
  recordPatientFichaExport,
  recordRegistoExport,
  recordRgpdFormExport,
} from "./export-audit";

const mockRunScoped = vi.mocked(runScoped);

const TENANT = "11111111-1111-4111-8111-111111111111";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const LOCATION = "5555aaaa-5555-4555-8555-55555555bbbb";
const R1 = "7777cccc-7777-4777-8777-777777777771";
const R2 = "7777cccc-7777-4777-8777-777777777772";
const R3 = "7777cccc-7777-4777-8777-777777777773";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IP = "203.0.113.7";

const ctxOf = (role: RequestContext["role"]): RequestContext => ({
  tenantId: TENANT,
  role,
  userId: `22222222-2222-4222-8222-22222222${{ owner: "0001", admin: "0002", therapist: "0003", reception: "0004" }[role]}`,
});
const owner = ctxOf("owner");

/**
 * A fake transaction. Each `select(...)` chain answers the next entry of
 * `selects` at `.limit()` and records the table it read and its WHERE; every
 * insert is recorded. `runScoped` hands it out and records whose context
 * asked, and under which label.
 */
function fakeTx(selects: unknown[][] = []) {
  const queue = [...selects];
  const read: unknown[] = [];
  const wheres: SQL[] = [];
  const inserted: { table: unknown; v: Record<string, unknown> }[] = [];
  const scoped: { ctx: unknown; label: unknown }[] = [];
  const tx = {
    select: () => {
      const rows = queue.shift();
      if (rows === undefined) throw new Error("fakeTx: an unexpected select");
      const b: Record<string, unknown> = {};
      b.from = (table: unknown) => {
        read.push(table);
        return b;
      };
      b.where = (w: SQL) => {
        wheres.push(w);
        return b;
      };
      b.limit = async () => rows;
      return b;
    },
    insert: (table: unknown) => ({
      values: async (v: Record<string, unknown>) => {
        inserted.push({ table, v });
      },
    }),
  };
  mockRunScoped.mockImplementation((async (ctx: unknown, fn: (t: unknown) => unknown, label: unknown) => {
    scoped.push({ ctx, label });
    return fn(tx);
  }) as never);
  return { read, wheres, inserted, scoped };
}

const dialect = new PgDialect();
/** A WHERE as the database is sent it: the text and the values bound to it. */
const sent = (where: SQL) => dialect.sqlToQuery(where);

/** The one row `ctx`'s export must have inserted. */
const rowOf = (ctx: RequestContext, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) => [
  { table: auditLog, v: { tenantId: TENANT, actorUserId: ctx.userId, action, entityType, entityId, metadata, ip: IP } },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(["owner", "admin", "therapist"] as const)("the registo's PDF and the RGPD form, as %s", (role) => {
  const ctx = ctxOf(role);

  it("recordRegistoExport: one row on the registo, naming it and its patient, as the database holds them", async () => {
    // The request spelled the id in capitals; the row read back does not.
    const t = fakeTx([[{ id: R1, patientId: PATIENT }]]);
    await recordRegistoExport(ctx, R1.toUpperCase());
    expect(t.scoped).toEqual([{ ctx, label: "clinical:registo-export-audit" }]);
    expect(t.read).toEqual([clinicalRecords]);
    expect(sent(t.wheres[0]!).params).toEqual([R1.toUpperCase()]);
    expect(sent(t.wheres[0]!).sql).toBe('"clinical_records"."id" = $1');
    expect(t.inserted).toEqual(
      rowOf(ctx, "clinical_record.export_pdf", "clinical_record", R1, { recordId: R1, patientId: PATIENT }),
    );
  });

  it("recordRgpdFormExport: one row on the registo's PATIENT, naming the registo it was asked from", async () => {
    const t = fakeTx([[{ id: R1, patientId: PATIENT }]]);
    await recordRgpdFormExport(ctx, R1.toUpperCase());
    expect(t.scoped).toEqual([{ ctx, label: "clinical:rgpd-form-export-audit" }]);
    expect(t.read).toEqual([clinicalRecords]);
    expect(sent(t.wheres[0]!).params).toEqual([R1.toUpperCase()]);
    expect(t.inserted).toEqual(
      rowOf(ctx, "patient.export_pdf", "patient", PATIENT, { document: "rgpd_form", patientId: PATIENT, recordId: R1 }),
    );
  });

  it.each([
    ["recordRegistoExport", recordRegistoExport],
    ["recordRgpdFormExport", recordRgpdFormExport],
  ] as const)("%s: a registo the caller does not read is not_found, and nothing is written", async (_name, record) => {
    const t = fakeTx([[]]);
    const failure = await record(ctx, R1).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isClinicalError(failure) && failure.code).toBe("not_found");
    expect(t.inserted).toEqual([]);
  });
});

describe.each(["owner", "admin", "therapist"] as const)("the imported group's PDF and the patient's ficha, as %s", (role) => {
  const ctx = ctxOf(role);
  // The file's order here is NOT the ids' own order, so a row that sorted or
  // reversed them would not match.
  const inFile = [R3, R1, R2];

  it("recordImportedGroupExport: one row on the patient, with the registos in the file and two counts; nothing is read", async () => {
    const t = fakeTx();
    await recordImportedGroupExport(ctx, { patientId: PATIENT, recordIds: inFile, leftOut: 4 });
    expect(t.scoped).toEqual([{ ctx, label: "clinical:imported-group-export-audit" }]);
    expect(t.read).toEqual([]);
    expect(t.inserted).toEqual(
      rowOf(ctx, "patient.export_pdf", "patient", PATIENT, {
        document: "imported_group",
        patientId: PATIENT,
        recordIds: inFile,
        recordsIncluded: 3,
        recordsLeftOut: 4,
      }),
    );
  });

  it("recordPatientFichaExport: one row on the patient, with the registos in the file and three counts; nothing is read", async () => {
    const t = fakeTx();
    await recordPatientFichaExport(ctx, { patientId: PATIENT, recordIds: inFile, sections: 2, leftOut: 5 });
    expect(t.scoped).toEqual([{ ctx, label: "clinical:ficha-export-audit" }]);
    expect(t.read).toEqual([]);
    expect(t.inserted).toEqual(
      rowOf(ctx, "patient.export_pdf", "patient", PATIENT, {
        document: "ficha",
        patientId: PATIENT,
        recordIds: inFile,
        recordsIncluded: 3,
        sectionsIncluded: 2,
        recordsLeftOut: 5,
      }),
    );
  });
});

describe("recordImportedGroupExport and recordPatientFichaExport: what the counts count", () => {
  it("recordsIncluded is the number of registos named, whatever that number is", async () => {
    for (const recordIds of [[R2], [R3, R1], [R1, R2, R3]]) {
      const group = fakeTx();
      await recordImportedGroupExport(owner, { patientId: PATIENT, recordIds, leftOut: 0 });
      expect(group.inserted[0]!.v.metadata).toMatchObject({ recordIds, recordsIncluded: recordIds.length });
      const ficha = fakeTx();
      await recordPatientFichaExport(owner, { patientId: PATIENT, recordIds, sections: 1, leftOut: 0 });
      expect(ficha.inserted[0]!.v.metadata).toMatchObject({ recordIds, recordsIncluded: recordIds.length });
    }
  });

  it("a registo left out is counted and never named", async () => {
    const t = fakeTx();
    // R3 and R1 are in the file; R2 was left out, and the writer is not told which.
    await recordPatientFichaExport(owner, { patientId: PATIENT, recordIds: [R3, R1], sections: 1, leftOut: 1 });
    const row = JSON.stringify(t.inserted[0]!.v);
    expect(row).toContain(R3);
    expect(row).toContain(R1);
    expect(row).not.toContain(R2);
  });

  it("the list handed in is copied: the row does not change when the caller's list does", async () => {
    const t = fakeTx();
    const recordIds = [R3, R1];
    await recordImportedGroupExport(owner, { patientId: PATIENT, recordIds, leftOut: 0 });
    recordIds.push(R2);
    expect((t.inserted[0]!.v.metadata as { recordIds: string[] }).recordIds).toEqual([R3, R1]);
  });
});

describe.each(["owner", "admin", "therapist", "reception"] as const)("the Declaração de Presença, as %s", (role) => {
  const ctx = ctxOf(role);

  it("one row on the patient, naming the patient and the location, as the database holds them", async () => {
    const t = fakeTx([[{ id: PATIENT }], [{ id: LOCATION }]]);
    await recordDeclaracaoExport(ctx, { patientId: PATIENT.toUpperCase(), locationId: LOCATION.toUpperCase() });
    expect(t.scoped).toEqual([{ ctx, label: "clinical:declaracao-export-audit" }]);
    expect(t.read).toEqual([patients, locations]);
    expect(t.wheres.map((w) => [sent(w).sql, sent(w).params])).toEqual([
      ['"patients"."id" = $1', [PATIENT.toUpperCase()]],
      ['"locations"."id" = $1', [LOCATION.toUpperCase()]],
    ]);
    expect(t.inserted).toEqual(
      rowOf(ctx, "patient.export_pdf", "patient", PATIENT, { document: "declaracao", patientId: PATIENT, locationId: LOCATION }),
    );
  });

  it.each([
    ["the patient", [[], [{ id: LOCATION }]]],
    ["the location", [[{ id: PATIENT }], []]],
    ["either", [[], []]],
  ])("a caller who does not read %s: not_found, and nothing is written", async (_label, selects) => {
    const t = fakeTx(selects);
    const failure = await recordDeclaracaoExport(ctx, { patientId: PATIENT, locationId: LOCATION }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isClinicalError(failure) && failure.code).toBe("not_found");
    expect(t.inserted).toEqual([]);
  });
});

describe("every row: ids, counts and one closed word; never text", () => {
  /** Each writer, run with ids only, and the rows it reads back first. */
  const writers: [string, unknown[][], () => Promise<void>][] = [
    ["registo", [[{ id: R1, patientId: PATIENT }]], () => recordRegistoExport(owner, R1)],
    ["rgpd_form", [[{ id: R1, patientId: PATIENT }]], () => recordRgpdFormExport(owner, R1)],
    ["imported_group", [], () => recordImportedGroupExport(owner, { patientId: PATIENT, recordIds: [R2, R1], leftOut: 1 })],
    ["ficha", [], () => recordPatientFichaExport(owner, { patientId: PATIENT, recordIds: [R2, R1], sections: 1, leftOut: 1 })],
    ["declaracao", [[{ id: PATIENT }], [{ id: LOCATION }]], () => recordDeclaracaoExport(owner, { patientId: PATIENT, locationId: LOCATION })],
  ];

  it.each(writers)("%s: exactly one insert, into audit_log, and every value is a uuid, a number or the document word", async (name, selects, run) => {
    const t = fakeTx(selects);
    await run();
    expect(t.inserted).toHaveLength(1);
    expect(t.inserted[0]!.table).toBe(auditLog);
    const metadata = t.inserted[0]!.v.metadata as Record<string, unknown>;
    for (const [key, value] of Object.entries(metadata)) {
      if (key === "document") expect(value, key).toBe(name);
      else if (Array.isArray(value)) for (const id of value) expect(id, key).toMatch(UUID);
      else if (typeof value === "string") expect(value, key).toMatch(UUID);
      else expect(Number.isInteger(value), key).toBe(true);
    }
    expect(t.inserted[0]!.v.entityId).toMatch(UUID);
    expect(metadata.document === undefined).toBe(name === "registo");
  });

  it.each([
    ["a name where the patient id goes (imported group)", () => recordImportedGroupExport(owner, { patientId: "Zzz Paciente Inventado", recordIds: [R1], leftOut: 0 })],
    ["a title among the registos' ids (imported group)", () => recordImportedGroupExport(owner, { patientId: PATIENT, recordIds: [R1, "Osteopatia (01/09/2026)"], leftOut: 0 })],
    ["a name where the patient id goes (ficha)", () => recordPatientFichaExport(owner, { patientId: "Zzz Paciente Inventado", recordIds: [R1], sections: 1, leftOut: 0 })],
    ["clinical text among the registos' ids (ficha)", () => recordPatientFichaExport(owner, { patientId: PATIENT, recordIds: ["Dor lombar há três semanas"], sections: 1, leftOut: 0 })],
  ] as const)(
    "the row is written through the clinical audit helper, whose contract refuses free text: %s is refused, and no row is written",
    async (_label, run) => {
      const t = fakeTx();
      await expect(run()).rejects.toBeInstanceOf(AuditMetadataError);
      expect(t.inserted).toEqual([]);
    },
  );
});
