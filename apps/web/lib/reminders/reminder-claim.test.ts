/**
 * reminder-claim.test.ts: the claim's contract, with the database replaced.
 *
 * What a real Postgres has to prove (the row lands under the job's own role,
 * the lock is taken, a second tenant cannot see it) is in
 * reminder-log.db.test.ts. Pinned here is everything around it: the row's
 * shape, the ten minute edge, and the one property the send path leans on,
 * that taking a claim returns nothing and can never throw.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

/** Every statement the claim's transaction ran, in order. */
const ran: ({ kind: "execute"; sql: string; params: unknown[] } | { kind: "insert"; values: Record<string, unknown> })[] = [];
let failAt: "context" | "bounds" | "lock" | "insert" | null = null;

const dialect = new PgDialect();

vi.mock("./context", () => ({
  // NOT async, like the real one: a failure before the transaction opens is a
  // synchronous throw, and the claim has to swallow that shape too.
  withReminderTenantContext: (_t: string, fn: (tx: unknown) => Promise<unknown>) => {
    if (failAt === "context") throw new Error("db down");
    return fn({
      execute: async (q: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const built = dialect.sqlToQuery(q);
        const isLock = built.sql.includes("pg_advisory_xact_lock");
        if (failAt === "bounds" && !isLock) throw new Error("bounds refused");
        // What Postgres answers when the wait for a lock runs out.
        if (failAt === "lock" && isLock) throw new Error("lock wait timed out");
        ran.push({ kind: "execute", sql: built.sql, params: built.params });
      },
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          if (failAt === "insert") throw new Error("insert refused");
          ran.push({ kind: "insert", values: v });
        },
      }),
    });
  },
  REMINDER_JOB_ROLE: "admin",
}));

const {
  CLAIM_LOCK_TIMEOUT,
  CLAIM_STATEMENT_TIMEOUT,
  EARLY_CLAIM_MS,
  REMINDER_CLAIM_ACTION,
  isEarlyClaim,
  reminderClaimLockPayload,
  reminderMark,
  takeReminderClaim,
} = await import("./reminder-claim");

const TENANT = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT = "11111111-1111-1111-1111-111111111111";
const START = new Date("2031-05-14T10:00:00.000Z");
/** The 24 hour mark of START. */
const MARK_24H = new Date("2031-05-13T10:00:00.000Z");

const base = {
  tenantId: TENANT,
  appointmentId: APPOINTMENT,
  offsetId: "24h",
  channel: "sms" as const,
  startsAt: START,
  taker: "run" as const,
  now: MARK_24H,
};

beforeEach(() => {
  ran.length = 0;
  failAt = null;
});

/** The metadata of the one row the claim inserted. */
function insertedMetadata(): Record<string, unknown> {
  const inserts = ran.filter((r) => r.kind === "insert");
  expect(inserts).toHaveLength(1);
  return (inserts[0] as { values: { metadata?: unknown } }).values.metadata as Record<string, unknown>;
}

