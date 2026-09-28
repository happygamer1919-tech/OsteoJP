/**
 * record-origin.test.ts: THE IMPORTER-ORIGIN RULE, AS A STATEMENT.
 *
 * The rule's behaviour against real rows (RLS, the chain walk, the bound, the
 * entity type, another tenant's ledger) is proven in record-origin.db.test.ts,
 * which runs in the DB-gated CI job. This file pins what can be pinned without a
 * database: the shape of the one statement, that the record id travels as a
 * parameter, the read gate, and how the driver's answer is read.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runScoped } = vi.hoisted(() => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ runScoped }));

import {
  IMPORT_LEDGER_ENTITY_TYPE,
  SUPERSEDES_WALK_LIMIT,
  importerSourcedRecordSql,
  isImporterSourcedRecord,
  readImporterSourced,
} from "./record-origin";

const RECORD = "11111111-1111-4111-8111-111111111111";
const dialect = new PgDialect();
const render = () => dialect.sqlToQuery(importerSourcedRecordSql(RECORD));
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** A transaction whose execute answers with `result`, recording what it ran. */
function fakeTx(result: unknown) {
  const seen: unknown[] = [];
  return {
    seen,
    tx: {
      execute: vi.fn(async (q: unknown) => {
        seen.push(q);
        return result;
      }),
    },
  };
}

describe("importerSourcedRecordSql: the rule as one statement", () => {
  it("reads the importer's ledger for clinical records, and nothing else", () => {
    const { sql, params } = render();
    const text = squash(sql);
    expect(text).toContain("from public.migration_staging_rows ledger");
    expect(text).toMatch(/ledger\.entity_type = \$\d+::public\.migration_entity_type/);
    expect(params).toContain(IMPORT_LEDGER_ENTITY_TYPE);
    expect(IMPORT_LEDGER_ENTITY_TYPE).toBe("clinical_record");
    expect(text).toContain("ledger.imported_entity_id in (select chain.id from chain)");
  });

  it("walks the supersedes chain from the record itself", () => {
    const text = squash(render().sql);
    expect(text).toContain("with recursive chain (id, supersedes_id, depth)");
    // The anchor is the record being viewed...
    expect(text).toMatch(/from public\.clinical_records cr where cr\.id = \$\d+::uuid/);
    // ...and each step moves to the record the previous one supersedes.
    expect(text).toContain("join chain on prev.id = chain.supersedes_id");
  });

  it("bounds the walk by SUPERSEDES_WALK_LIMIT", () => {
    const { sql, params } = render();
    expect(squash(sql)).toMatch(/where chain\.depth < \$\d+::int/);
    expect(params).toContain(SUPERSEDES_WALK_LIMIT);
    expect(SUPERSEDES_WALK_LIMIT).toBeGreaterThan(1);
  });

  it("binds the record id as a parameter, never into the text", () => {
    const { sql, params } = render();
    expect(params).toContain(RECORD);
    expect(sql).not.toContain(RECORD);
  });

  it("writes nothing", () => {
    expect(squash(render().sql)).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop)\b/i);
  });
});

describe("readImporterSourced: reading the driver's answer", () => {
  it.each([
    ["an array row that says true", [{ importer_sourced: true }], true],
    ["an array row that says false", [{ importer_sourced: false }], false],
    ["a { rows } result that says true", { rows: [{ importer_sourced: true }] }, true],
    ["no row at all", [], false],
    ["a truthy non-boolean", [{ importer_sourced: "t" }], false],
  ])("%s", async (_label, result, expected) => {
    const { tx, seen } = fakeTx(result);
    await expect(readImporterSourced(tx as never, RECORD)).resolves.toBe(expected);
    expect(seen).toHaveLength(1);
  });
});

describe("isImporterSourcedRecord: the request-context entry point", () => {
  // Braces, not a concise arrow: a function returned from beforeEach is run by
  // vitest as a TEARDOWN, and mockReset() returns the mock itself.
  beforeEach(() => {
    runScoped.mockReset();
  });

  it("runs the read once, in the caller's tenant context", async () => {
    const { tx, seen } = fakeTx([{ importer_sourced: true }]);
    runScoped.mockImplementation(async (_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx));
    const ctx = { tenantId: "t", role: "therapist", userId: "u" } as const;
    await expect(isImporterSourcedRecord(ctx, RECORD)).resolves.toBe(true);
    expect(runScoped).toHaveBeenCalledTimes(1);
    expect(runScoped.mock.calls[0]![0]).toBe(ctx);
    expect(seen).toHaveLength(1);
  });

  it("is refused to a role that cannot read clinical records, before any query", async () => {
    const ctx = { tenantId: "t", role: "reception", userId: "u" } as const;
    await expect(isImporterSourcedRecord(ctx, RECORD)).rejects.toThrow();
    expect(runScoped).not.toHaveBeenCalled();
  });
});
