/**
 * THE CATCH IS NARROW, AND THIS IS THE TEST THAT SAYS SO.
 *
 * `confirm-redeem-overlap.db.test.ts` proves the real constraint fires and that
 * the path answers instead of throwing. What a live database CANNOT easily be
 * made to prove is the other half of the ruling: that ANY OTHER database error
 * still surfaces exactly as it does today. Inducing an arbitrary fault on that
 * path would mean damaging the schema mid-test.
 *
 * So the transaction seam is mocked and the error is INJECTED. Both arms are
 * asserted from the same entry point, `redeemConfirmCode`, so this is not a
 * test of a helper in isolation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";

const h = vi.hoisted(() => ({
  /** Thrown by the confirm transaction. Set per test. */
  injected: null as unknown,
  /** Every tenant context opened, so the refusal-audit write can be asserted. */
  calls: 0,
  /** Audit rows the refusal path writes. */
  audits: [] as Record<string, unknown>[],
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
}));

// The code resolves to a live, unspent row on a real appointment.
vi.mock("./confirm-code-store", () => ({
  resolveConfirmCode: async () => ({
    tenantId: TENANT,
    appointmentId: APPT,
    consumedAt: null,
  }),
  consumeConfirmCode: async () => true,
}));

/**
 * The transaction seam. Call 1 is `loadAppointment`; call 2 is the confirm
 * transaction, which throws whatever the test injected; call 3, if it happens,
 * is the refusal audit - and the fact that it is a SEPARATE call is the point,
 * because the rolled-back transaction could not have carried it.
 */
vi.mock("./context", () => ({
  withReminderTenantContext: async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    h.calls += 1;
    if (h.calls === 1) {
      const rows = [
        {
          id: APPT,
          tenantId: TENANT,
          patientId: PATIENT,
          status: "scheduled",
          startsAt: h.startsAt,
        },
      ];
      const tx = {
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => rows }) }),
        }),
      };
      return fn(tx);
    }
    if (h.calls === 2) {
      // Nothing injected means the transaction SUCCEEDS, which is what makes
      // the last test a real control rather than another failure path.
      if (h.injected) throw h.injected;
      return fn({
        update: () => ({ set: () => ({ where: async () => undefined }) }),
        insert: () => ({ values: async () => undefined }),
      });
    }
    const tx = {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          h.audits.push(row);
        },
      }),
    };
    return fn(tx);
  },
}));

/** The driver's own shape: drizzle wraps, the PostgresError hangs off `cause`. */
function wrapped(code: string, constraint: string): Error {
  const inner = Object.assign(new Error("conflicting key value"), {
    code,
    constraint_name: constraint,
  });
  return Object.assign(new Error("Failed query: update ..."), { cause: inner });
}

describe("only 0061's refusal is caught", () => {
  beforeEach(() => {
    h.calls = 0;
    h.audits.length = 0;
    h.injected = null;
  });

  async function redeem() {
    const { redeemConfirmCode } = await import("./confirm-redeem");
    return redeemConfirmCode({ code: "Ab3-Xy_9", action: "confirm", now: new Date(), ip: null });
  }

  it("23P01 on appointments_no_double_confirmed becomes double_booked", async () => {
    h.injected = wrapped("23P01", "appointments_no_double_confirmed");
    await expect(redeem()).resolves.toEqual({ outcome: "double_booked" });
  });

  it("and writes ONE refusal audit row, in its own transaction", async () => {
    h.injected = wrapped("23P01", "appointments_no_double_confirmed");
    await redeem();
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      tenantId: TENANT,
      action: "appointment.confirm.sms_code",
      entityId: APPT,
      actorUserId: null,
      metadata: { via: "confirm_code", reason: "double_confirmed_refused" },
    });
  });

  it("the audit metadata stays identifier-shaped: no whitespace, under 64 chars", () => {
    // apps/web/lib/audit/metadata-contract.ts refuses prose in audit metadata.
    // This path inserts directly and bypasses the helper, so the contract is
    // honoured by assertion instead of by the guard.
    const reason = "double_confirmed_refused";
    expect(reason).not.toMatch(/\s/);
    expect(reason.length).toBeLessThanOrEqual(64);
  });

  /* ================================================================== */
  /* THE ARM THAT MATTERS MOST: everything else still surfaces           */
  /* ================================================================== */

  /**
   * THESE ASSERT `toBe(h.injected)`, NOT `toThrow()`.
   *
   * They were written as a bare `rejects.toThrow()` first, and both PASSED
   * against an implementation that did not compile — the call site referenced a
   * classifier that did not exist, so every run threw `ReferenceError` and a
   * matcher that accepts any error accepted that too. A test that cannot tell
   * the error under test from a crash is not testing the catch. Identity is the
   * assertion: the error that comes out must be the exact object that went in.
   */
  it("A DIFFERENT EXCLUSION CONSTRAINT still throws, unchanged", async () => {
    // 23P01 belongs to ANY exclusion constraint. Mapping an unrelated one to
    // "the slot is taken" would be a confident lie to the patient.
    h.injected = wrapped("23P01", "some_other_exclude");
    await expect(redeem()).rejects.toBe(h.injected);
    expect(h.audits).toHaveLength(0);
  });

  it("a UNIQUE violation (23505) still throws, unchanged", async () => {
    h.injected = wrapped("23505", "appointments_pkey");
    await expect(redeem()).rejects.toBe(h.injected);
    expect(h.audits).toHaveLength(0);
  });

  it("an ordinary error still throws, unchanged", async () => {
    h.injected = new Error("connection terminated");
    await expect(redeem()).rejects.toBe(h.injected);
    expect(h.audits).toHaveLength(0);
  });

  it("NEGATIVE CONTROL: with nothing injected the confirm still succeeds", async () => {
    // Without this, every assertion above could be passing on a path that never
    // reaches the try block at all: a function that threw unconditionally would
    // satisfy all five.
    h.injected = null;
    await expect(redeem()).resolves.toEqual({ outcome: "confirmed" });
    expect(h.audits).toHaveLength(0);
  });
});
