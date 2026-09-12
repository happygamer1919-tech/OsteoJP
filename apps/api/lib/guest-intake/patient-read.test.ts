/**
 * INTAKE-01 - the patient's own intake read, without a database.
 *
 * What this proves that the DB-gated suite cannot prove cheaply: that the read
 * is INERT while 0087 is absent (no patient transaction is even opened), that
 * the statement runs inside the patient transaction and is scoped by the
 * VERIFIED principal's tenant, and that the three states survive the projection
 * - `nao_perguntado` is never folded into `nao`. What the database does with the
 * statement is patient-read.db.test.ts's job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  present: false,
  runs: [] as unknown[],
  queries: [] as SQL[],
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@osteojp/db", () => ({
  getDbAdmin: () => ({ admin: true }),
  guestIntakeSchemaPresent: async () => H.present,
}));

vi.mock("@/lib/auth/patient", () => ({
  runAsPatient: async (principal: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    H.runs.push(principal);
    return fn({
      execute: async (q: SQL) => {
        H.queries.push(q);
        return H.rows;
      },
    });
  },
}));

import { readOwnGuestIntakes, toPatientGuestIntake } from "./patient-read";

const PRINCIPAL = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  patientId: "22222222-2222-4222-8222-222222222222",
  userId: "u-1",
};

const ROW = {
  id: "33333333-3333-4333-8333-333333333333",
  submitted_at: new Date("2026-09-11T09:00:00Z"),
  date_of_birth: "1985-03-02",
  reason: "Dor lombar",
  health_conditions: null,
  medication: "Ibuprofeno",
  falls_accidents: null,
  surgeries: null,
  pacemaker: "nao_perguntado",
  pregnancy: "nao",
  consent_at: "2026-09-11T09:00:00.000Z",
};

beforeEach(() => {
  H.present = false;
  H.runs = [];
  H.queries = [];
  H.rows = [];
});

describe("inert until 0087 is applied", () => {
  it("table absent: enabled false, no intakes, and NO patient transaction is opened", async () => {
    H.present = false;
    await expect(readOwnGuestIntakes(PRINCIPAL)).resolves.toEqual({ enabled: false, intakes: [] });
    expect(H.runs).toEqual([]);
    expect(H.queries).toEqual([]);
  });

  it("THE CONTROL: table present, the read runs, as the principal, once", async () => {
    H.present = true;
    H.rows = [ROW];
    const out = await readOwnGuestIntakes(PRINCIPAL);
    expect(out.enabled).toBe(true);
    expect(out.intakes).toHaveLength(1);
    expect(H.runs).toEqual([PRINCIPAL]);
    expect(H.queries).toHaveLength(1);
  });
});

describe("the statement", () => {
  it("reads the intake table through the patient's own request ids, filtered on the principal's tenant", async () => {
    H.present = true;
    await readOwnGuestIntakes(PRINCIPAL);
    const { sql: text, params } = new PgDialect().sqlToQuery(H.queries[0]!);
    expect(text).toContain("from public.guest_clinical_intakes");
    expect(text).toContain("public.patient_guest_request_ids()");
    expect(text).toMatch(/where i\.tenant_id = \$1::uuid/);
    expect(params).toEqual([PRINCIPAL.tenantId]);
  });

  it("is a SELECT and nothing else", async () => {
    H.present = true;
    await readOwnGuestIntakes(PRINCIPAL);
    const { sql: text } = new PgDialect().sqlToQuery(H.queries[0]!);
    expect(text.trim().toLowerCase().startsWith("select")).toBe(true);
    expect(text.toLowerCase()).not.toMatch(/\b(insert|update|delete)\b/);
  });

  it("never selects the request id, the tenant or the consent label", async () => {
    H.present = true;
    await readOwnGuestIntakes(PRINCIPAL);
    const { sql: text } = new PgDialect().sqlToQuery(H.queries[0]!);
    const selectList = text.slice(0, text.indexOf("from public.guest_clinical_intakes"));
    expect(selectList).not.toContain("guest_booking_request_id");
    expect(selectList).not.toContain("tenant_id");
    expect(selectList).not.toContain("consent_version");
  });
});

describe("the projection keeps THREE states", () => {
  it("nao_perguntado stays nao_perguntado, and nao stays nao", () => {
    const dto = toPatientGuestIntake(ROW);
    expect(dto.pacemaker).toBe("nao_perguntado");
    expect(dto.pregnancy).toBe("nao");
  });

  it("the DTO carries no internal linkage", () => {
    expect(Object.keys(toPatientGuestIntake(ROW)).sort()).toEqual([
      "consentAt",
      "dateOfBirth",
      "fallsAccidents",
      "healthConditions",
      "id",
      "medication",
      "pacemaker",
      "pregnancy",
      "reason",
      "submittedAt",
      "surgeries",
    ]);
  });

  it("timestamps become ISO strings whether the driver gives a Date or a string", () => {
    const dto = toPatientGuestIntake(ROW);
    expect(dto.submittedAt).toBe("2026-09-11T09:00:00.000Z");
    expect(dto.consentAt).toBe("2026-09-11T09:00:00.000Z");
  });

  it("an answer outside the three states is REFUSED, never mapped to one of them", () => {
    expect(() => toPatientGuestIntake({ ...ROW, pacemaker: "" })).toThrow();
    expect(() => toPatientGuestIntake({ ...ROW, pregnancy: "false" })).toThrow();
  });

  it("the refusal names no answer", () => {
    try {
      toPatientGuestIntake({ ...ROW, pacemaker: "Dor lombar" });
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("Dor lombar");
    }
  });
});
