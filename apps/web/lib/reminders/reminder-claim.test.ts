/**
 * reminder-claim.test.ts: the claim's contract, with the database replaced.
 *
 * What a real Postgres has to prove (the row lands under the job's own role,
 * the lock is taken, a second tenant cannot see it, and WHICH rows make a
 * reminder held) is in reminder-log.db.test.ts and reminder-claim.db.test.ts.
 * Pinned here is everything around it: the row's shape, the ten minute edge,
 * the order of the statements, and the property the send path leans on, that
 * taking a claim can never throw and answers "not held" whenever it fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("server-only", () => ({}));

/** Every statement the transaction ran, in order. */
const ran: (
  | { kind: "execute"; sql: string; params: unknown[] }
  | { kind: "read" }
  | { kind: "insert"; table: string; values: Record<string, unknown> }
)[] = [];
let failAt: "context" | "bounds" | "lock" | "read" | "insert" | null = null;
/** What the "is it held" read finds. A row means held. */
let heldRows: { id: string }[] = [];
/** The id Postgres gives the row the claim inserts. */
const CLAIM_ID = "44444444-4444-4444-4444-444444444444";

const dialect = new PgDialect();

/**
 * A query builder that goes nowhere. Every method answers the same object, so
 * the claim can build its read, sub-selects included, and only AWAITING it
 * does anything: that is the one statement Postgres would be sent.
 */
function selectChain(onAwait: () => Promise<unknown>): unknown {
  const chain: unknown = new Proxy(() => {}, {
    get: (_target, prop) => {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => onAwait().then(resolve, reject);
      }
      return () => chain;
    },
  });
  return chain;
}

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
      select: () =>
        selectChain(async () => {
          if (failAt === "read") throw new Error("read refused");
          ran.push({ kind: "read" });
          return heldRows;
        }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: (v: Record<string, unknown>) => {
          const write = async () => {
            if (failAt === "insert") throw new Error("insert refused");
            // The table by its database name: a claim must never land in `audit_log`.
            ran.push({ kind: "insert", table: getTableName(table), values: v });
            return [{ id: CLAIM_ID }];
          };
          // The claim asks for the new row's id; the release awaits the insert itself.
          return {
            returning: () => write(),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => write().then(resolve, reject),
          };
        },
      }),
    });
  },
  REMINDER_JOB_ROLE: "admin",
}));

const {
  BLOCKING_LEDGER_OUTCOMES,
  CLAIM_LOCK_TIMEOUT,
  CLAIM_STATEMENT_TIMEOUT,
  EARLY_CLAIM_MS,
  REMINDER_CLAIM_KIND,
  REMINDER_CLAIM_RELEASE_ACTION,
  isEarlyClaim,
  releaseReminderClaim,
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
  heldRows = [];
});

/** The one row the claim inserted. */
function insertedRow(): Record<string, unknown> {
  const inserts = ran.filter((r) => r.kind === "insert");
  expect(inserts).toHaveLength(1);
  return (inserts[0] as { values: Record<string, unknown> }).values;
}

