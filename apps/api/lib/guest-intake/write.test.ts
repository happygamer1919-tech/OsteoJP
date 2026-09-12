/**
 * INTAKE-01 - the write seam and the presence detector, without a database.
 *
 * The DB-gated twin (`write.db.test.ts`) proves the same seam against real
 * Postgres once 0087 is applied. This file runs everywhere, so the properties
 * that can be read off the statement itself are pinned here too: in CI the DB
 * twin can only run its inert arm until 0087 merges.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

import {
  guestIntakeSchemaPresent,
  insertGuestClinicalIntake,
  resetGuestIntakeSchemaCache,
  type GuestClinicalIntakeInsert,
} from "@osteojp/db";

import { writeGuestBooking } from "./write";
import type { GuestIntake } from "./validate";

const render = (q: SQL) => new PgDialect().sqlToQuery(q);

const ROW: GuestClinicalIntakeInsert = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  guestBookingRequestId: "22222222-2222-2222-2222-222222222222",
  dateOfBirth: "1985-03-02",
  reason: "Dor cervical",
  healthConditions: "Hipertensao",
  medication: null,
  fallsAccidents: null,
  surgeries: "Apendicectomia",
  pacemaker: "sim",
  pregnancy: "nao",
  consentVersion: "rgpd-intake-2026-09-11",
};

describe("insertGuestClinicalIntake - the statement", () => {
  const capture = async () => {
    const seen: SQL[] = [];
    await insertGuestClinicalIntake({ execute: async (q: SQL) => void seen.push(q) }, ROW);
    expect(seen).toHaveLength(1);
    return render(seen[0]!);
  };

  it("sets consent_ticked = true and consent_at = now() IN SQL, never from a parameter", async () => {
    const { sql } = await capture();
    const compact = sql.replace(/\s+/g, " ");
    expect(compact).toContain(
      "pacemaker, pregnancy, consent_ticked, consent_at, consent_version",
    );
    expect(compact).toMatch(/::public\.intake_answer, true, now\(\), \$11 \)/);
  });

  it("binds EXACTLY the eleven caller values, in column order, and no timestamp among them", async () => {
    const { params } = await capture();
    expect(params).toEqual([
      ROW.tenantId,
      ROW.guestBookingRequestId,
      ROW.dateOfBirth,
      ROW.reason,
      ROW.healthConditions,
      ROW.medication,
      ROW.fallsAccidents,
      ROW.surgeries,
      ROW.pacemaker,
      ROW.pregnancy,
      ROW.consentVersion,
    ]);
    expect(params.some((p) => p instanceof Date)).toBe(false);
  });

  it("writes guest_clinical_intakes and nothing else - never patients.contraindication_*", async () => {
    const { sql } = await capture();
    expect(sql).toMatch(/^\s*insert into public\.guest_clinical_intakes \(/);
    expect(sql).not.toMatch(/contraindication|patients/);
    // No RETURNING: nothing is read back, so this is an INSERT and only that.
    expect(sql).not.toMatch(/returning/i);
  });
});

describe("guestIntakeSchemaPresent - the detector", () => {
  beforeEach(() => resetGuestIntakeSchemaCache());

  const executor = (present: boolean) => {
    const calls: string[] = [];
    return {
      calls,
      execute: async (q: SQL) => {
        calls.push(render(q).sql);
        return [{ present }];
      },
    };
  };

  it("asks information_schema about THIS table, in public", async () => {
    const ex = executor(false);
    await guestIntakeSchemaPresent(ex);
    expect(ex.calls[0]).toContain("information_schema.tables");
    expect(ex.calls[0]).toContain("table_schema = 'public'");
    expect(ex.calls[0]).toContain("table_name = 'guest_clinical_intakes'");
  });

  it("absent -> false; present -> true (both arms, so neither is a constant)", async () => {
    expect(await guestIntakeSchemaPresent(executor(false))).toBe(false);
    resetGuestIntakeSchemaCache();
    expect(await guestIntakeSchemaPresent(executor(true))).toBe(true);
  });

  it("an empty or malformed answer is ABSENT, never present", async () => {
    expect(await guestIntakeSchemaPresent({ execute: async () => [] })).toBe(false);
    resetGuestIntakeSchemaCache();
    expect(await guestIntakeSchemaPresent({ execute: async () => [{ present: "t" }] })).toBe(false);
  });

  it("reset forgets a cached PRESENT", async () => {
    expect(await guestIntakeSchemaPresent(executor(true))).toBe(true);
    resetGuestIntakeSchemaCache();
    expect(await guestIntakeSchemaPresent(executor(false))).toBe(false);
  });
});

describe("writeGuestBooking - one transaction", () => {
  const INTAKE: GuestIntake = {
    dateOfBirth: "1985-03-02",
    reason: "Dor cervical",
    healthConditions: null,
    medication: null,
    fallsAccidents: null,
    surgeries: null,
    pacemaker: "nao",
    pregnancy: "sim",
    consentVersion: "rgpd-intake-2026-09-11",
  };
  const REQUEST = {
    tenantId: "33333333-3333-3333-3333-333333333333",
    fullName: "Maria",
    phone: "+351912345678",
    serviceId: "44444444-4444-4444-4444-444444444444",
    locationId: "55555555-5555-5555-5555-555555555555",
    practitionerId: null,
    requestedStartsAt: new Date("2026-09-20T08:00:00Z"),
    requestedEndsAt: new Date("2026-09-20T12:00:00Z"),
    sourceIpHash: null,
  };

  const fakeDb = (opts: { failIntake?: boolean } = {}) => {
    const log = { transactions: 0, requests: [] as unknown[], statements: [] as SQL[] };
    const tx = {
      insert: () => ({
        values: (v: unknown) => {
          log.requests.push(v);
          return { returning: async () => [{ id: "req-id-1" }] };
        },
      }),
      execute: async (q: SQL) => {
        if (opts.failIntake) throw Object.assign(new Error("x"), { code: "23514" });
        log.statements.push(q);
        return [];
      },
    };
    const db = {
      transaction: async (cb: (t: typeof tx) => Promise<void>) => {
        log.transactions += 1;
        await cb(tx);
      },
    };
    return { db: db as unknown as Parameters<typeof writeGuestBooking>[0], log };
  };

  it("without an intake: one request insert, no intake statement", async () => {
    const { db, log } = fakeDb();
    await writeGuestBooking(db, REQUEST, null);
    expect(log.transactions).toBe(1);
    expect(log.requests).toEqual([REQUEST]);
    expect(log.statements).toHaveLength(0);
  });

  it("with an intake: both writes in the SAME transaction, the intake keyed on the returned id and the REQUEST's tenant", async () => {
    const { db, log } = fakeDb();
    await writeGuestBooking(db, REQUEST, INTAKE);
    expect(log.transactions).toBe(1);
    expect(log.statements).toHaveLength(1);
    const { params } = render(log.statements[0]!);
    expect(params.slice(0, 2)).toEqual([REQUEST.tenantId, "req-id-1"]);
  });

  it("a failing intake insert REJECTS the transaction, so the caller's rollback happens", async () => {
    const { db } = fakeDb({ failIntake: true });
    await expect(writeGuestBooking(db, REQUEST, INTAKE)).rejects.toMatchObject({ code: "23514" });
  });
});
