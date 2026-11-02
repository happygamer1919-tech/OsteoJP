/**
 * weekly-blocks-migration.test.ts: the STATIC half of the weekly block table's
 * proof. No database: it reads the pending file and the drizzle declaration
 * and pins what a reviewer would otherwise have to re-read by eye.
 *
 * THE DATABASE HALF is therapist-weekly-blocks.db.test.ts, which runs only on a
 * database the file was applied to. This half runs everywhere, so a later edit
 * that loosens a policy, opens UPDATE, or lets the drizzle table drift from the
 * SQL is red in the ordinary `pnpm test`.
 *
 * Every assertion is on the STATEMENTS (comments stripped), not on the prose:
 * the header describes the policies in words, and a test that matched the words
 * would pass on a file whose SQL said something else.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { therapistWeeklyBlocks } from "../src/schema";
import {
  resetWeeklyBlocksSchemaCache,
  weeklyBlocksSchemaPresent,
} from "../src/weekly-blocks-schema";

const PENDING_DIR = join(__dirname, "..", "migrations-pending");
const FILE = "NEXT-AFTER-0109_weekly_blocks.sql";
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
  it("exists, flat in migrations-pending, and is the only file claiming the weekly table", () => {
    expect(existsSync(PATH)).toBe(true);
    const claimants = readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /create table public\.therapist_weekly_blocks/i.test(readFileSync(join(PENDING_DIR, f), "utf8")));
    expect(claimants).toEqual([FILE]);
  });

  it("sorts AFTER both other files that wait for 0109 (services fields, Sistemas)", () => {
    const siblings = [
      "NEXT-AFTER-0109_services_booking_type_fields.sql",
      "NEXT-AFTER-0109_sistemas_subsistemas.sql",
    ];
    const sorted = [...siblings, FILE].sort();
    expect(sorted[sorted.length - 1]).toBe(FILE);
    // A control: the comparison is byte order, and a name that sorted first
    // would be caught by the same line.
    expect(["NEXT-AFTER-0109_aaa.sql", ...siblings].sort()[0]).toBe("NEXT-AFTER-0109_aaa.sql");
  });

  it("opens with the two SET LOCAL lines the 0100 gate requires, in order", () => {
    expect(stmts[0]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(stmts[1]).toBe("SET LOCAL statement_timeout = '60s'");
  });

  it("has no transaction control and creates no function", () => {
    for (const s of stmts) {
      expect(s).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT)\b/i);
      expect(s).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    }
  });

  it("the table: tenant_id NOT NULL, weekday range, start before end, the dedupe key", () => {
    const create = stmts.find((s) => /^CREATE TABLE public\.therapist_weekly_blocks/i.test(s));
    expect(create).toBeDefined();
    expect(create).toMatch(/tenant_id uuid NOT NULL/);
    expect(create).toMatch(/user_id uuid NOT NULL/);
    expect(create).toMatch(/weekday smallint NOT NULL/);
    expect(create).toMatch(/CHECK \(weekday BETWEEN 0 AND 6\)/);
    expect(create).toMatch(/start_time time NOT NULL/);
    expect(create).toMatch(/end_time time NOT NULL/);
    expect(create).toMatch(/CHECK \(start_time < end_time\)/);
    expect(create).toMatch(/UNIQUE \(tenant_id, user_id, weekday, start_time, end_time\)/);
    // NO END DATE, by design: an open-ended rule. A valid_until column here
    // would be a different feature (time_off's lote already covers bounded).
    expect(create).not.toMatch(/valid_(from|until)|ends_on|end_date/i);
  });

  it("RLS is ENABLED (not forced) before any policy", () => {
    const enable = stmts.findIndex((s) => s === "ALTER TABLE public.therapist_weekly_blocks ENABLE ROW LEVEL SECURITY");
    const firstPolicy = stmts.findIndex((s) => /^CREATE POLICY/i.test(s));
    expect(enable).toBeGreaterThan(-1);
    expect(firstPolicy).toBeGreaterThan(enable);
    expect(stmts.some((s) => /FORCE ROW LEVEL SECURITY/i.test(s))).toBe(false);
  });

  it("the table gates: revoke by name from every role, then exactly SELECT/INSERT/DELETE to authenticated and SELECT to service_role", () => {
    const grants = stmts.filter((s) => /^(GRANT|REVOKE)\b/i.test(s));
    expect(grants).toEqual([
      "REVOKE ALL ON TABLE public.therapist_weekly_blocks FROM PUBLIC, anon, authenticated, patient, service_role",
      "GRANT SELECT, INSERT, DELETE ON TABLE public.therapist_weekly_blocks TO authenticated",
      "GRANT SELECT ON TABLE public.therapist_weekly_blocks TO service_role",
    ]);
    // UPDATE is granted to nobody: a rule is deleted and added again.
    expect(grants.some((g) => /UPDATE/i.test(g))).toBe(false);
  });

  it("the keys: tenant NO ACTION, therapist CASCADE, creator SET NULL", () => {
    const fk = stmts.find((s) => /ADD CONSTRAINT therapist_weekly_blocks_tenant_id_fkey/.test(s));
    expect(fk).toBeDefined();
    expect(fk).toMatch(/FOREIGN KEY \(tenant_id\) REFERENCES public\.tenants\(id\),/);
    expect(fk).toMatch(/FOREIGN KEY \(user_id\) REFERENCES public\.users\(id\) ON DELETE CASCADE/);
    expect(fk).toMatch(/FOREIGN KEY \(created_by\) REFERENCES public\.users\(id\) ON DELETE SET NULL/);
  });

  it("the three CREATE POLICY statements are the LAST three, one per command, never FOR ALL, never UPDATE", () => {
    const last3 = stmts.slice(-3);
    expect(last3.every((s) => /^CREATE POLICY/i.test(s))).toBe(true);
    expect(stmts.filter((s) => /^CREATE POLICY/i.test(s))).toHaveLength(3);
    expect(last3.map((s) => /FOR (\w+)/.exec(s)?.[1])).toEqual(["SELECT", "INSERT", "DELETE"]);
    for (const s of last3) {
      expect(s).toMatch(/AS PERMISSIVE/);
      expect(s).toMatch(/TO authenticated/);
      // Keyed on the JWT tenant FIRST, the time_off model.
      expect(s).toMatch(/\(\s*tenant_id = \(SELECT public\.jwt_tenant_id\(\)\)/);
      expect(s).toMatch(/\(SELECT public\.jwt_role\(\)\) IN \('owner', 'admin', 'therapist', 'reception'\)/);
    }
  });

  it("insert names its creator; insert and delete hold a therapist to their own rules; select does not", () => {
    const [select, insert, del] = stmts.slice(-3);
    const own = "((SELECT public.jwt_role()) <> 'therapist' OR user_id = (SELECT auth.uid()))";
    expect(insert).toContain("created_by = (SELECT auth.uid())");
    expect(insert).toContain(own);
    expect(del).toContain(own);
    expect(select).not.toContain(own);
    expect(insert).toMatch(/^CREATE POLICY therapist_weekly_blocks_staff_insert .* WITH CHECK \(/);
    expect(del).toMatch(/^CREATE POLICY therapist_weekly_blocks_staff_delete .* USING \(/);
  });

  it("the drizzle declaration names the same columns and constraints as the SQL", () => {
    const cfg = getTableConfig(therapistWeeklyBlocks);
    expect(cfg.name).toBe("therapist_weekly_blocks");
    expect(cfg.columns.map((c) => c.name).sort()).toEqual(
      ["created_at", "created_by", "end_time", "id", "start_time", "tenant_id", "user_id", "weekday"],
    );
    const notNull = cfg.columns.filter((c) => c.notNull).map((c) => c.name).sort();
    expect(notNull).toEqual(["created_at", "end_time", "id", "start_time", "tenant_id", "user_id", "weekday"]);
    expect(cfg.checks.map((c) => c.name).sort()).toEqual([
      "therapist_weekly_blocks_start_before_end",
      "therapist_weekly_blocks_weekday_range",
    ]);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["therapist_weekly_blocks_dedupe_uq"]);
    // Every column the drizzle table names is in the CREATE TABLE.
    const create = stmts.find((s) => /^CREATE TABLE public\.therapist_weekly_blocks/i.test(s)) ?? "";
    for (const c of cfg.columns) expect(create).toMatch(new RegExp(`\\b${c.name} `));
  });
});

describe("weeklyBlocksSchemaPresent", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetWeeklyBlocksSchemaCache();
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
    expect(await weeklyBlocksSchemaPresent(db)).toBe(true);
    expect(await weeklyBlocksSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(1);
  });

  it("absent is re-asked after a minute, so an apply takes effect without a redeploy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    const db = executor([false, true]);
    expect(await weeklyBlocksSchemaPresent(db)).toBe(false);
    vi.setSystemTime(new Date("2026-11-02T10:00:59Z"));
    expect(await weeklyBlocksSchemaPresent(db)).toBe(false);
    expect(db.calls).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-02T10:01:01Z"));
    expect(await weeklyBlocksSchemaPresent(db)).toBe(true);
    expect(db.calls).toHaveLength(2);
  });

  it("a missing or malformed answer reads as absent, never as present", async () => {
    const db = { execute: async () => [] };
    expect(await weeklyBlocksSchemaPresent(db)).toBe(false);
    resetWeeklyBlocksSchemaCache();
    const odd = { execute: async () => [{ present: "t" }] };
    expect(await weeklyBlocksSchemaPresent(odd)).toBe(false);
  });
});