describe("the reminder claim: the row", () => {
  it("is a row of kind claim in the sweep's own table: the appointment, the start and its mark as instants", async () => {
    await takeReminderClaim(base);
    const inserts = ran.filter((r) => r.kind === "insert");
    expect(inserts).toEqual([
      {
        kind: "insert",
        table: "reminder_claims",
        values: {
          tenantId: TENANT,
          appointmentId: APPOINTMENT,
          kind: "claim",
          offsetId: "24h",
          channel: "sms",
          startsAt: START,
          dueAt: MARK_24H,
          taker: "run",
          early: false,
        },
      },
    ]);
    expect(REMINDER_CLAIM_KIND).toBe("claim");
  });

  it("carries ids, enums and instants only: nothing about the patient, and nothing a release or a shadow row carries", async () => {
    await takeReminderClaim(base);
    expect(Object.keys(insertedRow()).sort()).toEqual([
      "appointmentId",
      "channel",
      "dueAt",
      "early",
      "kind",
      "offsetId",
      "startsAt",
      "taker",
      "tenantId",
    ]);
  });

  it("records who took it", async () => {
    await takeReminderClaim({ ...base, taker: "sweep" });
    expect(insertedRow().taker).toBe("sweep");
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

  it("then takes the advisory lock, BEFORE the read and the row, in the same transaction, keyed on tenant, appointment, offset and channel", async () => {
    await takeReminderClaim(base);
    // Bounds, lock, read, row. A lock taken before the bounds would wait
    // unbounded, and a read taken before the lock could be answered twice
    // before either taker had written.
    expect(ran.map((r) => r.kind)).toEqual(["execute", "execute", "read", "insert"]);
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

  it("an offset with no mark is recorded as null, never guessed: no due time and no early flag, together", async () => {
    expect(isEarlyClaim(START, "72h", MARK_24H)).toBeNull();
    await takeReminderClaim({ ...base, offsetId: "72h" });
    // The table holds the two to each other (reminder_claims_early_matches_kind).
    expect(insertedRow()).toMatchObject({ dueAt: null, early: null });
  });

  it("the row says early when the taker's clock is over ten minutes before the mark", async () => {
    await takeReminderClaim({ ...base, now: new Date(MARK_24H.getTime() - EARLY_CLAIM_MS - 1) });
    expect(insertedRow()).toMatchObject({ early: true, dueAt: MARK_24H });
  });
});

/**
 * WHAT TAKING A CLAIM ANSWERS. One answer stops a send, `held`, and it is
 * given only when the read found a row. Which rows the read finds is a
 * question for a real Postgres (reminder-claim.db.test.ts).
 */
describe("the reminder claim: held or not", () => {
  it("not held: the row is written and its id comes back, for the release a throw would owe it", async () => {
    await expect(takeReminderClaim(base)).resolves.toEqual({ held: false, claimId: CLAIM_ID });
    expect(ran.filter((r) => r.kind === "insert")).toHaveLength(1);
  });

  it("held: NO row is written, and there is no id to release", async () => {
    heldRows = [{ id: "55555555-5555-5555-5555-555555555555" }];
    await expect(takeReminderClaim(base)).resolves.toEqual({ held: true });
    expect(ran.map((r) => r.kind)).toEqual(["execute", "execute", "read"]);
  });

  it("an offset this build does not know is never held: it is not even asked, and its claim is still written", async () => {
    heldRows = [{ id: "55555555-5555-5555-5555-555555555555" }];
    await expect(takeReminderClaim({ ...base, offsetId: "72h" })).resolves.toEqual({ held: false, claimId: CLAIM_ID });
    expect(ran.map((r) => r.kind)).toEqual(["execute", "execute", "insert"]);
  });

  it("ONE outcome makes a claim block: sent. A suppression and a provider refusal do not", () => {
    // The whole list, to the word. The sweep's design names `suppressed` too;
    // adding it decides whether a suppression is final for its start, which
    // is held for a ruling (reminder-claim.ts), so this fails until somebody
    // rules it.
    expect([...BLOCKING_LEDGER_OUTCOMES]).toEqual(["sent"]);
  });
});

/**
 * IT FAILS OPEN. The dispatcher awaits the claim and stops only on `held`, so
 * the two things a broken claim could do to a send are throw and answer
 * `held`. Neither is possible: every failure answers "not held", with no id.
 */
describe("the reminder claim: it can never stop a send by failing", () => {
  // `lock` is also the shape of a WAIT that ran out: Postgres ends it with an
  // error at that statement. The wait itself is proven against a real lock in
  // reminder-log.db.test.ts.
  for (const where of ["context", "bounds", "lock", "read", "insert"] as const) {
    it(`a failure at the ${where} answers not held, and is logged with ids and the error's name only`, async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      failAt = where;
      // Even with a row there that would hold it: a trail that cannot be read
      // costs at most a repeat, never the message. (The insert is only
      // reached when the read found nothing, so that arm has no such row.)
      if (where !== "insert") heldRows = [{ id: "55555555-5555-5555-5555-555555555555" }];
      await expect(takeReminderClaim(base)).resolves.toEqual({ held: false, claimId: null });
      expect(ran.filter((r) => r.kind === "insert")).toHaveLength(0);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("reminder claim write FAILED");
      expect(logged).toContain(`appointmentId=${APPOINTMENT}`);
      // The error NAME, never its message.
      expect(logged).not.toMatch(/db down|bounds refused|lock wait timed out|read refused|insert refused/);
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

  it("a start that is not a date answers not held too: the fixture shape, not a real row", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      takeReminderClaim({ ...base, startsAt: new Date("not a date") }),
    ).resolves.toEqual({ held: false, claimId: null });
    expect(ran).toHaveLength(0);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

});

/**
 * THE RELEASE: the row a throw leaves behind, naming its claim. The dispatcher
 * awaits it between catching an error and throwing it on, so it must never
 * throw an error of its own in that error's place.
 */
describe("the reminder claim: the release", () => {
  const release = {
    tenantId: TENANT,
    appointmentId: APPOINTMENT,
    offsetId: "24h",
    channel: "sms" as const,
    claimId: CLAIM_ID,
  };

  it("is an audit row of its own that names its claim: the appointment as the entity, no actor, ids and enums only", async () => {
    await expect(releaseReminderClaim(release)).resolves.toBeUndefined();
    expect(ran.filter((r) => r.kind === "insert")).toEqual([
      {
        kind: "insert",
        table: "audit_log",
        values: {
          tenantId: TENANT,
          actorUserId: null,
          action: "appointment.reminder_claim_released",
          entityType: "appointment",
          entityId: APPOINTMENT,
          metadata: { source: "reminder-claim", claimId: CLAIM_ID, offsetId: "24h", channel: "sms" },
          ip: null,
        },
      },
    ]);
    expect(REMINDER_CLAIM_RELEASE_ACTION).toBe("appointment.reminder_claim_released");
  });

  it("bounds its waits, then queues on the reminder's own lock, then writes: it reads nothing", async () => {
    await releaseReminderClaim(release);
    expect(ran.map((r) => r.kind)).toEqual(["execute", "execute", "insert"]);
    expect((ran[0] as { params: unknown[] }).params).toEqual(["2s", "5s"]);
    expect((ran[1] as { params: unknown[] }).params).toEqual([`reminder-claim:${TENANT}:${APPOINTMENT}:24h:sms`]);
  });

  for (const where of ["context", "bounds", "lock", "insert"] as const) {
    it(`a failure at the ${where} is swallowed and logged: the error on its way out is never replaced`, async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      failAt = where;
      await expect(releaseReminderClaim(release)).resolves.toBeUndefined();
      expect(ran.filter((r) => r.kind === "insert")).toHaveLength(0);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("reminder claim release FAILED");
      expect(logged).toContain(`appointmentId=${APPOINTMENT}`);
      expect(logged).not.toMatch(/db down|bounds refused|lock wait timed out|insert refused/);
      spy.mockRestore();
    });
  }

  it("a claim id the audit contract refuses is not written, and still does not throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(releaseReminderClaim({ ...release, claimId: "not an id" })).resolves.toBeUndefined();
    expect(ran).toHaveLength(0);
    expect(spy.mock.calls.flat().join(" ")).toContain("AuditMetadataError");
    spy.mockRestore();
  });
});
