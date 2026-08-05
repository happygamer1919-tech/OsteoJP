/**
 * W13-03 — the persistence half. The QUERY SHAPES are what matter here; the
 * security policy is tested in otp.test.ts against an in-memory fake.
 *
 * What is asserted is the handful of places where a plausible-looking
 * implementation would be subtly wrong under concurrency, because those are
 * invisible in a passing single-threaded test:
 *   - attempts increment in SQL, never read-modify-write
 *   - consume only matches a row that is still unconsumed
 *   - findLive excludes consumed AND expired rows in the query
 *   - trusted-device checks require unrevoked AND unexpired, and never write
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; payload?: unknown; where?: unknown }>,
  rows: [] as unknown[],
  /** What an UPDATE ... RETURNING yields. Empty = the row did not match. */
  updated: [] as unknown[],
}));

vi.mock("@osteojp/db", () => {
  const rec = (op: string, extra: Record<string, unknown> = {}) => {
    H.calls.push({ op, ...extra });
  };
  const selectChain = () => {
    const self: Record<string, unknown> = {
      from: () => self,
      where: (w: unknown) => { rec("select.where", { where: w }); return self; },
      orderBy: () => self,
      limit: () => Promise.resolve(H.rows),
    };
    return self;
  };
  return {
    getDbAdmin: () => ({
      insert: () => ({
        values: (v: unknown) => {
          rec("insert", { payload: v });
          return { onConflictDoNothing: async () => undefined, then: (f: (x?: unknown) => unknown) => Promise.resolve().then(f) };
        },
      }),
      update: () => ({
        set: (p: unknown) => ({
          // Awaitable on its own (incrementAttempts) AND chainable into
          // .returning() (consume), because the real drizzle builder is both.
          where: (w: unknown) => {
            rec("update", { payload: p, where: w });
            return Object.assign(Promise.resolve(H.updated), {
              returning: async () => H.updated,
            });
          },
        }),
      }),
      select: () => selectChain(),
    }),
    patientOtpCodes: {
      id: "id", tenantId: "tenant_id", phoneHash: "phone_hash", codeHash: "code_hash",
      attempts: "attempts", expiresAt: "expires_at", consumedAt: "consumed_at",
    },
    patientTrustedDevices: {
      deviceTokenHash: "device_token_hash", tenantId: "tenant_id", patientId: "patient_id",
      expiresAt: "expires_at", revokedAt: "revoked_at", lastSeenAt: "last_seen_at",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ op: "and", a }),
  eq: (a: unknown, b: unknown) => ({ op: "eq", a, b }),
  gt: (a: unknown, b: unknown) => ({ op: "gt", a, b }),
  isNull: (a: unknown) => ({ op: "isNull", a }),
  desc: (a: unknown) => ({ op: "desc", a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...v: unknown[]) => ({ op: "sql", raw: strings.join("?"), v }),
    {},
  ),
}));

import { createDrizzleOtpStore, createDrizzleTrustedDeviceStore } from "./otp-store";
import { TRUSTED_DEVICE_TTL_MS } from "./otp";

const NOW = new Date("2026-08-05T10:00:00.000Z");
const flat = (w: unknown): string => JSON.stringify(w);

beforeEach(() => {
  H.calls = [];
  H.rows = [];
  H.updated = [{ id: "r1" }];
});

