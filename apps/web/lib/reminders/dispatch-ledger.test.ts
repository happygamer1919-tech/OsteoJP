import { describe, expect, it, vi, beforeEach } from "vitest";

// `dispatch-ledger.ts` imports "server-only", which throws outside a Server
// Component. Stubbed the same way lib/statistics/queries.test.ts does.
vi.mock("server-only", () => ({}));

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
let failNext = false;

vi.mock("./context", () => ({
  withReminderTenantContext: async (_t: string, fn: (tx: unknown) => Promise<unknown>) => {
    if (failNext) throw new Error("db down");
    return fn({
      insert: () => ({ values: async (v: Record<string, unknown>) => void inserted.push(v) }),
      update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => void updated.push(v) }) }),
    });
  },
  withReminderResolverContext: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  REMINDER_JOB_ROLE: "admin",
}));

const { recordDispatch, recordProviderStatus } = await import("./dispatch-ledger");

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  failNext = false;
});

const base = {
  tenantId: "t1",
  appointmentId: "a1",
  channel: "sms" as const,
  templateId: "reminder.24h.sms",
};

describe("the dispatch ledger", () => {
  it("records a SENT attempt with its provider id", async () => {
    await recordDispatch({ ...base, outcome: "sent", providerMessageId: "SM123", bodyLength: 131 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      outcome: "sent",
      providerMessageId: "SM123",
      bodyLength: 131,
      suppressionReason: null,
    });
  });

  it("records a SUPPRESSION with its reason — the half that makes an incident legible", async () => {
    await recordDispatch({ ...base, outcome: "suppressed", suppressionReason: "channels_off" });
    expect(inserted[0]).toMatchObject({ outcome: "suppressed", suppressionReason: "channels_off" });
  });

  /**
   * 0075 ties reason and outcome as an EQUIVALENCE, in both directions, with a
   * table CHECK. Enforcing it here too means a careless caller gets a row that
   * is RIGHT rather than a constraint violation that loses the row entirely -
   * and losing the row is the failure mode this whole table exists to end.
   */
  it("drops a reason passed alongside a non-suppressed outcome, rather than losing the row", async () => {
    await recordDispatch({ ...base, outcome: "sent", suppressionReason: "channels_off" });
    expect(inserted[0]!.suppressionReason).toBeNull();
  });

  it("segments is NULL, never a character count wearing a segment name", async () => {
    await recordDispatch({ ...base, outcome: "sent", bodyLength: 131 });
    expect(inserted[0]!.segments).toBeNull();
  });

  it("NEVER throws into the send path — recording a send cannot stop one", async () => {
    failNext = true;
    await expect(recordDispatch({ ...base, outcome: "sent" })).resolves.toBeUndefined();
    expect(inserted).toHaveLength(0);
  });

  it("a status callback widens what is known and never erases an error code", async () => {
    await recordProviderStatus({ tenantId: "t1", providerMessageId: "SM1", providerStatus: "delivered" });
    expect(updated[0]).toMatchObject({ providerStatus: "delivered" });
    expect(updated[0]).not.toHaveProperty("providerErrorCode");

    await recordProviderStatus({
      tenantId: "t1", providerMessageId: "SM1", providerStatus: "failed", providerErrorCode: "30006",
    });
    expect(updated[1]).toMatchObject({ providerStatus: "failed", providerErrorCode: "30006" });
  });

  it("a failing status update does not throw either", async () => {
    failNext = true;
    await expect(
      recordProviderStatus({ tenantId: "t1", providerMessageId: "SM1", providerStatus: "sent" }),
    ).resolves.toBeUndefined();
  });
});
