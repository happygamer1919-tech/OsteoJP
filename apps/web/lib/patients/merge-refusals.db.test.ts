/**
 * merge-refusals.db.test.ts: THE MERGE ACTION NAMES THE REFUSALS ITS DATABASE
 * FUNCTION RAISES, against the real function and the real driver.
 *
 * `mergePatients` (actions.ts) calls `public.merge_patients` and answers two of
 * its refusals by SQLSTATE: P0002 (a patient that is not a live member of the
 * caller's tenant) is the form's `not_found`, and 23514 (source and target are
 * one patient) is `InvalidMergeError`. Both are read from the error the driver
 * raises, and that error reaches the action WRAPPED: Drizzle raises its own
 * `Failed query` error and hangs the driver's error, which carries the
 * SQLSTATE, off `.cause`. The first arm pins that shape, so the mapping is
 * tested against what really arrives and not against a mock of it. A refusal
 * the action answers also has to LEAVE the transaction by a throw: the driver
 * raises a failed statement's error again when the transaction's callback
 * returns normally after one, and the `not_found` arm is what holds that.
 *
 * THE ARMS:
 *   - the shape: the outer error carries no SQLSTATE, its cause carries P0002;
 *   - a well-formed id that names nobody, as the survivor and as the loser, is
 *     `not_found`, and nothing moves and no audit row is written;
 *   - one patient named twice in different letter case passes the form's own
 *     comparison (it compares text) and is refused by the function: the action
 *     raises `InvalidMergeError`, and nothing moves;
 *   - CONTROL: two live patients merge, so the refusals above are refusals and
 *     not a call that never reached the function.
 *
 * WHAT IS STUBBED, AND NEITHER IS UNDER TEST: `requireRequestContext`, because a
 * vitest worker has no Supabase session, and `next/cache`, which needs a request
 * scope. `runScoped`, `assertCan`, the function and its audit row are real.
 *
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only; every
 * row is this file's own and is removed by it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

const acting = vi.hoisted(() => ({
  ctx: null as { tenantId: string; role: string; userId: string } | null,
}));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return {
    ...actual,
    requireRequestContext: async () => {
      if (!acting.ctx) throw new Error("no acting principal - use asOwner()");
      return acting.ctx;
    },
  };
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("the merge action names the refusals of merge_patients", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let mergePatients: typeof import("./actions").mergePatients;
  let runScoped: typeof import("@/lib/auth/context").runScoped;

  const tenant = randomUUID();
  const owner = randomUUID();
  const loser = randomUUID();
  const survivor = randomUUID();
  const kept = randomUUID(); // never merged: the subject of every refusal arm

  async function asOwner<T>(fn: () => Promise<T>): Promise<T> {
    acting.ctx = { tenantId: tenant, role: "owner", userId: owner };
    try {
      return await fn();
    } finally {
      acting.ctx = null;
    }
  }
  async function rows<T>(q: ReturnType<typeof raw>): Promise<T[]> {
    return (await db.execute(q)) as unknown as T[];
  }
  /** What a refused merge must leave as it was: every patient live and unmerged, no audit row. */
  const untouched = async () =>
    (
      await rows<{ live: number; audits: number }>(
        raw`select (select count(*)::int from patients
                     where tenant_id = ${tenant}::uuid and deleted_at is null and merged_into_id is null) as live,
                   (select count(*)::int from audit_log where tenant_id = ${tenant}::uuid) as audits`,
      )
    )[0]!;

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ mergePatients } = await import("./actions"));
    ({ runScoped } = await import("@/lib/auth/context"));

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'merge-refusals', ${`merge-refusals-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      raw`insert into users (id, tenant_id, email, full_name)
          values (${owner}::uuid, ${tenant}::uuid, ${`owner-${owner.slice(0, 8)}@example.test`}, 'Zzz Owner Teste')`,
    );
    for (const [id, name] of [
      [loser, "Zzz Fusao Teste A"],
      [survivor, "Zzz Fusao Teste B"],
      [kept, "Zzz Fusao Teste C"],
    ] as const) {
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, created_by) values (${id}::uuid, ${tenant}::uuid, ${name}, ${owner}::uuid)`,
      );
    }
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. */
  afterAll(async () => {
    if (!db) return;
    acting.ctx = null;
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

  it("THE SHAPE: the function's refusal arrives wrapped, the SQLSTATE on the cause and not on the outer error", async () => {
    const nobody = randomUUID();
    let failure: unknown = null;
    try {
      await runScoped({ tenantId: tenant, role: "owner", userId: owner }, (tx) =>
        tx.execute(raw`select public.merge_patients(${kept}::uuid, ${nobody}::uuid, ${owner}::uuid)`),
      );
    } catch (e) {
      failure = e;
    }
    expect(failure).not.toBeNull();
    expect((failure as { code?: unknown }).code).toBeUndefined();
    expect(((failure as { cause?: unknown }).cause as { code?: unknown } | undefined)?.code).toBe("P0002");
  });

  it("a well-formed id that names nobody is `not_found`, as the survivor and as the loser; nothing moves, no audit row", async () => {
    const before = await untouched();
    expect(before).toEqual({ live: 3, audits: 0 });
    expect(await asOwner(() => mergePatients({ survivorId: randomUUID(), loserId: kept }))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await asOwner(() => mergePatients({ survivorId: kept, loserId: randomUUID() }))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await untouched()).toEqual(before);
  });

  it("one patient named twice in different letter case is refused by the function: InvalidMergeError, nothing moves", async () => {
    const upper = kept.toUpperCase();
    expect(upper).not.toBe(kept);
    const before = await untouched();
    await expect(asOwner(() => mergePatients({ survivorId: upper, loserId: kept }))).rejects.toMatchObject({
      name: "InvalidMergeError",
    });
    expect(await untouched()).toEqual(before);
  });

  it("CONTROL: two live patients merge; the loser is marked merged into the survivor and one audit row is written", async () => {
    const out = await asOwner(() => mergePatients({ survivorId: survivor, loserId: loser }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.patient.id).toBe(survivor);
    const [row] = await rows<{ merged_into_id: string; deleted: boolean }>(
      raw`select merged_into_id::text, deleted_at is not null as deleted from patients where id = ${loser}::uuid`,
    );
    expect(row).toEqual({ merged_into_id: survivor, deleted: true });
    const audit = await rows<{ action: string; entity_id: string }>(
      raw`select action, entity_id::text from audit_log where tenant_id = ${tenant}::uuid`,
    );
    expect(audit).toEqual([{ action: "patient.merge", entity_id: loser }]);
  });
});
