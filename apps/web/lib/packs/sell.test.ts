import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sellPack ("Vender pack"), without a database: who may sell, the schema guard,
 * the patient and the pacote as the viewer sees them, the refusal while the
 * patient holds the same pacote with sessions left (the lead's default), and
 * the two INSERTs (the instance with the purchase-time sessions_remaining,
 * then its one price row) with an audit row that carries no price.
 */

vi.mock("server-only", () => ({}));

const st = vi.hoisted(() => ({
  present: true,
  selects: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  audits: [] as Array<Record<string, unknown>>,
  runs: 0,
}));

vi.mock("@osteojp/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@osteojp/db")>();
  return { ...real, packPaymentsSchemaPresent: async () => st.present };
});

/** A drizzle-shaped select chain: every step returns the chain; awaiting it yields the next queued answer. */
function chain(): unknown {
  let answer: Promise<unknown> | null = null;
  const take = () => (answer ??= Promise.resolve(st.selects.shift() ?? []));
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "innerJoin", "orderBy"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => take().then(res, rej);
  return c;
}

const fakeTx = {
  select: () => chain(),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      st.inserts.push({ table, values });
      const done = Promise.resolve([{ id: "new-inst" }]);
      return { returning: () => done, then: done.then.bind(done) };
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

const { sellPack } = await import("./sell");
const { packInstanceAgreedPrices, patientPackInstances } = await import("@osteojp/db");

const PAT = "33333333-3333-4333-8333-333333333333";
const PACK = "44444444-4444-4444-8444-444444444444";
const actor = (role: "owner" | "admin" | "reception" | "therapist") =>
  ({ tenantId: "t-1", userId: "u-1", role }) as Parameters<typeof sellPack>[0];
const sale = { patientId: PAT, packId: PACK, agreedPriceCents: 45000 };

beforeEach(() => {
  st.present = true;
  st.selects = [];
  st.inserts = [];
  st.audits = [];
  st.runs = 0;
});

describe("sellPack", () => {
  it("a therapist cannot sell, and nothing is read", async () => {
    await expect(sellPack(actor("therapist"), sale)).rejects.toThrow();
    expect(st.runs).toBe(0);
  });

  it("a negative or fractional price is refused before any read", async () => {
    await expect(sellPack(actor("reception"), { ...sale, agreedPriceCents: -1 })).rejects.toThrow(RangeError);
    await expect(sellPack(actor("reception"), { ...sale, agreedPriceCents: 1.5 })).rejects.toThrow(RangeError);
    expect(st.runs).toBe(0);
  });

  it("before the sitting: unavailable, nothing written", async () => {
    st.present = false;
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "unavailable" });
    expect(st.inserts).toHaveLength(0);
  });

  it("a patient the viewer cannot see, or a deleted one, is refused", async () => {
    st.selects = [[]];
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "patient" });
    st.selects = [[{ id: PAT, deletedAt: new Date() }]];
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "patient" });
    expect(st.inserts).toHaveLength(0);
  });

  it("a missing or inactive pacote is refused", async () => {
    st.selects = [[{ id: PAT, deletedAt: null }], []];
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "pack" });
    st.selects = [[{ id: PAT, deletedAt: null }], [{ id: PACK, sessionCount: 10, isActive: false }]];
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "pack" });
    expect(st.inserts).toHaveLength(0);
  });

  it("REFUSED while the patient holds the same pacote with sessions left", async () => {
    st.selects = [
      [{ id: PAT, deletedAt: null }],
      [{ id: PACK, sessionCount: 10, isActive: true }],
      [
        { sessionsTotal: 10, legacyConsumed: 0, linked: 10 },
        { sessionsTotal: 10, legacyConsumed: 2, linked: "7" },
      ],
    ];
    expect(await sellPack(actor("reception"), sale)).toEqual({ ok: false, reason: "pack_has_free_sessions" });
    expect(st.inserts).toHaveLength(0);
  });

  it("sold when every earlier instance of that pacote is spent: the instance, then its one price row, then the audit", async () => {
    st.selects = [
      [{ id: PAT, deletedAt: null }],
      [{ id: PACK, sessionCount: 10, isActive: true }],
      [{ sessionsTotal: 10, legacyConsumed: 3, linked: 7 }],
    ];
    expect(await sellPack(actor("admin"), sale)).toEqual({ ok: true, instanceId: "new-inst" });
    expect(st.inserts.map((i) => i.table)).toEqual([patientPackInstances, packInstanceAgreedPrices]);
    expect(st.inserts[0]!.values).toEqual({
      tenantId: "t-1",
      patientId: PAT,
      packId: PACK,
      sessionsTotal: 10,
      sessionsRemaining: 10,
      legacyConsumed: 0,
    });
    expect(st.inserts[1]!.values).toEqual({
      packInstanceId: "new-inst",
      tenantId: "t-1",
      agreedPriceCents: 45000,
      createdBy: "u-1",
    });
    expect(st.audits).toEqual([
      {
        action: "pack_instance.sell",
        entityType: "patient_pack_instance",
        entityId: "new-inst",
        metadata: { packId: PACK, patientId: PAT, sessionsTotal: 10 },
      },
    ]);
    expect(JSON.stringify(st.audits)).not.toContain("45000");
  });

  it("a first sale (no earlier instance) at price 0 is a real price", async () => {
    st.selects = [[{ id: PAT, deletedAt: null }], [{ id: PACK, sessionCount: 5, isActive: true }], []];
    expect(await sellPack(actor("owner"), { ...sale, agreedPriceCents: 0 })).toEqual({ ok: true, instanceId: "new-inst" });
    expect(st.inserts[1]!.values.agreedPriceCents).toBe(0);
  });
});
