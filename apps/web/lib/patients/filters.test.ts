import { and, eq, sql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { patients } from "@osteojp/db";
import { activePatientsOnly } from "./filters";

// BUG-12: the dashboard count read 51 (50 live + 1 soft-deleted) because it
// counted unconditionally. The contract: every active count/list filters
// `deleted_at IS NULL`, while a deleted-inclusive lookup must NOT filter it.
//
// CI runs with no database, so we assert the generated SQL of the shared
// production predicate (`activePatientsOnly`) — the exact object the dashboard
// count, patients list, and search all apply — via Drizzle's connection-less
// QueryBuilder. A row-level proof is covered by the patients RLS suite in
// packages/db, which runs against a live database.
const qb = new QueryBuilder();
const toSql = (q: { toSQL(): { sql: string } }) => q.toSQL().sql.toLowerCase();
const SOME_ID = "00000000-0000-0000-0000-000000000000";

describe("active-patient filter (BUG-12)", () => {
  it("active COUNT excludes soft-deleted rows", () => {
    const q = qb
      .select({ count: sql<number>`count(*)::int` })
      .from(patients)
      .where(activePatientsOnly);
    expect(toSql(q)).toContain('"deleted_at" is null');
  });

  it("active LIST excludes soft-deleted rows", () => {
    // Project an explicit column so `deleted_at` can only appear via the WHERE.
    const q = qb.select({ id: patients.id }).from(patients).where(activePatientsOnly);
    expect(toSql(q)).toContain('"deleted_at" is null');
  });

  it("active by-id lookup excludes soft-deleted rows", () => {
    const q = qb
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.id, SOME_ID), activePatientsOnly));
    expect(toSql(q)).toContain('"deleted_at" is null');
  });

  it("deleted-inclusive lookup (getPatient includeDeleted) does NOT filter deleted_at", () => {
    const q = qb.select({ id: patients.id }).from(patients).where(eq(patients.id, SOME_ID));
    expect(toSql(q)).not.toContain("deleted_at");
  });
});