describe("the reminder claim: the row", () => {
  it("is an audit row: the appointment as the entity, the start as an ISO instant, no actor", async () => {
    await takeReminderClaim(base);
    const inserts = ran.filter((r) => r.kind === "insert");
    expect(inserts).toEqual([
      {
        kind: "insert",
        values: {
          tenantId: TENANT,
          actorUserId: null,
          action: "appointment.reminder_claimed",
          entityType: "appointment",
          entityId: APPOINTMENT,
          metadata: {
            source: "reminder-claim",
            offsetId: "24h",
            channel: "sms",
            startsAt: "2031-05-14T10:00:00.000Z",
            taker: "run",
            early: false,
          },
          ip: null,
        },
      },
    ]);
    expect(REMINDER_CLAIM_ACTION).toBe("appointment.reminder_claimed");
  });

  it("carries ids, enums and an instant only: nothing about the patient", async () => {
    await takeReminderClaim(base);
    expect(Object.keys(insertedMetadata()).sort()).toEqual([
      "channel",
      "early",
      "offsetId",
      "source",
      "startsAt",
      "taker",
    ]);
  });

  it("records who took it", async () => {
    await takeReminderClaim({ ...base, taker: "sweep" });
    expect(insertedMetadata().taker).toBe("sweep");
  });

  it("bounds its own waits FIRST: a lock wait of two seconds and a statement of five, for this transaction only", async () => {
    await takeReminderClaim(base);
    const bounds = ran[0] as { sql: string; params: unknown[] };
    // `true` is transaction-local: the settings never reach the connection's next user.
    expect(bounds.sql).toBe(
      "select set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true)",
    );
    expect(bounds.params).toEqual(["2s", "5s"]);
    expect([CLAIM_LOCK_TIMEOUT, CLAIM_STATEMENT_TIMEOUT]).toEqual(["2s", "5s"]);
  });

  it("then takes the advisory lock, BEFORE the row, in the same transaction, keyed on tenant, appointment, offset and channel", async () => {
    await takeReminderClaim(base);
    // Bounds, lock, row. A lock taken before the bounds would wait unbounded.
    expect(ran.map((r) => r.kind)).toEqual(["execute", "execute", "insert"]);
    const lock = ran[1] as { sql: string; params: unknown[] };
    // The transaction-scoped variant, so it cannot outlive the claim.
    expect(lock.sql).toBe("select pg_advisory_xact_lock(hashtextextended($1, 0))");
    expect(lock.params).toEqual([`reminder-claim:${TENANT}:${APPOINTMENT}:24h:sms`]);
  });

  it("two reminders of one appointment do not share a lock, and two tenants never do", () => {
    const keys = new Set([
      reminderClaimLockPayload(TENANT, APPOINTMENT, "24h", "sms"),
      reminderClaimLockPayload(TENANT, APPOINTMENT, "48h", "email"),
      reminderClaimLockPayload(TENANT, APPOINTMENT, "24h", "email"),
      reminderClaimLockPayload("33333333-3333-3333-3333-333333333333", APPOINTMENT, "24h", "sms"),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe("the reminder claim: early", () => {
  it("the mark is the start minus the offset, and unknown for an offset this build does not have", () => {
    expect(reminderMark(START, "24h")?.toISOString()).toBe("2031-05-13T10:00:00.000Z");
    expect(reminderMark(START, "48h")?.toISOString()).toBe("2031-05-12T10:00:00.000Z");
    expect(reminderMark(START, "72h")).toBeNull();
  });

  it("exactly ten minutes before the mark is NOT early; one millisecond more is", () => {
    const edge = new Date(MARK_24H.getTime() - EARLY_CLAIM_MS);
    expect(EARLY_CLAIM_MS).toBe(600_000);
    expect(isEarlyClaim(START, "24h", edge)).toBe(false);
    expect(isEarlyClaim(START, "24h", new Date(edge.getTime() - 1))).toBe(true);
    // At the mark and after it: not early.
    expect(isEarlyClaim(START, "24h", MARK_24H)).toBe(false);
    expect(isEarlyClaim(START, "24h", new Date(MARK_24H.getTime() + 3_600_000))).toBe(false);
    // The same instant is early for one offset and not for the other.
    expect(isEarlyClaim(START, "48h", MARK_24H)).toBe(false);
    expect(isEarlyClaim(START, "24h", new Date("2031-05-12T10:00:00.000Z"))).toBe(true);
  });

  it("an offset with no mark is recorded as null, never guessed", async () => {
    expect(isEarlyClaim(START, "72h", MARK_24H)).toBeNull();
    await takeReminderClaim({ ...base, offsetId: "72h" });
    expect(insertedMetadata().early).toBeNull();
  });

  it("the row says early when the taker's clock is over ten minutes before the mark", async () => {
    await takeReminderClaim({ ...base, now: new Date(MARK_24H.getTime() - EARLY_CLAIM_MS - 1) });
    expect(insertedMetadata().early).toBe(true);
  });
});

/**
 * RECORD ONLY. The dispatcher awaits this and reads nothing from it, so the
 * two things it could do to a send are throw and return something to branch
 * on. Neither is possible.
 */
describe("the reminder claim: it can never stop a send", () => {
  it("returns undefined when the row lands", async () => {
    await expect(takeReminderClaim(base)).resolves.toBeUndefined();
  });

  // `lock` is also the shape of a WAIT that ran out: Postgres ends it with an
  // error at that statement. The wait itself is proven against a real lock in
  // reminder-log.db.test.ts.
  for (const where of ["context", "bounds", "lock", "insert"] as const) {
    it(`a failure at the ${where} is swallowed, logged with ids and the error's name only`, async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      failAt = where;
      await expect(takeReminderClaim(base)).resolves.toBeUndefined();
      expect(ran.filter((r) => r.kind === "insert")).toHaveLength(0);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("reminder claim write FAILED");
      expect(logged).toContain(`appointmentId=${APPOINTMENT}`);
      // The error NAME, never its message.
      expect(logged).not.toMatch(/db down|bounds refused|lock wait timed out|insert refused/);
      spy.mockRestore();
    });
  }

  it("a claim whose bounds could not be set takes NO lock: it never waits unbounded", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    failAt = "bounds";
    await takeReminderClaim(base);
    expect(ran).toHaveLength(0);
    spy.mockRestore();
  });

  it("a start that is not a date is swallowed too: the fixture shape, not a real row", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      takeReminderClaim({ ...base, startsAt: new Date("not a date") }),
    ).resolves.toBeUndefined();
    expect(ran).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("metadata the audit contract refuses is not written, and still does not throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A value with whitespace is prose to the contract (metadata-contract.ts).
    await expect(takeReminderClaim({ ...base, offsetId: "24 h" })).resolves.toBeUndefined();
    expect(ran).toHaveLength(0);
    expect(spy.mock.calls.flat().join(" ")).toContain("AuditMetadataError");
    spy.mockRestore();
  });
});
