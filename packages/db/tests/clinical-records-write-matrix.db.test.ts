/**
 * clinical-records-write-matrix.db.test.ts: 0097 (held), the clinical_records
 * write policies follow the permission matrix. A therapist edits and deletes
 * only their own unsigned registos, and files registos only in their own name
 * for a patient they treat or created. The review claim of an AI draft, which
 * arrives with no author, goes through public.claim_ai_draft_authorship(uuid).
 *
 * The migration is packages/db/migrations-pending/NEXT-AFTER-0096_clinical_
 * records_write_matrix.sql until it is promoted. So this file ASKS THE SCHEMA
 * WHICH SIDE IT IS ON and names it in each title. The arms 0097 adds run only
 * on a database that has it, and are skipped on one that does not; the arms
 * that hold on either side run on both. It never skips as a whole on a live
 * database:
 *   1. NEVER HALF. 0097 is one transaction: the function, and the three write
 *      policies in their ruled shape (UPDATE USING and DELETE USING: the
 *      author; INSERT WITH CHECK and UPDATE WITH CHECK: the author, for a
 *      patient they treat or created). All five, or none; anything else
 *      THROWS, and nothing here is measured.
 *   2. THE PROMOTION FLIPS IT. Once a .sql file in packages/db/migrations
 *      defines the function, a database WITHOUT 0097 THROWS: from the
 *      promotion commit on, the 0097 arms cannot be skipped.
 *
 * Every assertion runs through asRole("authenticated", ...) inside a
 * transaction that always rolls back (rls-harness.ts). The owner connection
 * seeds and cleans only.
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AppRole, asRole, claimsFor, connect, live } from "./rls-harness";

const FN = "claim_ai_draft_authorship";
const SEES = "clinical_therapist_sees_patient";

/** The promoted migration files that define 0097's function, if any. */
function promotedFiles(): string[] {
  const dir = join(__dirname, "..", "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(dir, f), "utf8").includes(FN));
}

/** Which side of 0097 this database is on. Throws on anything but a whole side. */
async function applied0097(): Promise<boolean> {
  if (!live) return false;
  const probe = connect();
  try {
    const [fn] = await probe<{ present: boolean }[]>`
      select to_regprocedure(${`public.${FN}(uuid)`}) is not null as present`;
    const rows = await probe<{ polname: string; qual: string | null; chk: string | null }[]>`
      select polname, pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as chk
        from pg_policy
       where polrelid = 'public.clinical_records'::regclass
         and polname in ('clinical_records_insert', 'clinical_records_update', 'clinical_records_delete')`;
    const by = new Map(rows.map((r) => [r.polname, r]));
    const ins = by.get("clinical_records_insert")?.chk;
    const updU = by.get("clinical_records_update")?.qual;
    const updC = by.get("clinical_records_update")?.chk;
    const del = by.get("clinical_records_delete")?.qual;
    if (!ins || !updU || !updC || !del) {
      throw new Error(
        "0097 STATE UNREADABLE: expected clinical_records_insert WITH CHECK, clinical_records_update USING and " +
          "WITH CHECK, and clinical_records_delete USING. Nothing here was measured.",
      );
    }
    const orSees = new RegExp(`\\bOR\\s+(public\\.)?${SEES}\\(`);
    const andSees = new RegExp(`\\bAND\\s+(public\\.)?${SEES}\\(`);
    const ruled = (expr: string) => andSees.test(expr) && !orSees.test(expr);
    const parts = [fn?.present === true, !updU.includes(SEES), ruled(updC), !del.includes(SEES), ruled(ins)];
    const n = parts.filter(Boolean).length;
    let applied: boolean;
    if (n === 5) applied = true;
    else if (n === 0) applied = false;
    else {
      throw new Error(
        `0097 IS HALF APPLIED: ${n} of 5 parts present (function, UPDATE USING, UPDATE WITH CHECK, DELETE USING, ` +
          "INSERT WITH CHECK). 0097 applies as one transaction, so this database was built some other way. " +
          "Nothing here was measured.",
      );
    }
    const promoted = promotedFiles();
    if (promoted.length > 0 && !applied) {
      throw new Error(
        `0097 IS PROMOTED (${promoted.join(", ")} defines ${FN}) BUT THIS DATABASE DOES NOT HAVE IT. ` +
          "From the promotion on, the pre-0097 answer is no longer acceptable. Nothing here was measured.",
      );
    }
    return applied;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

const w97 = await applied0097();
const SIDE = w97 ? "0097 APPLIED" : "0097 NOT APPLIED on this database (flips when 0097 is applied)";

const W = {
  tenant: randomUUID(),
  other: randomUUID(),
  t1: randomUUID(), // the author of the subject draft; treats P
  t2: randomUUID(), // a colleague who also treats P
  t3: randomUUID(), // treats neither; created Q
  owner: randomUUID(),
  admin: randomUUID(),
  reception: randomUUID(),
  loc: randomUUID(),
  p: randomUUID(),
  q: randomUUID(),
  draft: randomUUID(), // T1's unsigned registo of P
  ai: randomUUID(), // an unclaimed AI draft of P, no author
  aiInReview: randomUUID(), // an AI draft of P already in review, no author
  adminDraft: randomUUID(), // a draft of P recorded in the ADMIN's name (an imported shape)
  foreign: randomUUID(), // another tenant's registo
  foreignPatient: randomUUID(),
  z: randomUUID(), // a patient registered by reception with NO appointment at all
  lapsed: randomUUID(), // T1's draft of Z: T1 authored it, and neither treats nor created Z
};

const T0 = "2026-03-02T09:00:00Z";
const T1 = "2026-03-02T10:00:00Z";

async function seed(p: Sql): Promise<void> {
  await p`insert into tenants (id, name, slug) values
    (${W.tenant}, 'W97', ${`w97-${W.tenant}`}),
    (${W.other}, 'W97 other', ${`w97o-${W.other}`})`;
  await p`insert into users (id, tenant_id, email, full_name) values
    (${W.t1},        ${W.tenant}, ${`t1-${W.t1}@x.pt`},        'Terapeuta 1'),
    (${W.t2},        ${W.tenant}, ${`t2-${W.t2}@x.pt`},        'Terapeuta 2'),
    (${W.t3},        ${W.tenant}, ${`t3-${W.t3}@x.pt`},        'Terapeuta 3'),
    (${W.owner},     ${W.tenant}, ${`ow-${W.owner}@x.pt`},     'Owner'),
    (${W.admin},     ${W.tenant}, ${`ad-${W.admin}@x.pt`},     'Admin'),
    (${W.reception}, ${W.tenant}, ${`rc-${W.reception}@x.pt`}, 'Reception')`;
  await p`insert into locations (id, tenant_id, name) values (${W.loc}, ${W.tenant}, 'W97 loc')`;
  // P was registered by reception, so the receptionist "created" P: the claim
  // function's therapist role guard is the only thing between them and P's AI draft.
  await p`insert into patients (id, tenant_id, full_name, created_by) values (${W.p}, ${W.tenant}, 'Utente P', ${W.reception})`;
  await p`insert into patients (id, tenant_id, full_name, created_by) values (${W.q}, ${W.tenant}, 'Utente Q', ${W.t3})`;
  await p`insert into patients (id, tenant_id, full_name) values (${W.foreignPatient}, ${W.other}, 'Utente X')`;
  await p`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${W.tenant}, ${W.p}, ${W.t1}, ${W.loc}, ${T0}, ${T1}),
    (${W.tenant}, ${W.p}, ${W.t2}, ${W.loc}, ${T0}, ${T1})`;
  await p`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${W.draft}, ${W.tenant}, ${W.p}, ${W.t1}, 'draft')`;
  await p`insert into clinical_records (id, tenant_id, patient_id, source, status, ai_review_state, data) values
    (${W.ai},         ${W.tenant}, ${W.p}, 'ai_ingested', 'draft', 'pending_review', ${JSON.stringify({ _aiIngestionRaw: {} })}::jsonb),
    (${W.aiInReview}, ${W.tenant}, ${W.p}, 'ai_ingested', 'draft', 'in_review',      ${JSON.stringify({ _aiIngestionRaw: {} })}::jsonb)`;
  await p`insert into clinical_records (id, tenant_id, patient_id, status) values
    (${W.foreign}, ${W.other}, ${W.foreignPatient}, 'draft')`;
  await p`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${W.adminDraft}, ${W.tenant}, ${W.p}, ${W.admin}, 'draft')`;
  await p`insert into patients (id, tenant_id, full_name, created_by) values (${W.z}, ${W.tenant}, 'Utente Z', ${W.reception})`;
  await p`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${W.lapsed}, ${W.tenant}, ${W.z}, ${W.t1}, 'draft')`;
}

const asUser = <R>(role: AppRole, user: string, fn: (tx: TransactionSql) => Promise<R>, tenant = W.tenant) =>
  asRole(sql, "authenticated", claimsFor(tenant, role, user), fn);

let sql: Sql;

/** Rows an UPDATE of `id` touches as the caller (a no-op SET, so only the policy decides). */
const updates = (tx: TransactionSql, id: string) =>
  tx<{ id: string }[]>`update clinical_records set version = version where id = ${id} returning id`;
const deletes = (tx: TransactionSql, id: string) =>
  tx<{ id: string }[]>`delete from clinical_records where id = ${id} returning id`;
/**
 * Rows an INSERT files as the caller. NO RETURNING, deliberately: an INSERT ...
 * RETURNING must also pass the SELECT policy on the new row, so a refusal would
 * then say nothing about the INSERT policy (a receptionist, who reads no
 * registo, is refused by the read side alone). Plain, the INSERT policy decides.
 */
const fileFor = async (tx: TransactionSql, patient: string, practitioner: string): Promise<number> =>
  (
    await tx`insert into clinical_records (tenant_id, patient_id, practitioner_id, status)
             values (${W.tenant}, ${patient}, ${practitioner}, 'draft')`
  ).count;
const claim = async (tx: TransactionSql, id: string): Promise<boolean | null> => {
  const [row] = await tx.unsafe<{ assigned: boolean | null }[]>(`select public.${FN}($1::uuid) as assigned`, [id]);
  return row?.assigned ?? null;
};

/** The arms 0097 adds: run where 0097 is applied, skipped where it is not. */
const it97 = it.skipIf(!w97);

describe.skipIf(!live)(`0097: the clinical_records write policies follow the permission matrix [${SIDE}]`, () => {
  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });
  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id in (${W.tenant}, ${W.other})`;
    await sql.end();
  });

  it("PREMISE: T1 and T2 each have an appointment with P, T3 has none and created Q, the draft is T1's", async () => {
    const [f] = await sql<{ t1: number; t2: number; t3: number; q: string; author: string; ai: string | null }[]>`
      select (select count(*)::int from appointments where patient_id = ${W.p} and practitioner_id = ${W.t1}) as t1,
             (select count(*)::int from appointments where patient_id = ${W.p} and practitioner_id = ${W.t2}) as t2,
             (select count(*)::int from appointments where patient_id = ${W.p} and practitioner_id = ${W.t3}) as t3,
             (select created_by::text from patients where id = ${W.q}) as q,
             (select practitioner_id::text from clinical_records where id = ${W.draft}) as author,
             (select practitioner_id::text from clinical_records where id = ${W.ai}) as ai`;
    expect(f).toEqual({ t1: 1, t2: 1, t3: 0, q: W.t3, author: W.t1, ai: null });
  });

  /* ---- the author, on both sides --------------------------------------- */
  it("the AUTHOR updates and deletes their own draft (both sides)", async () => {
    expect((await asUser("therapist", W.t1, (tx) => updates(tx, W.draft))).length).toBe(1);
    expect((await asUser("therapist", W.t1, (tx) => deletes(tx, W.draft))).length).toBe(1);
  });

  it("the AUTHOR signs their own draft (both sides)", async () => {
    const signed = await asUser("therapist", W.t1, (tx) =>
      tx<{ status: string }[]>`update clinical_records set status = 'signed', signed_by = ${W.t1}, signed_at = now()
                               where id = ${W.draft} and status = 'draft' returning status`,
    );
    expect(signed.map((r) => r.status)).toEqual(["signed"]);
  });

  /* ---- a colleague ------------------------------------------------------ */
  it97(`${SIDE}: a colleague who treats the patient updates, signs and deletes NONE of another therapist's draft`, async () => {
    expect((await asUser("therapist", W.t2, (tx) => updates(tx, W.draft))).length).toBe(0);
    expect((await asUser("therapist", W.t2, (tx) => deletes(tx, W.draft))).length).toBe(0);
    const signed = await asUser("therapist", W.t2, (tx) =>
      tx<{ id: string }[]>`update clinical_records set status = 'signed', signed_by = ${W.t2}, signed_at = now()
                           where id = ${W.draft} and status = 'draft' returning id`,
    );
    expect(signed.length).toBe(0);
  });

  it("a therapist who treats neither reaches none of the draft (both sides)", async () => {
    expect((await asUser("therapist", W.t3, (tx) => updates(tx, W.draft))).length).toBe(0);
    expect((await asUser("therapist", W.t3, (tx) => deletes(tx, W.draft))).length).toBe(0);
  });

  it97(`${SIDE}: an UPDATE cannot hand the author's draft to a colleague (WITH CHECK)`, async () => {
    await expect(
      asUser("therapist", W.t1, (tx) =>
        tx<{ id: string }[]>`update clinical_records set practitioner_id = ${W.t2} where id = ${W.draft} returning id`,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it97(`${SIDE}: the new row of an author's UPDATE names only a patient they treat or created (WITH CHECK, W1's test)`, async () => {
    // T3 files in its own name for Q, which it created (admitted), and that
    // draft may then name only a patient T3 treats or created.
    await expect(
      asUser("therapist", W.t3, async (tx) => {
        expect(await fileFor(tx, W.q, W.t3)).toBe(1);
        return tx`update clinical_records set patient_id = ${W.p}
                   where tenant_id = ${W.tenant} and patient_id = ${W.q} and practitioner_id = ${W.t3}`;
      }),
    ).rejects.toThrow(/row-level security/i);
    // T1's own draft of P may not name Q, which T1 neither treats nor created.
    await expect(
      asUser("therapist", W.t1, (tx) => tx`update clinical_records set patient_id = ${W.q} where id = ${W.draft}`),
    ).rejects.toThrow(/row-level security/i);
  });

  it97(`${SIDE}: an author who neither treats nor created the patient deletes their draft but no longer saves it; the owner saves it`, async () => {
    await expect(asUser("therapist", W.t1, (tx) => updates(tx, W.lapsed))).rejects.toThrow(/row-level security/i);
    expect((await asUser("therapist", W.t1, (tx) => deletes(tx, W.lapsed))).length).toBe(1);
    expect((await asUser("owner", W.owner, (tx) => updates(tx, W.lapsed))).length).toBe(1);
  });

  /* ---- filing: INSERT -------------------------------------------------- */
  it("a therapist files in their OWN name for a patient they treat, and one they created (both sides)", async () => {
    expect(await asUser("therapist", W.t2, (tx) => fileFor(tx, W.p, W.t2))).toBe(1);
    expect(await asUser("therapist", W.t3, (tx) => fileFor(tx, W.q, W.t3))).toBe(1);
  });

  it97(`${SIDE}: a therapist files NOTHING for a patient they neither treat nor created, even in their own name`, async () => {
    await expect(asUser("therapist", W.t3, (tx) => fileFor(tx, W.p, W.t3))).rejects.toThrow(/row-level security/i);
  });

  it97(`${SIDE}: a therapist files NOTHING in a colleague's name, even for a patient they treat`, async () => {
    await expect(asUser("therapist", W.t1, (tx) => fileFor(tx, W.p, W.t2))).rejects.toThrow(/row-level security/i);
  });

  it("an addendum: a colleague who treats the patient files a new version of the author's SIGNED registo in their own name (both sides)", async () => {
    const out = await asUser("therapist", W.t1, async (tx) => {
      const [signed] = await tx<{ id: string }[]>`
        insert into clinical_records (tenant_id, patient_id, practitioner_id, status, signed_by, signed_at)
        values (${W.tenant}, ${W.p}, ${W.t1}, 'signed', ${W.t1}, now()) returning id`;
      await tx`select set_config('request.jwt.claims', ${claimsFor(W.tenant, "therapist", W.t2)}, true)`;
      return tx<{ id: string }[]>`
        insert into clinical_records (tenant_id, patient_id, practitioner_id, status, version, supersedes_id)
        values (${W.tenant}, ${W.p}, ${W.t2}, 'draft', 2, ${signed!.id}) returning id`;
    });
    expect(out.length).toBe(1);
  });

  it("the immutability trigger still refuses the AUTHOR on a signed registo (both sides)", async () => {
    await expect(
      asUser("therapist", W.t1, async (tx) => {
        const [signed] = await tx<{ id: string }[]>`
          insert into clinical_records (tenant_id, patient_id, practitioner_id, status, signed_by, signed_at)
          values (${W.tenant}, ${W.p}, ${W.t1}, 'signed', ${W.t1}, now()) returning id`;
        return tx`update clinical_records set data = ${JSON.stringify({ x: 1 })}::jsonb where id = ${signed!.id}`;
      }),
    ).rejects.toThrow(/immutable/i);
  });

  /* ---- the AI review claim (0097's function) --------------------------- */
  it97(`${SIDE}: an unclaimed AI draft is updated directly by NO therapist; the claim function makes a treating therapist its author, and the claim follows`, async () => {
      expect((await asUser("therapist", W.t2, (tx) => updates(tx, W.ai))).length).toBe(0);
      const out = await asUser("therapist", W.t2, async (tx) => {
        const assigned = await claim(tx, W.ai);
        const claimed = await tx<{ id: string }[]>`
          update clinical_records set ai_review_state = 'in_review'
           where id = ${W.ai} and status = 'draft' and ai_review_state = 'pending_review' returning id`;
        const edited = await tx<{ id: string }[]>`
          update clinical_records set data = data || ${JSON.stringify({ observations: "revisto" })}::jsonb
           where id = ${W.ai} and status = 'draft' returning id`;
        const finalized = await tx<{ status: string; ai_review_state: string; practitioner_id: string }[]>`
          update clinical_records
             set status = 'signed', signed_by = ${W.t2}, signed_at = now(), ai_review_state = 'approved'
           where id = ${W.ai} and status = 'draft' and ai_review_state = 'in_review'
          returning status, ai_review_state, practitioner_id::text as practitioner_id`;
        return { assigned, claimed: claimed.length, edited: edited.length, finalized };
      });
      expect(out).toEqual({
        assigned: true,
        claimed: 1,
        edited: 1,
        finalized: [{ status: "signed", ai_review_state: "approved", practitioner_id: W.t2 }],
      });
    });

  it97(`${SIDE}: the claim function never replaces an author, and a second claimer is then refused`, async () => {
      const out = await asUser("therapist", W.t2, async (tx) => {
        const first = await claim(tx, W.ai);
        const again = await claim(tx, W.ai);
        await tx`select set_config('request.jwt.claims', ${claimsFor(W.tenant, "therapist", W.t1)}, true)`;
        const other = await claim(tx, W.ai);
        const otherUpdate = await updates(tx, W.ai);
        const [row] = await tx<{ practitioner_id: string }[]>`
          select practitioner_id::text as practitioner_id from clinical_records where id = ${W.ai}`;
        return { first, again, other, otherUpdate: otherUpdate.length, author: row?.practitioner_id };
      });
      expect(out).toEqual({ first: true, again: false, other: false, otherUpdate: 0, author: W.t2 });
    });

  it97(`${SIDE}: the claim function assigns nothing to a therapist who does not treat the patient, to the owner, to an admin, to the receptionist who registered the patient, on a non-AI draft, or on an AI draft already in review`, async () => {
      const t3 = await asUser("therapist", W.t3, async (tx) => ({ assigned: await claim(tx, W.ai), updated: (await updates(tx, W.ai)).length }));
      expect(t3).toEqual({ assigned: false, updated: 0 });
      const owner = await asUser("owner", W.owner, async (tx) => ({ assigned: await claim(tx, W.ai), updated: (await updates(tx, W.ai)).length }));
      // The owner needs no claim: the owner arm admits every registo, unchanged.
      expect(owner).toEqual({ assigned: false, updated: 1 });
      expect(await asUser("admin", W.admin, (tx) => claim(tx, W.ai))).toBe(false);
      expect(await asUser("reception", W.reception, (tx) => claim(tx, W.ai))).toBe(false);
      expect(await asUser("therapist", W.t2, (tx) => claim(tx, W.draft))).toBe(false);
      expect(await asUser("therapist", W.t2, (tx) => claim(tx, W.aiInReview))).toBe(false);
      expect(await asUser("therapist", W.t2, (tx) => claim(tx, W.foreign))).toBe(false);
      const [author] = await sql<{ n: number }[]>`
        select count(*)::int as n from clinical_records where id in (${W.ai}, ${W.aiInReview}) and practitioner_id is not null`;
      expect(author!.n).toBe(0);
    });

  it97(`${SIDE}: EXECUTE on the claim function is authenticated's alone (read from the catalogue, never by calling it as a role that lacks it)`, async () => {
      const [g] = await sql<{ authenticated: boolean; anon: boolean; service_role: boolean; patient: boolean }[]>`
        select has_function_privilege('authenticated', ${`public.${FN}(uuid)`}, 'EXECUTE') as authenticated,
               has_function_privilege('anon', ${`public.${FN}(uuid)`}, 'EXECUTE') as anon,
               has_function_privilege('service_role', ${`public.${FN}(uuid)`}, 'EXECUTE') as service_role,
               has_function_privilege('patient', ${`public.${FN}(uuid)`}, 'EXECUTE') as patient`;
      expect(g).toEqual({ authenticated: true, anon: false, service_role: false, patient: false });
    });

  /* ---- the arms 0097 must not move ------------------------------------- */
  it("the OWNER updates and deletes any draft of the tenant (both sides)", async () => {
    expect((await asUser("owner", W.owner, (tx) => updates(tx, W.draft))).length).toBe(1);
    expect((await asUser("owner", W.owner, (tx) => deletes(tx, W.draft))).length).toBe(1);
    expect(await asUser("owner", W.owner, (tx) => fileFor(tx, W.q, W.owner))).toBe(1);
  });

  it("an ADMIN and a RECEPTIONIST write nothing, not even a draft recorded in the admin's own name (both sides)", async () => {
    for (const [role, user] of [["admin", W.admin], ["reception", W.reception]] as const) {
      expect((await asUser(role, user, (tx) => updates(tx, W.draft))).length).toBe(0);
      expect((await asUser(role, user, (tx) => deletes(tx, W.draft))).length).toBe(0);
      await expect(asUser(role, user, (tx) => fileFor(tx, W.p, user))).rejects.toThrow(/row-level security/i);
    }
    expect((await asUser("admin", W.admin, (tx) => updates(tx, W.adminDraft))).length).toBe(0);
    expect((await asUser("admin", W.admin, (tx) => deletes(tx, W.adminDraft))).length).toBe(0);
  });

  it("the author reaches nothing of another tenant (both sides)", async () => {
    expect((await asUser("therapist", W.t1, (tx) => updates(tx, W.foreign))).length).toBe(0);
    expect((await asUser("therapist", W.t1, (tx) => deletes(tx, W.foreign))).length).toBe(0);
  });

  it("reads are unchanged: T1 and T2 read the draft, T3 does not (both sides)", async () => {
    const seen = async (user: string) =>
      (await asUser("therapist", user, (tx) => tx<{ id: string }[]>`select id from clinical_records where id = ${W.draft}`)).length;
    expect([await seen(W.t1), await seen(W.t2), await seen(W.t3)]).toEqual([1, 1, 0]);
  });
});
