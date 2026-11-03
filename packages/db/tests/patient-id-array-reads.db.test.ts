/**
 * patient-id-array-reads.db.test.ts: the gate the pending migration
 * NEXT-AFTER-0112_patient_id_array_reads.sql (0113 at promotion) ships behind.
 *
 * ==========================================================================
 * WHAT IS BEING PROVEN
 * ==========================================================================
 * The migration rewrites, in five read policies and one function, every
 *     x = ANY (coalesce((SELECT public.f()), '{}'::uuid[]))
 * as
 *     x IN (SELECT unnest((SELECT public.f())))
 * for speed (a hashed lookup instead of a linear search per row). The only
 * thing that makes that safe is that THE ROWS DO NOT MOVE, for anybody. So each
 * policy is asserted as an EQUALITY between its expression before (OLD, the
 * text its last migration wrote) and after (NEW, the text of the pending file),
 * evaluated over every row of its table, for every principal class, in both
 * directions: `loosened` (rows NEW admits and OLD does not, the permissive
 * error) and `tightened` (rows OLD admits and NEW does not). Both must be zero.
 * This is the method of appointments-rls-equivalence.db.test.ts (0078),
 * including its lesson: the comparison runs on the migration role, which
 * bypasses RLS, with the principal's claims set, so the scan is not filtered by
 * the policy under test. `row_security_active` is asserted false in the same
 * statement as the scan.
 *
 * ==========================================================================
 * THE INSTALLED SIDE, AND THE FILE
 * ==========================================================================
 * The file asks the database which side it is on and names it in the title:
 * each of the five policies' expressions and the function's body is read from
 * the catalogue and must hash to the OLD text or to the NEW one, all six on the
 * same side (the migration is one transaction). The INSTALLED expression is
 * then compared with OLD as well, so on a database where the pending file is
 * applied (a rehearsal, and production after the sitting) the file's own text
 * is what is proven equal. On CI's database the file is not applied, and the
 * NEW constants below are tied to it by an exact compare: each must appear in
 * the pending (or promoted) file, whitespace collapsed.
 *
 * ==========================================================================
 * COVERAGE, AND THE POSITIVE CONTROLS (SR-60)
 * ==========================================================================
 * The fixture gives every rewritten term at least one row on which it DECIDES
 * the answer: a patient seen only through the visible set (appointment at the
 * clinic, primary clinic), only as treated (first and second participant,
 * first and second practitioner), only through the care team at the
 * therapist's clinic (by appointment, by primary clinic as the fallback), and
 * rows the creator and owner arms admit beside them. For each term a control
 * replaces it with `false` in NEW and asserts the comparison goes RED
 * (tightened > 0, with the exact count), and one control per policy replaces a
 * term with `true` and asserts loosened > 0. Those controls are what prove the
 * equalities above can fail at all.
 *
 * The principals: owner; admin with clinic 1; admin with no clinic; reception
 * with clinic 1, with clinic 2, with both; therapist at clinic 1; therapist at
 * clinic 2; and the reminder jobs' principal (admin with NO user id,
 * apps/web/lib/reminders/context.ts).
 *
 * A shared-database test may only assert over rows it owns: every count below
 * is over this file's own two tenants (random ids), and the whole-table
 * disagreement counts cannot be moved by a sibling's rows, because the tenant
 * guard is the same text on both sides.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Rollback, claimsFor, connect, live } from "./rls-harness";

/* ======================================================================== */
/* THE EXPRESSIONS                                                          */
/* ======================================================================== */

type PolicySpec = {
  name: string;
  table: string;
  old: string;
  new: string;
  oldMd5: string;
  newMd5: string;
};

/** 0096 R1. */
const PATIENTS_OLD = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
          OR id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )`;
const PATIENTS_NEW = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      created_by = (select auth.uid())
      OR (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) IN ('admin', 'reception')
        AND (
          NOT (select public.viewer_has_location_assignment())
          OR id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))
        )
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
          OR id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )`;

/** 0096 R2. */
const RECORDS_OLD = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
          OR patient_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )`;
const RECORDS_NEW = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          practitioner_id = (select auth.uid())
          OR public.clinical_therapist_sees_patient(patient_id)
          OR patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )`;

