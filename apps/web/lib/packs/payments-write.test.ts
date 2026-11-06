import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * recordPackPayment, without a database: the capability checks come first, the
 * schema guard answers "unavailable", the instance and the clinic must be
 * visible, the agreed price is written ONCE (and only with a first payment),
 * a racing second price maps to "price_already_set", and the audit row carries
 * no amount and no reason. The database half (policies, the primary key) is
 * packages/db/tests/pack-instance-payments.db.test.ts.
 */

vi.mock("server-only", () => ({}));

const st = vi.hoisted(() => ({
  present: true,
  execs: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  audits: [] as Array<Record<string, unknown>>,
  insertError: null as unknown,
  runs: 0,
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@osteojp/db")>();
  return { ...real, packPaymentsSchemaPresent: async () => st.present };
});

const fakeTx = {
  execute: async () => st.execs.shift() ?? [],
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      const done = (async () => {
        // The first insert of the transaction (the price row) fails when asked to.
        if (st.insertError) {
          const e = st.insertError;
          st.insertError = null;
          throw e;
        }
        st.inserts.push({ table, values });
        return [{ id: "line-1" }];
      })();
      return { returning: () => done, then: done.then.bind(done), catch: done.catch.bind(done) };
    },
  }),
};

vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    st.runs += 1;
    return fn(fakeTx);
  },
}));
vi.mock("@/lib/admin/audit", () => ({
  writeAudit: async (_tx: unknown, _actor: unknown, entry: Record<string, unknown>) => {
    st.audits.push(entry);
  },
}));

const { recordPackPayment, isUniqueViolation } = await import("./payments-write");
const { packInstanceAgreedPrices, packInstancePayments } = await import("@osteojp/db");

const INST = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const actor = (role: "owner" | "admin" | "reception" | "therapist") =>
  ({ tenantId: "t-1", userId: "u-1", role }) as Parameters<typeof recordPackPayment>[0];
const input = (over: Partial<Parameters<typeof recordPackPayment>[1]> = {}) => ({
  instanceId: INST,
  kind: "pagamento" as const,
  amountCents: 12000,
  receivedOn: "2026-11-05",
  method: "mbway" as const,
  locationId: LOC,
  stylusRef: "FR 1E/1",
  reason: null,
  agreedPriceCents: null,
  ...over,
});

beforeEach(() => {
  st.present = true;
  st.execs = [];
  st.inserts = [];
  st.audits = [];
  st.insertError = null;
  st.runs = 0;
});

describe("recordPackPayment", () => {
  it("a therapist is refused before any transaction (P4)", async () => {
    await expect(recordPackPayment(actor("therapist"), input())).rejects.toThrow();
    expect(st.runs).toBe(0);
  });

  it("a correcao from reception is refused before any transaction", async () => {
    await expect(recordPackPayment(actor("reception"), input({ kind: "correcao", method: null, reason: "x" }))).rejects.toThrow();
    expect(st.runs).toBe(0);
  });

  it("before the sitting: unavailable, nothing written", async () => {
    st.present = false;
    expect(await recordPackPayment(actor("reception"), input())).toEqual({ ok: false, reason: "unavailable" });
    expect(st.inserts).toHaveLength(0);
  });

  it("an instance the viewer cannot see, or an inactive clinic, is refused with nothing written", async () => {
    st.execs = [[]];
    expect(await recordPackPayment(actor("reception"), input())).toEqual({ ok: false, reason: "not_found" });
    st.execs = [[{ id: INST, agreed_price_cents: 45000 }], []];
    expect(await recordPackPayment(actor("reception"), input())).toEqual({ ok: false, reason: "location" });
    expect(st.inserts).toHaveLength(0);
  });

  it("a payment on a priced pacote writes ONE line and an audit row with no amount and no reason", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: 45000 }], [{ id: LOC }]];
    expect(await recordPackPayment(actor("reception"), input())).toEqual({ ok: true, lineId: "line-1" });
    expect(st.inserts.map((i) => i.table)).toEqual([packInstancePayments]);
    expect(st.inserts[0]!.values).toMatchObject({ tenantId: "t-1", createdBy: "u-1", amountCents: 12000, kind: "pagamento" });
    expect(st.audits).toEqual([
      {
        action: "pack_payment.record",
        entityType: "pack_instance_payment",
        entityId: "line-1",
        metadata: { packInstanceId: INST, kind: "pagamento", hasStylusRef: true, setAgreedPrice: false },
      },
    ]);
    expect(JSON.stringify(st.audits)).not.toContain("12000");
  });

  it("the FIRST payment of an unpriced pacote writes the price row, then the line", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: null }], [{ id: LOC }]];
    expect(await recordPackPayment(actor("admin"), input({ agreedPriceCents: 45000 }))).toEqual({ ok: true, lineId: "line-1" });
    expect(st.inserts.map((i) => i.table)).toEqual([packInstanceAgreedPrices, packInstancePayments]);
    expect(st.inserts[0]!.values).toEqual({ packInstanceId: INST, tenantId: "t-1", agreedPriceCents: 45000, createdBy: "u-1" });
    expect(st.audits[0]!.metadata).toMatchObject({ setAgreedPrice: true });
  });

  it("an unpriced pacote's first payment without a price is refused", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: null }], [{ id: LOC }]];
    expect(await recordPackPayment(actor("reception"), input())).toEqual({ ok: false, reason: "price_required" });
    expect(st.inserts).toHaveLength(0);
  });

  it("a refund on an unpriced pacote needs no price and writes none", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: null }], [{ id: LOC }]];
    const r = await recordPackPayment(actor("reception"), input({ kind: "reembolso", amountCents: -1000, reason: "x" }));
    expect(r).toEqual({ ok: true, lineId: "line-1" });
    expect(st.inserts.map((i) => i.table)).toEqual([packInstancePayments]);
  });

  it("a price typed when one already exists (somebody set it meanwhile) is refused, nothing written", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: 45000 }], [{ id: LOC }]];
    expect(await recordPackPayment(actor("reception"), input({ agreedPriceCents: 40000 }))).toEqual({
      ok: false,
      reason: "price_already_set",
    });
    expect(st.inserts).toHaveLength(0);
  });

  it("a race past the check hits the primary key: 23505, however wrapped, is price_already_set", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: null }], [{ id: LOC }]];
    st.insertError = Object.assign(new Error("insert failed"), { cause: { code: "23505" } });
    expect(await recordPackPayment(actor("reception"), input({ agreedPriceCents: 45000 }))).toEqual({
      ok: false,
      reason: "price_already_set",
    });
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("any other database error is NOT swallowed", async () => {
    st.execs = [[{ id: INST, agreed_price_cents: null }], [{ id: LOC }]];
    st.insertError = Object.assign(new Error("boom"), { code: "42501" });
    await expect(recordPackPayment(actor("reception"), input({ agreedPriceCents: 45000 }))).rejects.toThrow("boom");
  });
});