describe("OTP store query shapes", () => {
  it("increments attempts IN SQL, not read-modify-write", async () => {
    // Read-modify-write leaves a gap where two concurrent guesses both read the
    // same count and write it back as one - a free extra attempt per race,
    // against a cap of five.
    await createDrizzleOtpStore().incrementAttempts("r1");
    const upd = H.calls.find((c) => c.op === "update");
    expect(JSON.stringify(upd?.payload)).toContain("sql");
    expect(JSON.stringify(upd?.payload)).toContain("+ 1");
    // Nothing was read first.
    expect(H.calls.some((c) => c.op === "select.where")).toBe(false);
  });

  it("consume matches ONLY a row that is still unconsumed", async () => {
    // Without the IS NULL guard two simultaneous redemptions both 'succeed' and
    // the second overwrites the first's timestamp, losing when it was spent.
    await createDrizzleOtpStore().consume("r1", NOW);
    const upd = H.calls.find((c) => c.op === "update");
    expect(flat(upd?.where)).toContain("isNull");
    expect(flat(upd?.where)).toContain("consumed_at");
  });

  it("consume REPORTS the race loser instead of returning void", async () => {
    // The IS NULL guard stops the loser WRITING. Only this boolean stops the
    // loser GRANTING, which is the half that matters at the call site.
    H.updated = [{ id: "r1" }];
    expect(await createDrizzleOtpStore().consume("r1", NOW)).toBe(true);

    H.updated = [];
    expect(await createDrizzleOtpStore().consume("r1", NOW)).toBe(false);
  });

  it("uses the handle it is GIVEN, so it can be enrolled in a transaction", async () => {
    // The claim path consumes the code, links the patient and issues the device
    // in ONE transaction. A store that always reached for getDbAdmin() would run
    // outside it and commit on its own, which is the failure 0054 exists to
    // prevent - so this asserts the injected handle is actually used.
    const tx = {
      update: () => ({
        set: () => ({
          where: () => Object.assign(Promise.resolve([]), {
            returning: async () => { txUsed = true; return [{ id: "r1" }]; },
          }),
        }),
      }),
    };
    let txUsed = false;

    const store = createDrizzleOtpStore(tx as unknown as Parameters<typeof createDrizzleOtpStore>[0]);
    expect(await store.consume("r1", NOW)).toBe(true);
    expect(txUsed).toBe(true);
    // And the ambient admin handle was never touched.
    expect(H.calls).toEqual([]);
  });

  it("findLive excludes consumed AND expired rows in the query itself", async () => {
    await createDrizzleOtpStore().findLive("t1", "hash", NOW);
    const w = flat(H.calls.find((c) => c.op === "select.where")?.where);
    expect(w).toContain("isNull");
    expect(w).toContain("consumed_at");
    expect(w).toContain("gt");      // expires_at > now
    expect(w).toContain("expires_at");
  });

  it("findLive returns null rather than undefined when there is no row", async () => {
    expect(await createDrizzleOtpStore().findLive("t1", "hash", NOW)).toBeNull();
  });
});

describe("trusted device store", () => {
  it("computes expiry ONCE at issue, from the ruled 30-day window", async () => {
    await createDrizzleTrustedDeviceStore().issue({
      tenantId: "t1", patientId: "p1", deviceTokenHash: "h", now: NOW,
    });
    const ins = H.calls.find((c) => c.op === "insert");
    const expiresAt = (ins?.payload as { expiresAt: Date }).expiresAt;
    expect(expiresAt.getTime()).toBe(NOW.getTime() + TRUSTED_DEVICE_TTL_MS);
    expect(TRUSTED_DEVICE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("requires unrevoked AND unexpired, and returns the patient id not a boolean", async () => {
    // A boolean would need a second lookup to learn WHO, which is a second
    // chance to attribute a trusted device to the wrong patient.
    H.rows = [{ patientId: "p1" }];
    const store = createDrizzleTrustedDeviceStore();
    expect(await store.isTrusted("h", NOW)).toBe("p1");

    const w = flat(H.calls.find((c) => c.op === "select.where")?.where);
    expect(w).toContain("isNull");
    expect(w).toContain("revoked_at");
    expect(w).toContain("gt");
    expect(w).toContain("expires_at");
  });

  it("checking a device WRITES NOTHING", async () => {
    // last_seen_at is deliberately not written on check: it would turn a read
    // path into a write on every page load, and it must never feed expiry.
    H.rows = [{ patientId: "p1" }];
    await createDrizzleTrustedDeviceStore().isTrusted("h", NOW);
    expect(H.calls.some((c) => c.op === "update" || c.op === "insert")).toBe(false);
  });

  it("returns null for an unknown device", async () => {
    H.rows = [];
    expect(await createDrizzleTrustedDeviceStore().isTrusted("h", NOW)).toBeNull();
  });

  it("revoke keeps the FIRST revocation instant", async () => {
    await createDrizzleTrustedDeviceStore().revoke("h", NOW);
    const w = flat(H.calls.find((c) => c.op === "update")?.where);
    expect(w).toContain("isNull");
    expect(w).toContain("revoked_at");
  });
});
