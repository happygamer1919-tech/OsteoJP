/**
 * WF-07 (R4) — phone-match linkage. The refusals are the feature.
 *
 * "Mis-linking a medical record is the failure class the refusal exists to
 * prevent." So these tests are mostly about what does NOT link.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ rows: [] as Array<{ id: string }>, where: null as unknown, limit: 0 }));

vi.mock("@osteojp/db", () => ({
  getDbAdmin: () => ({
    select: () => {
      const self: Record<string, unknown> = {
        from: () => self,
        where: (w: unknown) => { H.where = w; return self; },
        limit: (n: number) => { H.limit = n; return Promise.resolve(H.rows); },
      };
      return self;
    },
  }),
  patients: {
    id: "id", tenantId: "tenant_id", phone: "phone", phoneE164: "phone_e164",
    deletedAt: "deleted_at", mergedIntoId: "merged_into_id", authUserId: "auth_user_id",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  isNull: (a: unknown) => ({ op: "isNull", a }),
}));

import { resolvePatientByProvenPhone } from "./patient-linkage";

const T = "tenant-1";
const PHONE = "+351912345678";

beforeEach(() => { H.rows = []; H.where = null; H.limit = 0; });

describe("exactly one live unlinked row links", () => {
  it("links when there is precisely one candidate", async () => {
    H.rows = [{ id: "p1" }];
    expect(await resolvePatientByProvenPhone(T, PHONE)).toEqual({ ok: true, patientId: "p1" });
  });
});

describe("everything else REFUSES, identically", () => {
  it("refuses on zero matches", async () => {
    H.rows = [];
    expect(await resolvePatientByProvenPhone(T, PHONE)).toEqual({ ok: false });
  });

  it("refuses on multiple matches - a shared household number must not link", async () => {
    H.rows = [{ id: "p1" }, { id: "p2" }];
    expect(await resolvePatientByProvenPhone(T, PHONE)).toEqual({ ok: false });
  });

  it("the two refusals are indistinguishable, and carry no reason", async () => {
    H.rows = [];
    const zero = await resolvePatientByProvenPhone(T, PHONE);
    H.rows = [{ id: "p1" }, { id: "p2" }];
    const many = await resolvePatientByProvenPhone(T, PHONE);

    expect(zero).toEqual(many);
    // "no row" vs "several rows" are different disclosures about who else exists
    // in this clinic's records. A caller who can tell them apart can enumerate
    // patients by phone number.
    expect(Object.keys(zero)).toEqual(["ok"]);
  });
});

describe("the query itself carries the rule", () => {
  it("applies all four predicates in SQL, not afterwards in JS", async () => {
    // In JS a later edit can drop one filter and widen the candidate set
    // silently. In the query, dropping one is a visible diff.
    H.rows = [{ id: "p1" }];
    await resolvePatientByProvenPhone(T, PHONE);
    const w = JSON.stringify(H.where);
    for (const col of ["deleted_at", "merged_into_id", "auth_user_id", "tenant_id", "phone_e164"]) {
      expect(w).toContain(col);
    }
  });

  it("matches the DERIVED phone_e164 column and NEVER the raw phone", async () => {
    // ================================================================= //
    // THE REGRESSION GUARD FOR SEC-otp-linkage-exact-phone-match.
    // ================================================================= //
    // This query compared `eq(patients.phone, phoneE164)` until 2026-08-13 - an
    // exact string match against a FREE-TEXT column that nothing normalizes on
    // write - so a patient stored as "+351 912 345 678" could not log in at all.
    // Migration 0062 added `phone_e164`, GENERATED ALWAYS from `phone`.
    //
    // A SUBSTRING CHECK CANNOT EXPRESS THIS, and that is why the assertion is
    // written on the operand: "phone_e164" CONTAINS "phone", so
    // `expect(w).toContain("phone")` passes under both the broken and the fixed
    // query and would have caught nothing. The operands are compared exactly.
    H.rows = [{ id: "p1" }];
    await resolvePatientByProvenPhone(T, PHONE);

    const operands = JSON.stringify(H.where).match(/"a":"[a-z_0-9]+"/g) ?? [];
    expect(
      operands,
      "the linkage query must match phone_e164; matching the raw `phone` column is the defect",
    ).toContain('"a":"phone_e164"');
    expect(
      operands,
      "the raw `phone` column must NOT appear as a match operand - it is free text",
    ).not.toContain('"a":"phone"');
  });

  it("fetches TWO rows, because LIMIT 1 cannot tell one from many", async () => {
    // The load-bearing detail: with LIMIT 1 an ambiguous match returns the same
    // single row as an unambiguous one, silently becoming a confident mis-link.
    H.rows = [{ id: "p1" }];
    await resolvePatientByProvenPhone(T, PHONE);
    expect(H.limit).toBe(2);
  });
});
