/**
 * deadlock-victim.db.test.ts: M-4. A REAL DEADLOCK, ON THE REAL DRIVER, IS THE
 * ERROR `isDeadlockVictim` RECOGNISES.
 *
 * The registo writers (`namingDeadlock`, records.ts) and the patient merge
 * (`mergePatients`, lib/patients/actions.ts) answer a write that Postgres rolls
 * back as a deadlock victim with a named refusal. They recognise it with
 * `isDeadlockVictim` (lib/observability/sql-state.ts), which reads the SQLSTATE
 * from the error and from its `cause`. The unit suites feed those callers an
 * error BUILT in that shape. This suite is the proof that the shape is the real
 * one: it makes Postgres detect a deadlock and reads what `runScoped`, the
 * transaction every one of those writers runs in, hands back.
 *
 * HOW THE DEADLOCK IS MADE. Two transactions, two rows, opposite order:
 *   1. the first locks row A, the second locks row B;
 *   2. the first asks for B and waits. The suite does not sleep and hope: it
 *      reads `pg_locks` until the first transaction's backend holds an
 *      ungranted lock request;
 *   3. only then does the second ask for A. Each now waits for the other, and
 *      Postgres rolls one of them back (after its `deadlock_timeout`, one
 *      second by default) with SQLSTATE 40P01. The other gets its lock and
 *      commits.
 * Which of the two is the victim is Postgres's choice and is not asserted.
 * Exactly one is. Each transaction carries a `lock_timeout`, so a choreography
 * that ever failed to form the cycle would fail this suite with another
 * SQLSTATE instead of hanging it.
 *
 * THE ROWS are two patients of a tenant this file creates. They are only
 * locked (`select ... for update`), never changed. It does not need the future
 * key between a registo and its episode: the error a victim gets is the same
 * whatever the two locks were.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only; every
 * row is this file's own and is removed by it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** A promise and the function that settles it, for one step of the choreography. */
