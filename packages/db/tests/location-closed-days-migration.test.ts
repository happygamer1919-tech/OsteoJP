/**
 * location-closed-days-migration.test.ts: the STATIC half of the dated clinic
 * closure table's proof. No database: it reads the pending file and the
 * drizzle declaration and pins what a reviewer would otherwise re-read by eye.
 *
 * THE DATABASE HALF is location-closed-days.db.test.ts, which runs only on a
 * database the file was applied to. This half runs everywhere, so a later edit
 * that loosens a policy, opens UPDATE, or lets the drizzle table drift from the
 * SQL is red in the ordinary `pnpm test`.
 *
 * Every assertion is on the STATEMENTS (comments stripped), not on the prose:
 * the header describes the policies in words, and a test that matched the words
 * would pass on a file whose SQL said something else. Each CREATE POLICY is
 * compared EXACTLY (whitespace collapsed), never clause by clause: a
 * `toContain` per clause lets an added `OR true` survive (#1708's R4).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locationClosedDays } from "../src/schema";
import {
  locationClosedDaysSchemaPresent,
  resetLocationClosedDaysSchemaCache,
} from "../src/closed-days-schema";

const PENDING_DIR = join(__dirname, "..", "migrations-pending");
const FILE = "NEXT-AFTER-0113_location_closed_days.sql";
const PATH = join(PENDING_DIR, FILE);

/** Strip block and line comments (block comments nest in Postgres; these do not). */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The statements as the applier runs them, whitespace collapsed. */
function statements(sql: string): string[] {
  return stripComments(sql)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

const text = existsSync(PATH) ? readFileSync(PATH, "utf8") : "";
const stmts = statements(text);

describe(`pending migration ${FILE}`, () => {
  it("exists, flat in migrations-pending, and is the only file claiming the closure table", () => {
    expect(existsSync(PATH)).toBe(true);
    const claimants = readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /create table public\.location_closed_days/i.test(readFileSync(join(PENDING_DIR, f), "utf8")));
    expect(claimants).toEqual([FILE]);
    // Not promoted yet: no numbered file creates it.
    const promoted = readdirSync(join(__dirname, "..", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /create table public\.location_closed_days/i.test(readFileSync(join(__dirname, "..", "migrations", f), "utf8")));
    expect(promoted).toEqual([]);
  });

  it("follows 0113 by name: read from the directories, it is the last pending file and 0114 is free", () => {
    const after = (f: string) => Number(/^NEXT-AFTER-(\d{4})_/.exec(f)?.[1] ?? NaN);
    const pending = readdirSync(PENDING_DIR).filter((f) => /^NEXT-AFTER-\d{4}_[a-z0-9_]+\.sql$/.test(f));
    expect(pending).toContain(FILE);
    expect(after(FILE)).toBe(113);
    // Every other pending file on this branch waits for an earlier number,
    // and this one sorts last, so it promotes after all of them.
    for (const f of pending) expect(after(f), f).toBeLessThanOrEqual(113);
    expect([...pending].sort().at(-1)).toBe(FILE);
    // No promoted migration has taken 0113 or anything after it yet.
    const promotedNumbers = readdirSync(join(__dirname, "..", "migrations"))
      .map((f) => /^(\d{4})_.*\.sql$/.exec(f)?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number);
    expect(promotedNumbers.length).toBeGreaterThan(100);
    expect(Math.max(...promotedNumbers)).toBeLessThan(114);
    // A non-pending name is not counted.
    expect(after("0108_pack_instance_consuming_sessions.sql")).toBeNaN();
  });

  it("opens with the two SET LOCAL lines the 0100 gate requires, in order", () => {
    expect(stmts[0]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(stmts[1]).toBe("SET LOCAL statement_timeout = '60s'");
  });

  it("has no transaction control and creates no function (the SECURITY DEFINER count is unchanged)", () => {
    for (const s of stmts) {
      expect(s).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT)\b/i);
      expect(s).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
      expect(s).not.toMatch(/SECURITY DEFINER/i);
    }
  });

  it("the table: the ruled columns and every CHECK of the design", () => {
    const create = stmts.find((s) => /^CREATE TABLE public\.location_closed_days/i.test(s));
    expect(create).toBeDefined();
    expect(create).toMatch(/tenant_id uuid NOT NULL/);
    expect(create).toMatch(/location_id uuid NOT NULL/);
    expect(create).toMatch(/starts_on date NOT NULL/);
    expect(create).toMatch(/ends_on date NOT NULL/);
    expect(create).toMatch(/closed_from time,/);
    expect(create).toMatch(/closed_to time,/);
    expect(create).toMatch(/kind text NOT NULL CONSTRAINT location_closed_days_kind_check CHECK \(kind IN \('feriado_nacional', 'feriado_municipal', 'encerramento', 'outro'\)\)/);
    expect(create).toMatch(/label text CONSTRAINT location_closed_days_label_check CHECK \(label IS NULL OR \(btrim\(label\) <> '' AND char_length\(label\) <= 80\)\)/);
    expect(create).toMatch(/CONSTRAINT location_closed_days_range_order CHECK \(starts_on <= ends_on\)/);
    expect(create).toMatch(/CONSTRAINT location_closed_days_range_length CHECK \(ends_on - starts_on <= 92\)/);
    expect(create).toMatch(/CONSTRAINT location_closed_days_hours_pair CHECK \(\(closed_from IS NULL\) = \(closed_to IS NULL\)\)/);
    expect(create).toMatch(/CONSTRAINT location_closed_days_hours_order CHECK \(closed_from IS NULL OR closed_from < closed_to\)/);
    expect(create).toMatch(
      /CONSTRAINT location_closed_days_dedupe_uq UNIQUE NULLS NOT DISTINCT \(tenant_id, location_id, starts_on, ends_on, closed_from, closed_to\)/,
    );
    // created_by is NULLABLE: a later owner-run data op (the C6 conversion of
    // the "Feriado" person blocks) writes rows no staff account typed.
    expect(create).toMatch(/created_by uuid\s*,/);
    expect(create).not.toMatch(/created_by uuid NOT NULL/);
  });

  it("the lookup index is (tenant_id, location_id, starts_on)", () => {
    expect(stmts).toContain(
      "CREATE INDEX location_closed_days_lookup_idx ON public.location_closed_days (tenant_id, location_id, starts_on)",
    );
  });

  it("RLS is ENABLED (not forced) before any policy", () => {
    const enable = stmts.findIndex((s) => s === "ALTER TABLE public.location_closed_days ENABLE ROW LEVEL SECURITY");
    const firstPolicy = stmts.findIndex((s) => /^CREATE POLICY/i.test(s));
    expect(enable).toBeGreaterThan(-1);
    expect(firstPolicy).toBeGreaterThan(enable);
    expect(stmts.some((s) => /FORCE ROW LEVEL SECURITY/i.test(s))).toBe(false);
  });

  it("the table gates: revoke by name from every role, then exactly SELECT/INSERT/DELETE to authenticated", () => {
    const grants = stmts.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
    expect(grants).toEqual([
      "REVOKE ALL ON TABLE public.location_closed_days FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT SELECT, INSERT, DELETE ON TABLE public.location_closed_days TO authenticated",
    ]);
    expect(grants.some((g) => /UPDATE/i.test(g))).toBe(false);
  });

  it("the keys: tenant NO ACTION, clinic CASCADE, creator SET NULL", () => {
    const fk = stmts.find((s) => /ADD CONSTRAINT location_closed_days_tenant_id_fkey/.test(s));
    expect(fk).toBe(
      "ALTER TABLE public.location_closed_days " +
        "ADD CONSTRAINT location_closed_days_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id), " +
        "ADD CONSTRAINT location_closed_days_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE, " +
        "ADD CONSTRAINT location_closed_days_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL",
    );
  });

  it("the three CREATE POLICY statements are the LAST three, one per command, never FOR ALL", () => {
    const last3 = stmts.slice(-3);
    expect(last3.every((s) => /^CREATE POLICY/i.test(s))).toBe(true);
    expect(stmts.filter((s) => /^CREATE POLICY/i.test(s))).toHaveLength(3);
    expect(last3.map((s) => /FOR (\w+)/.exec(s)?.[1])).toEqual(["SELECT", "INSERT", "DELETE"]);
  });

  it("each CREATE POLICY is exactly the reviewed statement", () => {
    const tenant = "tenant_id = (SELECT public.jwt_tenant_id())";
    const readers = "(SELECT public.jwt_role()) IN ('owner', 'admin', 'therapist', 'reception')";
    const managers = "(SELECT public.jwt_role()) IN ('owner', 'admin', 'reception')";
    const sameTenantLocation =
      "EXISTS (SELECT 1 FROM public.locations l WHERE l.id = location_closed_days.location_id AND l.tenant_id = (SELECT public.jwt_tenant_id()))";
    const notStarted = "starts_on > (SELECT (now() AT TIME ZONE 'Europe/Lisbon')::date)";
    const head = (name: string, cmd: string) =>
      `CREATE POLICY ${name} ON public.location_closed_days AS PERMISSIVE FOR ${cmd} TO authenticated`;
    expect(stmts.slice(-3)).toEqual([
      `${head("location_closed_days_staff_select", "SELECT")} USING ( ${tenant} AND ${readers} )`,
      `${head("location_closed_days_staff_insert", "INSERT")} WITH CHECK ( ${tenant} AND ${managers} AND created_by = (SELECT auth.uid()) AND ${sameTenantLocation} )`,
      `${head("location_closed_days_staff_delete", "DELETE")} USING ( ${tenant} AND ${managers} AND ${notStarted} )`,
    ]);
  });

  it("CONTROL: the exact comparison above would catch an added OR true", () => {
    const loosened = statements(text.replace("AND created_by = (SELECT auth.uid())", "AND created_by = (SELECT auth.uid()) OR true"));
    expect(loosened.slice(-3)).not.toEqual(stmts.slice(-3));
  });

  it("the drizzle declaration names the same columns and constraints as the SQL", () => {
    const cfg = getTableConfig(locationClosedDays);
    expect(cfg.name).toBe("location_closed_days");
    expect(cfg.columns.map((c) => c.name).sort()).toEqual(
      ["closed_from", "closed_to", "created_at", "created_by", "ends_on", "id", "kind", "label", "location_id", "starts_on", "tenant_id"],
    );
    const notNull = cfg.columns.filter((c) => c.notNull).map((c) => c.name).sort();
    expect(notNull).toEqual(["created_at", "ends_on", "id", "kind", "location_id", "starts_on", "tenant_id"]);
    expect(cfg.checks.map((c) => c.name).sort()).toEqual([
      "location_closed_days_hours_order",
      "location_closed_days_hours_pair",
      "location_closed_days_kind_check",
      "location_closed_days_label_check",
      "location_closed_days_range_length",
      "location_closed_days_range_order",
    ]);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["location_closed_days_dedupe_uq"]);
    expect(cfg.uniqueConstraints[0]?.nullsNotDistinct).toBe(true);
    expect(cfg.indexes.map((i) => i.config.name)).toEqual(["location_closed_days_lookup_idx"]);
    const create = stmts.find((s) => /^CREATE TABLE public\.location_closed_days/i.test(s)) ?? "";
    for (const c of cfg.columns) expect(create).toMatch(new RegExp(`\\b${c.name} `));
  });
});

