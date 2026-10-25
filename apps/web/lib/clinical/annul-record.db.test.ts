/**
 * annul-record.db.test.ts: THE APPLICATION'S `annulRecord` AGAINST REAL ROWS,
 * UNDER THE INSERT POLICY OF record_annulments.
 *
 * packages/db/tests/record-annulments-insert-policy.db.test.ts holds the
 * table's own arms, statement by statement. This suite runs the application's
 * entry point as real principals and asserts what Anular rests on:
 *
 *   OWNER    the owner annuls a signed registo a therapist authored: one
 *            annulment naming the owner, one `clinical_record.annul` audit row,
 *            and the registo's own row unchanged;
 *   AUTHOR   a therapist annuls a signed registo they authored, the same;
 *            also when they no longer treat the patient;
 *   COLLEAGUE  a therapist of the patient annuls a signed registo a colleague
 *            authored, the same, once for each way of being the patient's
 *            therapist that therapistPatientScope (lib/patients/scope.ts)
 *            names: an appointment as first practitioner, as second
 *            practitioner, with the patient in the second slot, and having
 *            created the patient;
 *   NO TIE   a therapist who neither authored the registo nor treats or
 *            created its patient: `not_found`, before any INSERT;
 *   ROLES    an admin and a receptionist are refused by the capability, before
 *            any statement;
 *   TWICE    a second annulment of the same registo is refused
 *            (`already_annulled`), and a draft is refused (`not_signed`).
 *
 * EVERY ARM RUNS ON EITHER EXPRESSION of the policy, and asserts the same on
 * both: these are the callers annulRecord serves today, and the ruled
 * expression admits each of them. IT READS THE SCHEMA (annul-insert-state.ts)
 * to say in its title which expression it ran on. The migration is
 * packages/db/migrations/0107_record_annulments_insert_policy.sql, promoted
 * with no byte changed. A database whose policy is neither
 * expression THROWS and fails every arm, and from the promotion on the ruled
 * expression is the only one accepted.
 *
 * NO REGISTO OF THIS FILE IS EVER COMMITTED. A signed registo cannot be
 * deleted (clinical_records_enforce_immutability), so each arm writes its
 * registos and calls `annulRecord` inside ONE transaction that always rolls
 * back. WHAT IS STUBBED FOR THAT, AND IT IS NOT UNDER TEST: `runScoped`. The
 * real one opens a transaction of its own and commits it; the stub runs the
 * same two statements (`set local role authenticated`, then the JWT claims,
 * packages/db/src/client.ts withTenantContext) inside the arm's transaction,
 * so every policy runs as on production and nothing outlives the arm. `server-
 * only` and `next/cache` are stubbed because a vitest worker has no request
 * scope. Everything else is real: `annulRecord`, its scope read, its INSERT,
 * its audit row.
 *
 * THE FIXTURE IS BUILT, NEVER BORROWED: a tenant of its own, removed afterwards.
 * Runs in `.github/workflows/db-tests.yml` (it globs `.db.test.ts` in this
 * workspace) and self-skips without DATABASE_URL. Invented names only.
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

type Role = "owner" | "reception" | "therapist" | "admin";
type Ctx = { tenantId: string; role: Role; userId: string };
type Tx = { execute: (q: ReturnType<typeof raw>) => Promise<unknown> };

/** The arm's open transaction; `runScoped` below runs inside it. */
const open = vi.hoisted(() => ({ tx: null as unknown }));

vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  const { toClaims } = await import("@osteojp/auth");
  const { sql } = await import("drizzle-orm");
  return {
    ...actual,
    runScoped: async (ctx: Ctx, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = open.tx as Tx | null;
      if (!tx) throw new Error("no open transaction: runScoped was called outside an arm");
      // withTenantContext's two statements, in its order.
      await tx.execute(sql`set local role authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(toClaims(ctx))}, true)`);
      return fn(tx);
    },
  };
});

import { annulInsertState, type AnnulInsertState } from "./annul-insert-state";

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const state: AnnulInsertState = live
  ? await annulInsertState((await import("@osteojp/db")).getDbAdmin())
  : { applied: false, promoted: false, side: "no database" };
const SIDE = state.side;

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];

type Link = { code?: unknown; cause?: unknown };

/** The Postgres error code anywhere in the error's cause chain. */
function pgCode(e: unknown): string | null {
  for (let cur = e as Link | undefined; cur; cur = cur.cause as Link | undefined) {
    if (typeof cur.code === "string" && /^[0-9A-Z]{5}$/.test(cur.code)) return cur.code;
  }
  return null;
}

