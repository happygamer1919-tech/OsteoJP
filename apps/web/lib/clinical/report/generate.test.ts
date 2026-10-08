import { beforeEach, describe, expect, it, vi } from "vitest";

// EXPORT-01: `generateRegistoReportPdf`, the registo's PDF for whoever may open
// the registo. What is pinned here, on a fake transaction, is the reach it
// reads with, which is the registo page's (`getRecordDetail`, records.ts):
//
//   - the capability first: reception is refused before any read;
//   - the therapist read scope on the record's patient, ANDed into the record
//     read beside the record's id, never an alternative to it;
//   - owner and admin: no app predicate; their narrowing is RLS's;
//   - the read runs with the caller's own claims.
// What the reads return for which role is the database's answer
// (registo-export.db.test.ts).

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  claims: [] as unknown[],
  wheres: [] as unknown[],
  rows: [] as unknown[],
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/db")>();
  // The record read, answered with `h.rows`; its WHERE and the claims it ran
  // under are kept. An empty answer ends the load before any other read.
  const chain = () => {
    const b: Record<string, unknown> = {};
    for (const step of ["from", "innerJoin", "leftJoin"]) b[step] = () => b;
    b.where = (w: unknown) => {
      h.wheres.push(w);
      return b;
    };
    b.limit = async () => h.rows;
    return b;
  };
  return {
    ...actual,
    withTenantContext: async (claims: unknown, fn: (tx: unknown) => unknown) => {
      h.claims.push(claims);
      return fn({ select: () => chain() });
    },
  };
});
vi.mock("@/lib/patients/scope", async () => {
  const { sql } = await import("drizzle-orm");
  return {
    // The narrowing itself is scope.ts's; here it is a marker, so its place in
    // the WHERE can be read.
    therapistPatientReadScope: vi.fn(async (ctx: { role: string; userId: string }, col: unknown) =>
      ctx.role === "therapist" ? sql`THERAPIST_READ_SCOPE(${col}, ${ctx.userId})` : undefined,
    ),
  };
});

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { clinicalRecords } from "@osteojp/db";
import { ForbiddenError, toClaims, type RequestContext } from "@osteojp/auth";
import { therapistPatientReadScope } from "@/lib/patients/scope";
import { isClinicalError } from "../errors";
import { generateClinicalReportPdf, generateRegistoReportPdf, registoReadScope } from "./generate";

const mockScope = vi.mocked(therapistPatientReadScope);
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as SQL);

const TENANT = "11111111-1111-4111-8111-111111111111";
const REC = "aaaaaaaa-0000-4000-8000-000000000001";
const THERAPIST_ID = "22222222-2222-4222-8222-222222222222";
const ctxOf = (role: RequestContext["role"], userId = "33333333-3333-4333-8333-333333333333"): RequestContext => ({
  tenantId: TENANT,
  role,
  userId,
});
const therapist = ctxOf("therapist", THERAPIST_ID);

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    return isClinicalError(e) ? e.code : (e as Error).name;
  }
  return "printed";
};

beforeEach(() => {
  h.claims = [];
  h.wheres = [];
  h.rows = [];
  mockScope.mockClear();
});

describe("generateRegistoReportPdf: the reach it reads with is the registo page's", () => {
  it("RECEPTION is refused before any read, and before the scope is asked", async () => {
    await expect(generateRegistoReportPdf(ctxOf("reception"), REC, "pt")).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockScope).not.toHaveBeenCalled();
    expect(h.claims).toEqual([]);
  });

  it("a THERAPIST: the record read carries the therapist read scope on the record's patient, ANDed with the id", async () => {
    expect(await codeOf(() => generateRegistoReportPdf(therapist, REC, "pt"))).toBe("not_found");
    expect(mockScope).toHaveBeenCalledTimes(1);
    expect(mockScope).toHaveBeenCalledWith(therapist, clinicalRecords.patientId);
    expect(h.claims).toEqual([toClaims(therapist)]);
    const where = render(h.wheres[0]);
    expect(where.sql).toContain("THERAPIST_READ_SCOPE(");
    expect(where.params).toEqual(expect.arrayContaining([REC, THERAPIST_ID]));
    // Beside the id, never instead of it.
    expect(where.sql).toMatch(/\band\b/i);
    expect(where.sql).not.toMatch(/\bor\b/i);
  });

  it.each(["owner", "admin"] as const)("%s: no therapist scope in the app predicate; the id alone, under their own claims", async (role) => {
    const c = ctxOf(role);
    expect(await codeOf(() => generateRegistoReportPdf(c, REC, "pt"))).toBe("not_found");
    expect(h.claims).toEqual([toClaims(c)]);
    const where = render(h.wheres[0]);
    expect(where.sql).not.toContain("THERAPIST_READ_SCOPE(");
    expect(where.params).toEqual([REC]);
  });

  it("a scope asked once (`registoReadScope`) is used as handed in, and not asked again", async () => {
    const scope = await registoReadScope(therapist);
    expect(mockScope).toHaveBeenCalledTimes(1);
    await codeOf(() => generateRegistoReportPdf(therapist, REC, "pt", scope));
    await codeOf(() => generateRegistoReportPdf(therapist, REC, "pt", scope));
    expect(mockScope).toHaveBeenCalledTimes(1);
    expect(h.wheres).toHaveLength(2);
    for (const w of h.wheres) expect(render(w).sql).toContain("THERAPIST_READ_SCOPE(");
  });

  it("CONTROL: the engine called without a scope reads by the id alone (RLS is then the whole narrowing)", async () => {
    expect(await codeOf(() => generateClinicalReportPdf(toClaims(therapist), REC, "pt"))).toBe("not_found");
    const where = render(h.wheres[0]);
    expect(where.sql).not.toContain("THERAPIST_READ_SCOPE(");
    expect(where.params).toEqual([REC]);
  });
});