function gate<T = void>() {
  let open!: (v: T) => void;
  const opened = new Promise<T>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

d("M-4: a real deadlock is the error isDeadlockVictim recognises", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let runScoped: typeof import("@/lib/auth/context").runScoped;
  let sqlState: typeof import("@/lib/observability/sql-state");

  const tenant = randomUUID();
  const owner = randomUUID();
  const rowA = randomUUID();
  const rowB = randomUUID();
  const ctx = { tenantId: tenant, role: "owner", userId: owner } as const;

  type Tx = Parameters<Parameters<typeof runScoped>[1]>[0];
  async function rows<T>(q: ReturnType<typeof raw>): Promise<T[]> {
    return (await db.execute(q)) as unknown as T[];
  }
  /** Take the row lock on one of the two patients, as the caller's own role. */
  async function lock(tx: Tx, id: string): Promise<number> {
    const got = (await tx.execute(raw`select id from patients where id = ${id}::uuid for update`)) as unknown as unknown[];
    return got.length;
  }
  /** Wait until the backend `pid` is itself waiting for a lock. Never a fixed sleep. */
  async function untilWaiting(pid: number): Promise<void> {
    for (let i = 0; i < 400; i += 1) {
      const [{ n }] = await rows<{ n: number }>(
        raw`select count(*)::int as n from pg_locks where pid = ${pid} and not granted`,
      );
      if (n > 0) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("the first transaction never began to wait for the second row");
  }
  const untouched = async () =>
    (
      await rows<{ patients: number; audits: number }>(
        raw`select (select count(*)::int from patients where tenant_id = ${tenant}::uuid and deleted_at is null) as patients,
                   (select count(*)::int from audit_log where tenant_id = ${tenant}::uuid) as audits`,
      )
    )[0]!;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ runScoped } = await import("@/lib/auth/context"));
    sqlState = await import("@/lib/observability/sql-state");

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'deadlock-victim', ${`deadlock-victim-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name)
          values (${owner}::uuid, ${tenant}::uuid, ${`owner-${owner.slice(0, 8)}@example.test`}, 'Zzz Owner Teste')`,
    );
    for (const [id, name] of [
      [rowA, "Zzz Impasse Teste A"],
      [rowB, "Zzz Impasse Teste B"],
    ] as const) {
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, created_by) values (${id}::uuid, ${tenant}::uuid, ${name}, ${owner}::uuid)`,
      );
    }
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from patient_locations where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from tenants where id = ${tenant}::uuid`,
    ];
    let first: unknown = null;
    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        first ??= err;
      }
    }
    if (first) throw first;
  });

  it("two transactions locking two rows in opposite order: ONE is rolled back, and its error carries 40P01 on the cause, not on the outer error", async () => {
    const before = await untouched();
    expect(before).toEqual({ patients: 2, audits: 0 });

    const firstHoldsA = gate<number>();
    const secondHoldsB = gate();
    const locked = { firstA: -1, secondB: -1 };

    // The first: A, then (once the second holds B) B. It waits there.
    const first = runScoped(ctx, async (tx) => {
      await tx.execute(raw`set local lock_timeout = '20s'`);
      const [{ pid }] = (await tx.execute(raw`select pg_backend_pid()::int as pid`)) as unknown as { pid: number }[];
      locked.firstA = await lock(tx, rowA);
      firstHoldsA.open(pid);
      await secondHoldsB.opened;
      await lock(tx, rowB);
      return "committed" as const;
    });
    // The second: B, then (once the first is really waiting for B) A.
    const second = runScoped(ctx, async (tx) => {
      await tx.execute(raw`set local lock_timeout = '20s'`);
      const firstPid = await firstHoldsA.opened;
      locked.secondB = await lock(tx, rowB);
      secondHoldsB.open();
      await untilWaiting(firstPid);
      await lock(tx, rowA);
      return "committed" as const;
    });
    // A transaction that failed before its step must not leave the other
    // hanging: each failure opens the gate the OTHER side waits on (the second
    // waits on firstHoldsA, the first on secondHoldsB). The side released that
    // way ends through untilWaiting's bound or its lock_timeout.
    first.catch(() => firstHoldsA.open(-1));
    second.catch(() => secondHoldsB.open());

    const outcomes = await Promise.allSettled([first, second]);

    // CONTROL: both row locks were really taken (one row each, as the caller's
    // own role), so what follows is a deadlock and not a statement that never ran.
    expect(locked).toEqual({ firstA: 1, secondB: 1 });

    const victims = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    const survivors = outcomes.filter((o): o is PromiseFulfilledResult<"committed"> => o.status === "fulfilled");
    expect(victims).toHaveLength(1);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.value).toBe("committed");

    // THE SHAPE. Drizzle's own error on the outside, with no SQLSTATE; the
    // driver's error at `.cause`, with 40P01.
    const failure = victims[0]!.reason as { code?: unknown; cause?: { code?: unknown } };
    expect(failure.code).toBeUndefined();
    expect(failure.cause?.code).toBe("40P01");

    // AND THE READER the writers use recognises exactly that.
    expect(sqlState.DEADLOCK_DETECTED).toBe("40P01");
    expect(sqlState.sqlStateOf(failure)).toBe("40P01");
    expect(sqlState.isDeadlockVictim(failure)).toBe(true);

    // Nothing was changed by either side, and no audit row was written.
    expect(await untouched()).toEqual(before);
  }, 60_000);

  it("CONTROL: another real failure in the same kind of transaction is NOT a deadlock victim", async () => {
    let failure: unknown = null;
    try {
      await runScoped(ctx, (tx) => tx.execute(raw`select 1 / (select count(*)::int from patients where id = ${randomUUID()}::uuid)`));
    } catch (e) {
      failure = e;
    }
    expect(failure).not.toBeNull();
    // The same wrapped shape, another SQLSTATE (22012, division by zero).
    expect((failure as { code?: unknown }).code).toBeUndefined();
    expect(((failure as { cause?: { code?: unknown } }).cause)?.code).toBe("22012");
    expect(sqlState.isDeadlockVictim(failure)).toBe(false);
  });
});
