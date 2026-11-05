import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * The pack payment reads, without a database: a therapist is never read for
 * money (null, no transaction at all), every read answers null or
 * "unavailable" before the sitting, the summaries are the pure module's, the
 * receivables read is bounded and reads every pacote with a price (not only
 * those in use), and every statement joins `patients` and never names
 * `invoices`. The database half is packages/db/tests/pack-instance-payments.db.test.ts.
 */

vi.mock("server-only", () => ({}));

const st = vi.hoisted(() => ({
  present: true,
  execs: [] as unknown[][],
  queries: [] as string[],
  runs: 0,
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@osteojp/db")>();
  return { ...real, packPaymentsSchemaPresent: async () => st.present };
});

const dialect = new PgDialect();
const fakeTx = {
  execute: async (q: SQL) => {
    st.queries.push(dialect.sqlToQuery(q).sql.replace(/\s+/g, " "));
    return st.execs.shift() ?? [];
  },
};
vi.mock("@/lib/auth/context", () => ({
  runScoped: async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    st.runs += 1;
    return fn(fakeTx);
  },
}));

const {
  getPackPaymentDetail,
  listReceivableInstanceIds,
  readPackPaymentSummaries,
  readPacksReceivedThisMonth,
} = await import("./payments-read");

const actor = (role: "owner" | "admin" | "reception" | "therapist") =>
  ({ tenantId: "t-1", userId: "u-1", role }) as Parameters<typeof readPackPaymentSummaries>[0];

beforeEach(() => {
  st.present = true;
  st.execs = [];
  st.queries = [];
  st.runs = 0;
});

describe("the money reads", () => {
  it("a THERAPIST is never read for money: null, and no transaction is opened (P4)", async () => {
    expect(await readPackPaymentSummaries(actor("therapist"), ["a"])).toBeNull();
    expect(await listReceivableInstanceIds(actor("therapist"))).toBeNull();
    expect(await readPacksReceivedThisMonth(actor("therapist"))).toBeNull();
    await expect(getPackPaymentDetail(actor("therapist"), "a")).rejects.toThrow();
    expect(st.runs).toBe(0);
  });

  it("before the sitting every read answers null or unavailable, and names no money table", async () => {
    st.present = false;
    expect(await readPackPaymentSummaries(actor("reception"), ["a"])).toBeNull();
    expect(await listReceivableInstanceIds(actor("reception"))).toBeNull();
    expect(await readPacksReceivedThisMonth(actor("reception"))).toBeNull();
    expect(await getPackPaymentDetail(actor("reception"), "a")).toBe("unavailable");
    expect(st.queries).toEqual([]);
  });

  it("the summaries: the price from the side table, the lines summed, the state derived", async () => {
    st.execs = [
      [
        { id: "a", agreed_price_cents: 45000, switch_amount_cents: null },
        { id: "b", agreed_price_cents: null, switch_amount_cents: null },
        { id: "c", agreed_price_cents: "30000", switch_amount_cents: "5000" },
      ],
      [
        { pack_instance_id: "a", kind: "pagamento", amount_cents: 12000, received_on: "2026-11-01", stylus_ref: null },
        { pack_instance_id: "c", kind: "pagamento", amount_cents: "35000", received_on: "2026-11-02", stylus_ref: "FR 1E/1" },
      ],
    ];
    const m = await readPackPaymentSummaries(actor("reception"), ["a", "b", "c"]);
    expect(m!.get("a")).toMatchObject({ state: "due", outstandingCents: 33000, linesWithoutStylusRef: 1 });
    expect(m!.get("b")).toMatchObject({ state: "unpriced", receivedCents: 0 });
    expect(m!.get("c")).toMatchObject({ state: "paid", dueCents: 35000, lastPaidOn: "2026-11-02" });
    expect(st.queries[0]).toMatch(/left join pack_instance_agreed_prices ap on ap\.pack_instance_id = i\.id/);
    expect(st.queries[0]).toMatch(/join patients p on p\.id = i\.patient_id and p\.tenant_id = i\.tenant_id/);
  });

  it("no ids: no statement past the schema check", async () => {
    expect(await readPackPaymentSummaries(actor("admin"), [])).toEqual(new Map());
    expect(st.queries).toEqual([]);
  });

  it("the receivables read: every priced pacote of a readable, not deleted patient with money owed, bounded, one past the cap", async () => {
    st.execs = [[{ id: "a" }, { id: "b" }, { id: "c" }]];
    expect(await listReceivableInstanceIds(actor("owner"), { cap: 2 })).toEqual({ ids: ["a", "b"], truncated: true });
    const q = st.queries[0]!;
    expect(q).toMatch(/join pack_instance_agreed_prices ap on ap\.pack_instance_id = i\.id/);
    expect(q).toMatch(/join patients p on p\.id = i\.patient_id and p\.tenant_id = i\.tenant_id/);
    expect(q).toMatch(/p\.deleted_at is null/);
    expect(q).toMatch(/ap\.agreed_price_cents \+ coalesce\(i\.switch_amount_cents, 0\) - coalesce\(\(select sum\(l\.amount_cents\) from pack_instance_payments l where l\.pack_instance_id = i\.id\), 0\) > 0/);
    expect(q).toMatch(/limit \$1/);
    // NOT the in-use rule: no session or appointment count in it.
    expect(q).not.toMatch(/appointments|sessions_total|legacy_consumed/);
    st.execs = [[{ id: "a" }]];
    expect(await listReceivableInstanceIds(actor("owner"), { cap: 2 })).toEqual({ ids: ["a"], truncated: false });
    await expect(listReceivableInstanceIds(actor("owner"), { cap: 0 })).rejects.toThrow(RangeError);
  });

  it("the month total: the Lisbon month's bounds, the patients join, a number even from a bigint string", async () => {
    st.execs = [[{ cents: "12050" }]];
    const r = await readPacksReceivedThisMonth(actor("admin"), new Date("2026-06-30T23:30:00Z"));
    expect(r).toEqual({ cents: 12050, first: "2026-07-01", last: "2026-07-31" });
    expect(st.queries[0]).toMatch(/join patients p/);
  });

  it("the detail: not visible is null; otherwise the price and the lines, in order", async () => {
    st.execs = [[]];
    expect(await getPackPaymentDetail(actor("reception"), "x")).toBeNull();
    st.execs = [
      [
        {
          id: "a",
          patient_id: "p",
          full_name: "Ana",
          pack_name: "Pack 10",
          price_cents: 45000,
          sessions_total: 10,
          purchased_at: "2026-10-01T10:00:00Z",
          agreed_price_cents: null,
          switch_amount_cents: null,
        },
      ],
      [],
    ];
    const d = await getPackPaymentDetail(actor("reception"), "a");
    expect(d).toMatchObject({ instanceId: "a", catalogPriceCents: 45000, lines: [] });
    expect(d !== null && d !== "unavailable" && d.summary.state).toBe("unpriced");
  });

  it("no statement of these reads names the invoices table", async () => {
    st.execs = [[{ id: "a", agreed_price_cents: 1, switch_amount_cents: null }], [], [{ id: "a" }], [{ cents: 0 }]];
    await readPackPaymentSummaries(actor("owner"), ["a"]);
    await listReceivableInstanceIds(actor("owner"));
    await readPacksReceivedThisMonth(actor("owner"));
    expect(st.queries.length).toBe(4);
    for (const q of st.queries) expect(q).not.toMatch(/\binvoices\b/);
  });
});