d(`Anular: the application's annulRecord under the record_annulments INSERT policy [${SIDE}]`, () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let records: typeof import("./records");

  const tenant = randomUUID();
  const loc = randomUUID();
  const owner = randomUUID();
  const admin = randomUUID();
  const reception = randomUUID();
  const author = randomUUID(); // authors the registos of P; has an appointment with P
  const colleague = randomUUID(); // has an appointment with P; authored none of them
  const second = randomUUID(); // the SECOND practitioner of an appointment with P
  const pair = randomUUID(); // has an appointment in which P is the SECOND patient
  const maker = randomUUID(); // created Q; has no appointment with anyone
  const untied = randomUUID(); // no appointment with anyone, created nobody
  const former = randomUUID(); // authors a registo of Z; no appointment with Z, did not create Z
  const p = randomUUID();
  const q = randomUUID(); // created by `maker`; nobody has an appointment with Q
  const z = randomUUID();

  const ctx = (userId: string, role: Role): Ctx => ({ tenantId: tenant, role, userId });

  /**
   * One arm: a transaction that always rolls back. `fn` writes its registos as
   * the connection's own role, then calls the application.
   */
  async function arm<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    let out: R | undefined;
    let done = false;
    await db
      .transaction(async (tx) => {
        open.tx = tx;
        try {
          out = await fn(tx as unknown as Tx);
          done = true;
        } finally {
          open.tx = null;
        }
        throw new Error("rollback");
      })
      .catch((e: Error) => {
        if (e.message !== "rollback") throw e;
      });
    if (!done) throw new Error("the arm did not finish");
    return out as R;
  }

  /** A registo written as the connection's own role, inside the arm. */
  async function registo(tx: Tx, patient: string, practitioner: string, status: "signed" | "draft"): Promise<string> {
    const id = randomUUID();
    await tx.execute(raw`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status)
      values (${id}::uuid, ${tenant}::uuid, ${patient}::uuid, ${practitioner}::uuid, ${status}::record_status)`);
    return id;
  }

  type Left = {
    annulments: number;
    by: string | null;
    in_tenant: string | null;
    reason: string | null;
    audits: number;
    actor: string | null;
    registo_md5: string;
  };

  /** What an annulment left, read as the connection's own role, still inside the arm. */
  async function left(tx: Tx, id: string): Promise<Left> {
    await tx.execute(raw`reset role`);
    const [r] = rowsOf(
      await tx.execute(raw`select
        (select count(*)::int from record_annulments where record_id = ${id}::uuid) as annulments,
        (select annulled_by_user_id::text from record_annulments where record_id = ${id}::uuid limit 1) as by,
        (select tenant_id::text from record_annulments where record_id = ${id}::uuid limit 1) as in_tenant,
        (select reason from record_annulments where record_id = ${id}::uuid limit 1) as reason,
        (select count(*)::int from audit_log
          where tenant_id = ${tenant}::uuid and action = 'clinical_record.annul' and entity_id = ${id}::uuid) as audits,
        (select actor_user_id::text from audit_log
          where tenant_id = ${tenant}::uuid and action = 'clinical_record.annul' and entity_id = ${id}::uuid limit 1) as actor,
        (select md5((c.*)::text) from clinical_records c where c.id = ${id}::uuid) as registo_md5`),
    );
    return r as Left;
  }

  const registoMd5 = async (tx: Tx, id: string) =>
    rowsOf(await tx.execute(raw`select md5((c.*)::text) as m from clinical_records c where c.id = ${id}::uuid`))[0]!.m;

  beforeAll(async () => {
    db = (await import("@osteojp/db")).getDbAdmin();
    records = await import("./records");

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenant}::uuid, 'Anular App', ${"anular-app-" + tenant.slice(0, 8)})`);
    await db.execute(raw`insert into locations (id, tenant_id, name) values (${loc}::uuid, ${tenant}::uuid, 'LV')`);
    for (const [id, label] of [
      [owner, "Dono"], [admin, "Admin"], [reception, "Rececao"],
      [author, "Terapeuta Autor"], [colleague, "Terapeuta Colega"], [former, "Terapeuta Anterior"],
      [second, "Terapeuta Segundo"], [pair, "Terapeuta de Par"], [maker, "Terapeuta que Registou"],
      [untied, "Terapeuta sem Ligacao"],
    ] as const) {
      await db.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable)
        values (${id}::uuid, ${tenant}::uuid, ${`anular-${id.slice(0, 8)}@example.test`}, ${label}, true, true)`);
    }
    await db.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${p}::uuid, ${tenant}::uuid, 'Paciente Anular P', ${loc}::uuid, ${reception}::uuid),
             (${z}::uuid, ${tenant}::uuid, 'Paciente Anular Z', ${loc}::uuid, ${reception}::uuid),
             (${q}::uuid, ${tenant}::uuid, 'Paciente Anular Q', ${loc}::uuid, ${maker}::uuid)`);
    await db.execute(raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${tenant}::uuid, ${p}::uuid, ${author}::uuid, ${loc}::uuid,
              '2026-09-02T10:00:00Z'::timestamptz, '2026-09-02T10:45:00Z'::timestamptz, 'completed'::appointment_status),
             (${tenant}::uuid, ${p}::uuid, ${colleague}::uuid, ${loc}::uuid,
              '2026-09-03T10:00:00Z'::timestamptz, '2026-09-03T10:45:00Z'::timestamptz, 'completed'::appointment_status)`);
    // The two other slots therapistPatientScope reads: the second practitioner
    // (the author holds the first), and the patient as the second of a pair (Z
    // holds the first slot, so `pair` is Z's therapist too). The owner has no
    // appointment with anyone.
    await db.execute(raw`insert into appointments (tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at, status)
      values (${tenant}::uuid, ${p}::uuid, ${author}::uuid, ${second}::uuid, ${loc}::uuid,
              '2026-09-04T10:00:00Z'::timestamptz, '2026-09-04T10:45:00Z'::timestamptz, 'completed'::appointment_status)`);
    await db.execute(raw`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id, starts_at, ends_at, status)
      values (${tenant}::uuid, ${z}::uuid, ${p}::uuid, ${pair}::uuid, ${loc}::uuid,
              '2026-09-05T10:00:00Z'::timestamptz, '2026-09-05T10:45:00Z'::timestamptz, 'completed'::appointment_status)`);
  }, 60_000);

  /** Every delete is attempted and the first failure re-raised. FK order. */
  afterAll(async () => {
    if (!db) return;
    const statements = [
      raw`delete from audit_log where tenant_id = ${tenant}::uuid`,
      raw`delete from record_annulments where tenant_id = ${tenant}::uuid`,
      raw`delete from clinical_records where tenant_id = ${tenant}::uuid`,
      raw`delete from appointments where tenant_id = ${tenant}::uuid`,
      raw`delete from patients where tenant_id = ${tenant}::uuid`,
      raw`delete from users where tenant_id = ${tenant}::uuid`,
      raw`delete from locations where tenant_id = ${tenant}::uuid`,
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

  it("PREMISE: who has an appointment with whom, in which slot, and who registered each patient", async () => {
    const [f] = rowsOf(await db.execute(raw`select
      (select count(*)::int from appointments where patient_id = ${p}::uuid and practitioner_id = ${author}::uuid
          and practitioner_2_id is null) as author_p,
      (select count(*)::int from appointments where patient_id = ${p}::uuid and practitioner_id = ${colleague}::uuid) as colleague_p,
      (select count(*)::int from appointments where patient_id = ${p}::uuid and practitioner_2_id = ${second}::uuid
          and practitioner_id <> ${second}::uuid) as second_p,
      (select count(*)::int from appointments where patient_2_id = ${p}::uuid and patient_id <> ${p}::uuid
          and practitioner_id = ${pair}::uuid) as pair_p,
      (select count(*)::int from appointments where tenant_id = ${tenant}::uuid
          and (${former}::uuid in (practitioner_id, practitioner_2_id) or ${maker}::uuid in (practitioner_id, practitioner_2_id)
               or ${untied}::uuid in (practitioner_id, practitioner_2_id) or ${owner}::uuid in (practitioner_id, practitioner_2_id))) as former_maker_untied_owner_appts,
      (select count(*)::int from appointments where patient_id = ${q}::uuid or patient_2_id = ${q}::uuid) as q_appts,
      (select count(*)::int from patients where tenant_id = ${tenant}::uuid and created_by = ${reception}::uuid) as by_reception,
      (select count(*)::int from patients where id = ${q}::uuid and created_by = ${maker}::uuid) as q_by_maker`));
    expect(f).toEqual({
      author_p: 1, colleague_p: 1, second_p: 1, pair_p: 1, former_maker_untied_owner_appts: 0, q_appts: 0, by_reception: 2, q_by_maker: 1,
    });
  });

  it("OWNER: the owner annuls a signed registo a therapist authored (both sides)", async () => {
    const out = await arm(async (tx) => {
      const id = await registo(tx, p, author, "signed");
      const before = await registoMd5(tx, id);
      await records.annulRecord(ctx(owner, "owner"), id, "  registo no paciente errado  ");
      return { before, ...(await left(tx, id)) };
    });
    expect(out).toMatchObject({ annulments: 1, by: owner, in_tenant: tenant, reason: "registo no paciente errado", audits: 1, actor: owner });
    expect(out.registo_md5).toBe(out.before);
  });

  it("AUTHOR: a therapist annuls a signed registo they authored, of a patient they treat (both sides)", async () => {
    const out = await arm(async (tx) => {
      const id = await registo(tx, p, author, "signed");
      const before = await registoMd5(tx, id);
      await records.annulRecord(ctx(author, "therapist"), id, null);
      return { before, ...(await left(tx, id)) };
    });
    expect(out).toMatchObject({ annulments: 1, by: author, in_tenant: tenant, reason: null, audits: 1, actor: author });
    expect(out.registo_md5).toBe(out.before);
  });

  it("AUTHOR: a therapist annuls a signed registo they authored, of a patient they no longer treat (both sides)", async () => {
    const out = await arm(async (tx) => {
      const id = await registo(tx, z, former, "signed");
      await records.annulRecord(ctx(former, "therapist"), id, null);
      return left(tx, id);
    });
    expect(out).toMatchObject({ annulments: 1, by: former, audits: 1, actor: former });
  });

  it("COLLEAGUE: a therapist of the patient annuls a signed registo a colleague authored, each way of being one (both sides)", async () => {
    for (const [label, who, patient] of [
      ["an appointment as first practitioner", colleague, p],
      ["an appointment as second practitioner", second, p],
      ["an appointment with the patient in the second slot", pair, p],
      ["created the patient", maker, q],
    ] as const) {
      const out = await arm(async (tx) => {
        const id = await registo(tx, patient, author, "signed");
        const before = await registoMd5(tx, id);
        await records.annulRecord(ctx(who, "therapist"), id, null);
        return { before, ...(await left(tx, id)) };
      });
      expect(out, label).toMatchObject({ annulments: 1, by: who, in_tenant: tenant, reason: null, audits: 1, actor: who });
      expect(out.registo_md5, label).toBe(out.before);
    }
  });

  it("NO TIE: a therapist who neither authored the registo nor treats or created its patient gets not_found, and nothing is written (both sides)", async () => {
    for (const [label, who, patient] of [
      ["no tie to anyone", untied, p],
      ["created another patient", maker, p],
      ["treats another patient", colleague, q],
    ] as const) {
      const out = await arm(async (tx) => {
        const id = await registo(tx, patient, author, "signed");
        const refusal = await records.annulRecord(ctx(who, "therapist"), id, null).catch((e: unknown) => e);
        return { refusal, ...(await left(tx, id)) };
      });
      expect(out.refusal, label).toMatchObject({ code: "not_found" });
      expect(pgCode(out.refusal), label).toBeNull();
      expect(out, label).toMatchObject({ annulments: 0, audits: 0 });
    }
  });

  it("ROLES: an admin and a receptionist are refused by the capability, before any statement (both sides)", async () => {
    for (const [user, role] of [[admin, "admin"], [reception, "reception"]] as const) {
      const out = await arm(async (tx) => {
        const id = await registo(tx, p, author, "signed");
        let refusal: unknown = null;
        try {
          await records.annulRecord(ctx(user, role), id, null);
        } catch (e) {
          refusal = e;
        }
        return { refusal, ...(await left(tx, id)) };
      });
      expect((out.refusal as Error | null)?.name, role).toBe("ForbiddenError");
      expect(pgCode(out.refusal), role).toBeNull();
      expect(out, role).toMatchObject({ annulments: 0, audits: 0 });
    }
  });

  it("TWICE: a second annulment is refused (already_annulled), and a draft is refused (not_signed) (both sides)", async () => {
    const out = await arm(async (tx) => {
      const id = await registo(tx, p, author, "signed");
      const draft = await registo(tx, p, author, "draft");
      await records.annulRecord(ctx(author, "therapist"), id, null);
      await tx.execute(raw`reset role`);
      const second = await records.annulRecord(ctx(owner, "owner"), id, null).catch((e: unknown) => e);
      await tx.execute(raw`reset role`);
      const onDraft = await records.annulRecord(ctx(author, "therapist"), draft, null).catch((e: unknown) => e);
      return { second, onDraft, ...(await left(tx, id)) };
    });
    expect(out.second).toMatchObject({ code: "already_annulled" });
    expect(out.onDraft).toMatchObject({ code: "not_signed" });
    expect(out).toMatchObject({ annulments: 1, audits: 1 });
  });

  it("nothing of any arm was committed: no registo, no annulment and no audit row of this tenant", async () => {
    const [r] = rowsOf(await db.execute(raw`select
      (select count(*)::int from clinical_records where tenant_id = ${tenant}::uuid) as registos,
      (select count(*)::int from record_annulments where tenant_id = ${tenant}::uuid) as annulments,
      (select count(*)::int from audit_log where tenant_id = ${tenant}::uuid) as audits`));
    expect(r).toEqual({ registos: 0, annulments: 0, audits: 0 });
  });
});