describe("locationClosedDaysSchemaPresent", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetLocationClosedDaysSchemaCache();
  });

  const executor = (answers: boolean[]) => {
    const calls: unknown[] = [];
    return {
      calls,
      execute: async (q: unknown) => {
        calls.push(q);
        return [{ present: answers.shift() ?? false }];
      },
    };
  };

  it("present is cached for the life of the process", async () => {
    const db = executor([true, false]);
    expect(await locationClosedDaysSchemaPresent(db)).toBe(true);
    expect(await locationClosedDaysSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(1);
  });

  it("absent is re-asked after a minute, so an apply takes effect without a redeploy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
    const db = executor([false, true]);
    expect(await locationClosedDaysSchemaPresent(db)).toBe(false);
    vi.setSystemTime(new Date("2026-11-05T10:00:59Z"));
    expect(await locationClosedDaysSchemaPresent(db)).toBe(false);
    expect(db.calls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-05T10:01:01Z"));
    expect(await locationClosedDaysSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(2);
  });

  it("a missing or malformed answer reads as absent, never as present", async () => {
    expect(await locationClosedDaysSchemaPresent({ execute: async () => [] })).toBe(false);
    resetLocationClosedDaysSchemaCache();
    expect(await locationClosedDaysSchemaPresent({ execute: async () => [{ present: "t" }] })).toBe(false);
    resetLocationClosedDaysSchemaCache();
    expect(await locationClosedDaysSchemaPresent({ execute: async () => undefined })).toBe(false);
  });
});