/** 0104 E1. */
const EPISODES_OLD = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'reception'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          public.clinical_therapist_sees_patient(patient_id)
          OR patient_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids_at_my_clinics() ), '{}'::uuid[]))
        )
      )
    )`;
const EPISODES_NEW = `
    tenant_id = (select public.jwt_tenant_id())
    AND (
      (select public.jwt_role()) = 'owner'
      OR (
        (select public.jwt_role()) = 'admin'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'reception'
        AND public.clinical_admin_sees_patient(patient_id)
      )
      OR (
        (select public.jwt_role()) = 'therapist'
        AND (
          public.clinical_therapist_sees_patient(patient_id)
          OR patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
        )
      )
    )`;

/** 0092. */
const HISTORY_OLD = `
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])))
    AND (
      (patient_id   = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_care_team_patient_ids() ), '{}'::uuid[])))
      OR (patient_id   = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
      OR (patient_2_id = ANY (coalesce(( SELECT public.viewer_treated_patient_ids() ), '{}'::uuid[])))
    )`;
const HISTORY_NEW = `
    (tenant_id = ( SELECT public.jwt_tenant_id() ))
    AND (( SELECT public.jwt_role() ) = 'therapist'::text)
    AND (location_id = ANY (coalesce(( SELECT public.viewer_location_ids() ), '{}'::uuid[])))
    AND (
      (patient_id      IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))
      OR (patient_2_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))
      OR (patient_id   IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))
      OR (patient_2_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))
    )`;

/** 0102. */
const SENDS_OLD = `
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (
      (SELECT public.jwt_role()) = 'owner'
      OR (
        (SELECT public.jwt_role()) IN ('admin', 'reception')
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
      OR (
        (SELECT public.jwt_role()) = 'therapist'
        AND patient_id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
      )
    )`;
const SENDS_NEW = `
    tenant_id = (SELECT public.jwt_tenant_id())
    AND (
      (SELECT public.jwt_role()) = 'owner'
      OR (
        (SELECT public.jwt_role()) IN ('admin', 'reception')
        AND location_id = ANY (coalesce((SELECT public.viewer_location_ids()), '{}'::uuid[]))
      )
      OR (
        (SELECT public.jwt_role()) = 'therapist'
        AND patient_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
      )
    )`;

/**
 * md5(pg_get_expr(polqual, polrelid)) with search_path = public, before and
 * after the file. The OLD patients_select value is the one
 * pack-instance-consuming-sessions.db.test.ts pins for 0096.
 */
const POLICIES: PolicySpec[] = [
  { name: "patients_select", table: "patients", old: PATIENTS_OLD, new: PATIENTS_NEW,
    oldMd5: "de612f10145303302884747fa10b6c66", newMd5: "f029fc6cf0e8372c39d13700bffbc3c7" },
  { name: "clinical_records_select", table: "clinical_records", old: RECORDS_OLD, new: RECORDS_NEW,
    oldMd5: "976ba6f105c2bc373f0ec3c4a2ffb342", newMd5: "77a4446f4689ec7b8804b0f2562fc4a0" },
  { name: "clinical_episodes_select", table: "clinical_episodes", old: EPISODES_OLD, new: EPISODES_NEW,
    oldMd5: "e56c6afdcd453e172d556efe502f338f", newMd5: "54427a3cb61d6ee22387643604cbf74e" },
  { name: "appointments_care_team_patient_history_select", table: "appointments", old: HISTORY_OLD, new: HISTORY_NEW,
    oldMd5: "155e57e4d6759878d8f7f468cee48dfa", newMd5: "f8cac160f5b41d17583cec8d81141d3d" },
  { name: "appointment_survey_sends_select", table: "appointment_survey_sends", old: SENDS_OLD, new: SENDS_NEW,
    oldMd5: "8383259e1cfa78fa7fed99fcd195e1bf", newMd5: "bd11707e7fbe5dc047b85e066cfe468b" },
];

/** The pack function's patient term (0108), before and after. Its other terms do not change. */
const PACK_OLD = `
           p.created_by = (SELECT auth.uid())
        OR (SELECT public.jwt_role()) = 'owner'
        OR (
             (SELECT public.jwt_role()) IN ('admin', 'reception')
             AND (
                   NOT (SELECT public.viewer_has_location_assignment())
                OR p.id = ANY (coalesce((SELECT public.viewer_visible_patient_ids()), '{}'::uuid[]))
             )
           )
        OR (
             (SELECT public.jwt_role()) = 'therapist'
             AND (
                   p.id = ANY (coalesce((SELECT public.viewer_treated_patient_ids()), '{}'::uuid[]))
                OR p.id = ANY (coalesce((SELECT public.viewer_care_team_patient_ids_at_my_clinics()), '{}'::uuid[]))
             )
           )`;
const PACK_NEW = `
           p.created_by = (SELECT auth.uid())
        OR (SELECT public.jwt_role()) = 'owner'
        OR (
             (SELECT public.jwt_role()) IN ('admin', 'reception')
             AND (
                   NOT (SELECT public.viewer_has_location_assignment())
                OR p.id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))
             )
           )
        OR (
             (SELECT public.jwt_role()) = 'therapist'
             AND (
                   p.id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))
                OR p.id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))
             )
           )`;
/** The rest of the function's WHERE (0108), the same on both sides. */
const PACK_COMMON = `
         i.tenant_id = (SELECT public.jwt_tenant_id())
     AND (SELECT public.jwt_role()) IN ('owner', 'admin', 'reception', 'therapist')
     AND a.status <> 'cancelled'`;
/** md5(prosrc) of public.pack_instance_consuming_sessions(uuid), before (0108) and after. */
const PACK_OLD_MD5 = "1f45d0f0b99392c7de28f6bbea8ae45f";
const PACK_NEW_MD5 = "4de17a2e5cae73d0cedd6b3d35d5e326";

/* ======================================================================== */
/* THE FILE                                                                 */
/* ======================================================================== */

const SLUG = "_patient_id_array_reads.sql";

/** The pending file, or the promoted one: exactly one must exist. */
function migrationFile(): { path: string; text: string } {
  const db = join(__dirname, "..");
  const found: string[] = [];
  for (const dir of ["migrations-pending", "migrations"]) {
    for (const f of readdirSync(join(db, dir))) if (f.endsWith(SLUG)) found.push(join(db, dir, f));
  }
  if (found.length !== 1) throw new Error(`expected exactly one *${SLUG}, found ${found.length}: ${found.join(", ")}`);
  return { path: found[0]!, text: readFileSync(found[0]!, "utf8") };
}
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/* ======================================================================== */
/* THE SIDE THE DATABASE IS ON                                              */
/* ======================================================================== */

async function installed(tx: TransactionSql): Promise<{ exprs: Record<string, string>; packMd5: string }> {
  await tx`set local search_path = public`;
  const rows = (await tx`
    select polname, pg_get_expr(polqual, polrelid) as expr
      from pg_policy
     where polname in ${tx(POLICIES.map((p) => p.name))}`) as { polname: string; expr: string }[];
  const [fn] = (await tx`
    select md5(prosrc) as m from pg_proc
     where oid = to_regprocedure('public.pack_instance_consuming_sessions(uuid)')`) as { m: string }[];
  return { exprs: Object.fromEntries(rows.map((r) => [r.polname, r.expr])), packMd5: fn?.m ?? "" };
}

/** Runs `fn` in a transaction that always rolls back, and returns its value. */
async function rolledBack<T>(sql: Sql, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  try {
    await sql.begin(async (tx) => {
      throw new Rollback(await fn(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.value as T;
    throw e;
  }
  throw new Error("unreachable");
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

async function sideOf(): Promise<string> {
  if (!live) return "no database";
  const sql = connect();
  try {
    const got = await rolledBack(sql, installed);
    const sides = POLICIES.map((p) => {
      const m = md5(got.exprs[p.name] ?? "");
      return m === p.oldMd5 ? "old" : m === p.newMd5 ? "new" : `unknown(${p.name} ${m})`;
    });
    sides.push(got.packMd5 === PACK_OLD_MD5 ? "old" : got.packMd5 === PACK_NEW_MD5 ? "new" : `unknown(pack ${got.packMd5})`);
    const distinct = [...new Set(sides)];
    if (distinct.length !== 1 || distinct[0]!.startsWith("unknown")) {
      throw new Error(
        `THE SIX OBJECTS ARE NOT ALL ON ONE KNOWN SIDE: ${sides.join(", ")}. ` +
          "The migration is one transaction, so this database was built some other way. Nothing here was measured.",
      );
    }
    return distinct[0] === "new" ? "0113 APPLIED" : "0113 PENDING (the 0096/0092/0102/0104/0108 texts)";
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const SIDE = await sideOf();
const d = live ? describe : describe.skip;

/* ======================================================================== */
/* THE COMPARISON                                                           */
/* ======================================================================== */

type Comparison = {
  rlsApplied: boolean;
  loosened: number;
  tightened: number;
  fixtureRows: number;
  fixtureVisible: number;
};

/** Sets a principal's claims WITHOUT dropping to `authenticated` (the 0078 lesson), and rolls back. */
async function asPrincipal<T>(sql: Sql, claims: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return rolledBack(sql, async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    return fn(tx);
  });
}

/** Rows on which two policy expressions disagree, over the whole table, both directions. */
async function disagreements(
  tx: TransactionSql,
  table: string,
  fixtureTenants: string[],
  left: string,
  right: string,
): Promise<Comparison> {
  const [r] = await tx.unsafe(
    `SELECT row_security_active('public.${table}') AS rls_applied,
            count(*) FILTER (WHERE r_ok AND NOT l_ok)::int AS loosened,
            count(*) FILTER (WHERE l_ok AND NOT r_ok)::int AS tightened,
            count(*) FILTER (WHERE fixture)::int AS fixture_rows,
            count(*) FILTER (WHERE fixture AND l_ok)::int AS fixture_visible
       FROM (SELECT (${left}) IS TRUE AS l_ok,
                    (${right}) IS TRUE AS r_ok,
                    (tenant_id = ANY ($1::uuid[])) AS fixture
               FROM public.${table}) t`,
    [fixtureTenants as unknown as string],
  );
  const row = r as unknown as {
    rls_applied: boolean; loosened: number; tightened: number; fixture_rows: number; fixture_visible: number;
  };
  return {
    rlsApplied: row.rls_applied,
    loosened: row.loosened,
    tightened: row.tightened,
    fixtureRows: row.fixture_rows,
    fixtureVisible: row.fixture_visible,
  };
}

/** The same for the pack function's patient term, over every (instance, linked appointment) pair. */
async function packDisagreements(
  tx: TransactionSql,
  fixtureTenants: string[],
  left: string,
  right: string,
): Promise<Comparison> {
  const [r] = await tx.unsafe(
    `SELECT row_security_active('public.patients') AS rls_applied,
            count(*) FILTER (WHERE r_ok AND NOT l_ok)::int AS loosened,
            count(*) FILTER (WHERE l_ok AND NOT r_ok)::int AS tightened,
            count(*) FILTER (WHERE fixture)::int AS fixture_rows,
            count(*) FILTER (WHERE fixture AND l_ok)::int AS fixture_visible
       FROM (SELECT ((${PACK_COMMON}) AND (${left})) IS TRUE AS l_ok,
                    ((${PACK_COMMON}) AND (${right})) IS TRUE AS r_ok,
                    (i.tenant_id = ANY ($1::uuid[])) AS fixture
               FROM public.patient_pack_instances i
               JOIN public.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
               JOIN public.appointments a ON a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id) t`,
    [fixtureTenants as unknown as string],
  );
  const row = r as unknown as {
    rls_applied: boolean; loosened: number; tightened: number; fixture_rows: number; fixture_visible: number;
  };
  return {
    rlsApplied: row.rls_applied,
    loosened: row.loosened,
    tightened: row.tightened,
    fixtureRows: row.fixture_rows,
    fixtureVisible: row.fixture_visible,
  };
}

/** Replaces exactly one occurrence of `term` in `expr`, and fails if there is not exactly one. */
function mutate(expr: string, term: string, by: string): string {
  const parts = expr.split(term);
  if (parts.length !== 2) throw new Error(`the term occurs ${parts.length - 1} times, not once: ${term}`);
  return parts.join(by);
}

/* ======================================================================== */
/* THE FIXTURE                                                              */
/* ======================================================================== */

d(`patient-id set reads: the rows are the same before and after the hashed rewrite [${SIDE}]`, () => {
  let sql: Sql;

  const T = randomUUID();
  const F = randomUUID();
  const fixtureTenants = [T, F];
  const L1 = randomUUID();
  const L2 = randomUUID();
  const LF = randomUUID();

  const u = {
    owner: randomUUID(), adminL1: randomUUID(), adminNone: randomUUID(), recL1: randomUUID(),
    recL2: randomUUID(), recBoth: randomUUID(), ther: randomUUID(), ther2: randomUUID(),
    registrar: randomUUID(), foreign: randomUUID(),
  };
  const p = {
    primL1: randomUUID(), primL2: randomUUID(), none: randomUUID(), createdRec: randomUUID(),
    createdTher: randomUUID(), apptL1: randomUUID(), treated: randomUUID(), treated2nd: randomUUID(),
    careL1: randomUUID(), careL2: randomUUID(), carePrim: randomUUID(), care2nd: randomUUID(),
    other: randomUUID(), other2: randomUUID(), foreign: randomUUID(),
  };
  const service = randomUUID();
  const pack = randomUUID();
  const inst = { apptL1: randomUUID(), treated: randomUUID(), careL1: randomUUID(), primL2: randomUUID() };

  /** The principals: label, role, user id (null: the reminder jobs' principal, no user id). */
  const PRINCIPALS: [string, "owner" | "admin" | "reception" | "therapist", string | null][] = [
    ["owner", "owner", u.owner],
    ["admin with clinic 1", "admin", u.adminL1],
    ["admin with no clinic", "admin", u.adminNone],
    ["reception with clinic 1", "reception", u.recL1],
    ["reception with clinic 2", "reception", u.recL2],
    ["reception with both clinics", "reception", u.recBoth],
    ["therapist at clinic 1", "therapist", u.ther],
    ["therapist at clinic 2", "therapist", u.ther2],
    ["the reminder jobs (admin, no user id)", "admin", null],
  ];
  const claims = (role: string, user: string | null) =>
    user === null
      ? JSON.stringify({ tenant_id: T, user_role: role })
      : claimsFor(T, role as "owner", user);

  beforeAll(async () => {
    sql = connect();
    await sql.begin(async (tx) => {
      await tx`insert into tenants (id, name, slug) values
        (${T}, 'u3-arrays', ${`u3-arrays-${T.slice(0, 8)}`}),
        (${F}, 'u3-arrays-f', ${`u3-arrays-f-${F.slice(0, 8)}`})`;
      await tx`insert into locations (id, tenant_id, name) values
        (${L1}, ${T}, 'Clinica 1'), (${L2}, ${T}, 'Clinica 2'), (${LF}, ${F}, 'Clinica F')`;
      for (const [k, id] of Object.entries(u)) {
        await tx`insert into users (id, tenant_id, email, full_name)
                 values (${id}, ${k === "foreign" ? F : T}, ${`u3-${k}-${id.slice(0, 8)}@arrays.test`}, ${`U3 ${k}`})`;
      }
      await tx`insert into staff_locations (tenant_id, user_id, location_id) values
        (${T}, ${u.adminL1}, ${L1}), (${T}, ${u.recL1}, ${L1}), (${T}, ${u.recL2}, ${L2}),
        (${T}, ${u.recBoth}, ${L1}), (${T}, ${u.recBoth}, ${L2}),
        (${T}, ${u.ther}, ${L1}), (${T}, ${u.ther2}, ${L2})`;

      const pat = (id: string, primary: string | null, creator: string, tenant = T) =>
        tx`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
           values (${id}, ${tenant}, ${`U3 ${id.slice(0, 8)}`}, ${primary}, ${creator})`;
      await pat(p.primL1, L1, u.registrar);
      await pat(p.primL2, L2, u.registrar);
      await pat(p.none, null, u.registrar);
      await pat(p.createdRec, L2, u.recL1);
      await pat(p.createdTher, null, u.ther);
      await pat(p.apptL1, null, u.registrar);
      await pat(p.treated, L2, u.registrar);
      await pat(p.treated2nd, L2, u.registrar);
      await pat(p.careL1, null, u.registrar);
      await pat(p.careL2, null, u.registrar);
      await pat(p.carePrim, L1, u.registrar);
      await pat(p.care2nd, L2, u.registrar);
      await pat(p.other, L2, u.registrar);
      await pat(p.other2, L2, u.registrar);
      await pat(p.foreign, LF, u.foreign, F);

      await tx`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by) values
        (${T}, ${p.careL1}, ${u.ther}, ${u.recL1}),
        (${T}, ${p.careL2}, ${u.ther}, ${u.recL1}),
        (${T}, ${p.carePrim}, ${u.ther}, ${u.recL1}),
        (${T}, ${p.care2nd}, ${u.ther}, ${u.recL1})`;

      await tx`insert into services (id, tenant_id, name) values (${service}, ${T}, 'U3 servico')`;
      await tx`insert into service_packs (id, tenant_id, base_service_id, name, session_count, price_cents)
               values (${pack}, ${T}, ${service}, 'U3 pack', 5, 1000)`;
      for (const [k, pid] of [["apptL1", p.apptL1], ["treated", p.treated], ["careL1", p.careL1], ["primL2", p.primL2]] as const) {
        await tx`insert into patient_pack_instances (id, tenant_id, patient_id, pack_id, sessions_total, sessions_remaining)
                 values (${inst[k]}, ${T}, ${pid}, ${pack}, 5, 5)`;
      }

      /**
       * The appointments. Each line says which term it exists for.
       *   a1  apptL1 at L1 by ther2: the visible set (appointment at clinic 1).
       *   a2  treated at L2 by ther: the treated set (first slot, first practitioner).
       *   a3  treated at L1 by ther2: history, first patient treated, at ther's clinic.
       *   a4  other at L2, second patient treated2nd, ther2 then ther as SECOND
       *       practitioner: the treated set through both second slots.
       *   a5  other2 at L1 by ther2, second patient treated2nd: history, second patient treated.
       *   a6  careL1 at L1 by ther2: care team at ther's clinic by appointment; history, first patient care team.
       *   a7  careL2 at L2 by ther2: care team, NOT at ther's clinic (excluded).
       *   a8  other2 at L1 by ther2, second patient care2nd: history, second patient care team.
       *   a9  primL2 at L2 by ther2 (pack instance with a visit only clinic 2 sees).
       *   af  the foreign tenant's row.
       */
      const ap = (id: string, tenant: string, patient: string, loc: string, pr: string, day: number,
        extra: { patient_2_id?: string; practitioner_2_id?: string; pack_instance_id?: string } = {}) => ({
        id, tenant_id: tenant, patient_id: patient, location_id: loc, practitioner_id: pr,
        starts_at: new Date(Date.UTC(2026, 5, day, 9)), ends_at: new Date(Date.UTC(2026, 5, day, 10)),
        status: "completed", patient_2_id: extra.patient_2_id ?? null,
        practitioner_2_id: extra.practitioner_2_id ?? null, pack_instance_id: extra.pack_instance_id ?? null,
      });
      const A = {
        a1: ap(randomUUID(), T, p.apptL1, L1, u.ther2, 1, { pack_instance_id: inst.apptL1 }),
        a2: ap(randomUUID(), T, p.treated, L2, u.ther, 2, { pack_instance_id: inst.treated }),
        a3: ap(randomUUID(), T, p.treated, L1, u.ther2, 3),
        a4: ap(randomUUID(), T, p.other, L2, u.ther2, 4, { patient_2_id: p.treated2nd, practitioner_2_id: u.ther }),
        a5: ap(randomUUID(), T, p.other2, L1, u.ther2, 5, { patient_2_id: p.treated2nd }),
        a6: ap(randomUUID(), T, p.careL1, L1, u.ther2, 6, { pack_instance_id: inst.careL1 }),
        a7: ap(randomUUID(), T, p.careL2, L2, u.ther2, 7),
        a8: ap(randomUUID(), T, p.other2, L1, u.ther2, 8, { patient_2_id: p.care2nd }),
        a9: ap(randomUUID(), T, p.primL2, L2, u.ther2, 9, { pack_instance_id: inst.primL2 }),
        af: ap(randomUUID(), F, p.foreign, LF, u.foreign, 10),
      };
      for (const r of Object.values(A)) await tx`insert into appointments ${tx(r)}`;

      // One episode per patient; a registo and a survey send per appointment, each in the appointment's names.
      const episodeOf: Record<string, string> = {};
      for (const pid of Object.values(p)) {
        const id = randomUUID();
        episodeOf[pid] = id;
        await tx`insert into clinical_episodes (id, tenant_id, patient_id, primary_practitioner_id, title)
                 values (${id}, ${pid === p.foreign ? F : T}, ${pid}, ${pid === p.foreign ? u.foreign : u.ther2}, 'U3 episodio')`;
      }
      for (const r of Object.values(A)) {
        await tx`insert into clinical_records (tenant_id, episode_id, patient_id, practitioner_id, appointment_id, data)
                 values (${r.tenant_id}, ${episodeOf[r.patient_id]!}, ${r.patient_id}, ${r.practitioner_id}, ${r.id}, '{"nota": "texto de teste"}'::jsonb)`;
        await tx`insert into appointment_survey_sends (tenant_id, appointment_id, patient_id, location_id, channel, origin)
                 values (${r.tenant_id}, ${r.id}, ${r.patient_id}, ${r.location_id}, 'email', 'automatic')`;
      }
      // A registo of the care-team patient seen by primary clinic only (no appointment), by ther2.
      await tx`insert into clinical_records (tenant_id, episode_id, patient_id, practitioner_id, data)
               values (${T}, ${episodeOf[p.carePrim]!}, ${p.carePrim}, ${u.ther2}, '{"nota": "texto de teste"}'::jsonb)`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await tx`delete from appointment_survey_sends where tenant_id in (${T}, ${F})`;
      await tx`delete from clinical_records where tenant_id in (${T}, ${F})`;
      await tx`delete from clinical_episodes where tenant_id in (${T}, ${F})`;
      await tx`delete from patient_care_team where tenant_id in (${T}, ${F})`;
      await tx`delete from appointments where tenant_id in (${T}, ${F})`;
      await tx`delete from patient_pack_instances where tenant_id in (${T}, ${F})`;
      await tx`delete from service_packs where tenant_id in (${T}, ${F})`;
      await tx`delete from services where tenant_id in (${T}, ${F})`;
      await tx`delete from patients where tenant_id in (${T}, ${F})`;
      await tx`delete from staff_locations where tenant_id in (${T}, ${F})`;
      await tx`delete from users where tenant_id in (${T}, ${F})`;
      await tx`delete from locations where tenant_id in (${T}, ${F})`;
      await tx`delete from tenants where id in (${T}, ${F})`;
    });
    await sql.end();
  });

  /* ---------------------------------------------------------------------- */
  /* THE FILE AND THE CATALOGUE                                             */
  /* ---------------------------------------------------------------------- */

  it("each NEW expression is the file's text, character for character after collapsing whitespace", () => {
    const { text } = migrationFile();
    const file = collapse(text);
    for (const spec of POLICIES) {
      expect(file, spec.name).toContain(collapse(`ALTER POLICY "${spec.name}" ON public.${spec.table} USING (${spec.new} );`));
    }
    expect(file).toContain(collapse(PACK_NEW));
    expect(file).toContain(collapse(PACK_COMMON));
    // And no OLD form survives in the file's statements.
    expect(file).not.toMatch(/= ANY \(coalesce\(\(\s*SELECT public\.viewer_(visible_patient|treated_patient|care_team_patient)_ids/);
  });

  it("the installed expressions are the OLD or the NEW texts, all on one side (the title names it)", () => {
    expect(SIDE).toMatch(/^0113 (APPLIED|PENDING)/);
  });

  /* ---------------------------------------------------------------------- */
  /* SAME ROWS, PER POLICY, PER PRINCIPAL                                   */
  /* ---------------------------------------------------------------------- */

  for (const spec of POLICIES) {
    for (const [label, role, user] of PRINCIPALS) {
      it(`${spec.name}: ${label} sees exactly the same rows (NEW and INSTALLED against OLD)`, async () => {
        const [byNew, byInstalled] = await asPrincipal(sql, claims(role, user), async (tx) => {
          const n = await disagreements(tx, spec.table, fixtureTenants, spec.old, spec.new);
          const live = await installed(tx);
          const i = await disagreements(tx, spec.table, fixtureTenants, spec.old, live.exprs[spec.name]!);
          return [n, i] as const;
        });
        for (const r of [byNew, byInstalled]) {
          expect(r.rlsApplied).toBe(false);
          expect(r.fixtureRows).toBeGreaterThan(0);
          expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({ loosened: 0, tightened: 0 });
        }
      });
    }
  }

  for (const [label, role, user] of PRINCIPALS) {
    it(`pack_instance_consuming_sessions: ${label} gets exactly the same rows (NEW and INSTALLED against OLD)`, async () => {
      const r = await asPrincipal(sql, claims(role, user), async (tx) => {
        const byNew = await packDisagreements(tx, fixtureTenants, PACK_OLD, PACK_NEW);
        // The installed function itself, per fixture instance, against OLD's pairs.
        const want = (await tx.unsafe(
          `SELECT i.id::text AS inst, a.id::text AS appt
             FROM public.patient_pack_instances i
             JOIN public.patients p ON p.id = i.patient_id AND p.tenant_id = i.tenant_id
             JOIN public.appointments a ON a.pack_instance_id = i.id AND a.tenant_id = i.tenant_id
            WHERE i.tenant_id = ANY ($1::uuid[]) AND (${PACK_COMMON}) AND (${PACK_OLD})
            ORDER BY 1, 2`,
          [fixtureTenants as unknown as string],
        )) as unknown as { inst: string; appt: string }[];
        const got = (await tx.unsafe(
          `SELECT i.id::text AS inst, s.appointment_id::text AS appt
             FROM public.patient_pack_instances i
             CROSS JOIN LATERAL public.pack_instance_consuming_sessions(i.id) s
            WHERE i.tenant_id = ANY ($1::uuid[])
            ORDER BY 1, 2`,
          [fixtureTenants as unknown as string],
        )) as unknown as { inst: string; appt: string }[];
        return { byNew, want, got };
      });
      expect(r.byNew.rlsApplied).toBe(false);
      expect(r.byNew.fixtureRows).toBe(4);
      expect({ loosened: r.byNew.loosened, tightened: r.byNew.tightened }).toEqual({ loosened: 0, tightened: 0 });
      expect(r.got).toEqual(r.want);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* COVERAGE AND THE POSITIVE CONTROLS (SR-60)                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Each rewritten term, removed (set to false) from NEW, must make the
   * comparison RED for the principal it serves, by exactly the fixture rows
   * only that term admits. A term no row depends on would show 0 here, and so
   * would a comparison that cannot fail.
   */
  const CONTROLS: [string, string, string, "admin" | "reception" | "therapist", keyof typeof u, number][] = [
    // [policy, term in NEW, why, role, user, rows only it admits]
    ["patients_select", "id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))",
      "visible set: an appointment at clinic 1 in either slot (apptL1, treated, other2, treated2nd, careL1, care2nd) and primary clinic 1 (primL1, carePrim)",
      "reception", "recL1", 8],
    ["patients_select", "id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))",
      "visible set, both clinics: every patient with an appointment or a primary clinic (12 of 14; not none, not createdTher)",
      "reception", "recBoth", 12],
    ["patients_select", "id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))",
      "treated set: treated (first slot), and other and treated2nd (a4, where ther is the SECOND practitioner)",
      "therapist", "ther", 3],
    ["patients_select", "id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))",
      "care team at clinic 1: careL1 (appointment) and carePrim (primary clinic, no appointment)",
      "therapist", "ther", 2],
    ["clinical_records_select", "patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))",
      "registos of careL1 (a6) and carePrim (no appointment), both by ther2",
      "therapist", "ther", 2],
    ["clinical_episodes_select", "patient_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids_at_my_clinics())))",
      "episodes of careL1 and carePrim",
      "therapist", "ther", 2],
    ["appointments_care_team_patient_history_select", "(patient_id      IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))",
      "a6: careL1 at clinic 1, first slot",
      "therapist", "ther", 1],
    ["appointments_care_team_patient_history_select", "(patient_2_id IN (SELECT unnest((SELECT public.viewer_care_team_patient_ids()))))",
      "a8: care2nd as second patient at clinic 1",
      "therapist", "ther", 1],
    ["appointments_care_team_patient_history_select", "(patient_id   IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))",
      "a3: treated at clinic 1 with ther2",
      "therapist", "ther", 1],
    ["appointments_care_team_patient_history_select", "(patient_2_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))",
      "a5: treated2nd as second patient at clinic 1",
      "therapist", "ther", 1],
    ["appointment_survey_sends_select", "patient_id IN (SELECT unnest((SELECT public.viewer_treated_patient_ids())))",
      "sends of a2 and a3 (treated) and a4 (other)",
      "therapist", "ther", 3],
  ];

  for (const [name, term, why, role, user, rows] of CONTROLS) {
    it(`CONTROL ${name}: with "${term.trim()}" removed the comparison goes RED, tightened ${rows} for ${user} (${why})`, async () => {
      const spec = POLICIES.find((s) => s.name === name)!;
      const narrowed = mutate(spec.new, term, "false");
      const r = await asPrincipal(sql, claimsFor(T, role, u[user]), (tx) =>
        disagreements(tx, spec.table, fixtureTenants, spec.old, narrowed),
      );
      expect(r.rlsApplied).toBe(false);
      expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({ loosened: 0, tightened: rows });
    });
  }

  it("CONTROL: a loosened patients_select (the visible set replaced by true) goes RED for reception with clinic 1", async () => {
    const loosened = mutate(PATIENTS_NEW, "id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))", "true");
    const r = await asPrincipal(sql, claimsFor(T, "reception", u.recL1), (tx) =>
      disagreements(tx, "patients", fixtureTenants, PATIENTS_OLD, loosened),
    );
    // Every patient of T the visible set and the creator arm do not reach: primL2, none, createdTher, careL2, other.
    expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({ loosened: 5, tightened: 0 });
  });

  it("CONTROL: a loosened appointments history (the treated term replaced by true) goes RED for the therapist", async () => {
    const loosened = mutate(HISTORY_NEW, "(patient_id   IN (SELECT unnest((SELECT public.viewer_treated_patient_ids()))))", "true");
    const r = await asPrincipal(sql, claimsFor(T, "therapist", u.ther), (tx) =>
      disagreements(tx, "appointments", fixtureTenants, HISTORY_OLD, loosened),
    );
    // Every clinic-1 appointment the four terms did not admit: a1.
    expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({ loosened: 1, tightened: 0 });
  });

  it("CONTROL: the pack function's visible-set term removed goes RED for reception with clinic 1", async () => {
    const narrowed = mutate(PACK_NEW, "p.id IN (SELECT unnest((SELECT public.viewer_visible_patient_ids())))", "false");
    const r = await asPrincipal(sql, claimsFor(T, "reception", u.recL1), (tx) =>
      packDisagreements(tx, fixtureTenants, PACK_OLD, narrowed),
    );
    // a1 (apptL1), a2 (treated) and a6 (careL1): their patients are reached by the visible set only.
    expect({ loosened: r.loosened, tightened: r.tightened }).toEqual({ loosened: 0, tightened: 3 });
  });
});
