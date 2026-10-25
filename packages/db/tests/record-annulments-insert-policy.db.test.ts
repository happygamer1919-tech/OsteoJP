/**
 * record-annulments-insert-policy.db.test.ts: the record_annulments INSERT
 * policy (0107). An annulment is written by the owner, or by a therapist who
 * authored the registo or treats or created its patient, in their own name,
 * for a signed registo of their tenant.
 *
 * The migration is packages/db/migrations/0107_record_annulments_insert_
 * policy.sql, promoted from packages/db/migrations-pending with no byte
 * changed. This file READS THE
 * SCHEMA (record-annulments-insert-state.ts) to decide which arms run. It
 * never skips as a whole on a live database, it THROWS on a database whose
 * policy is neither expression, and from the promotion commit on every arm
 * runs or the file THROWS.
 *
 * THE ARMS. One INSERT each, as one ASSIGNED principal: `authenticated`, with
 * the tenant, the role and the user id in the claims, as the application's
 * withTenantContext sets them. Never the connection's own role. The arms that
 * need the ruled expression carry an id, R01 to R15. The arms with no id are
 * the callers the application's annulRecord lets through to its INSERT today,
 * one per way of being one (apps/web/lib/patients/scope.ts,
 * therapistRegistoWriteScope), and they run on either expression.
 *
 *   id   who                                      the registo            answer
 *        the owner, in their own name             signed, a therapist's  written
 *        the owner, in their own name             signed, no author      written
 *        the author, a patient they treat         signed, their own      written
 *        the author, a patient they do not treat  signed, their own      written
 *        a therapist with an appointment with     signed, a colleague's  written
 *          the patient, as first practitioner
 *        the same, as second practitioner         signed, a colleague's  written
 *        the same, the patient in the second slot signed, a colleague's  written
 *        a therapist who created the patient      signed, a colleague's  written
 *        a therapist who treats the patient       signed, no author      written
 *   R01  a receptionist                           signed                 42501
 *   R02  an admin who reads the registo           signed                 42501
 *   R03  an admin who does not read it            signed                 42501
 *   R04  a therapist on the patient's care team,  signed, a colleague's  42501
 *          who reads the registo, and is the
 *          therapist of another patient
 *   R05  a therapist with no tie to the patient   signed, a colleague's  42501
 *   R06  a therapist with no tie to the patient   signed, no author      42501
 *   R07  the author's user id, another role       signed                 42501
 *   R08  a therapist, naming another              signed                 42501
 *   R09  the author, naming nobody                signed                 42501
 *   R10  the owner, naming another or nobody      signed                 42501
 *   R11  a therapist or the owner                 a draft                42501
 *   R12  a therapist or the owner                 a locked one           42501
 *   R13  the owner                                another tenant's       42501
 *   R14  the expression, by its terms             (catalogue)
 *   R15  a therapist of one patient               signed, another        42501
 *                                                   patient's
 *        anyone, a row of another tenant          signed                 42501
 *        the patient role, and anon               signed                 42501, no privilege
 *
 * A refusal by the policy is asserted by its SQLSTATE, 42501, AND by its
 * message, the row level security violation: a missing privilege is 42501
 * too, and the patient and anon arms assert THAT message instead. The INSERTs
 * carry NO RETURNING, so the INSERT policy alone decides them; the RETURNING
 * form has its own arm.
 *
 * R01, R05, R06, R15 AND TWO CLAIMS OF R07 REST ON THE REGISTO'S OWN SELECT
 * POLICY. The expression reads the registo as the caller, and reception, a
 * therapist with no tie to the patient, a therapist of another patient (R15:
 * neither of its attempts reaches clinical_therapist_sees_patient) and a role
 * the matrix does not name read no registo, so those attempts cannot reach the
 * role term. R02 and R04 are the arms that do: an admin assigned to the
 * patient's clinic, and a therapist on the patient's care team at that clinic,
 * each read the registo (PREMISE) and are refused by the role term and by the
 * two therapist terms alone. R04 is the arm that tests the patient term.
 *
 * NO REGISTO OF THIS FILE IS EVER COMMITTED. A signed registo cannot be
 * deleted (clinical_records_enforce_immutability), so each arm builds its
 * fixture and acts inside ONE transaction that always rolls back.
 */
import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { annulmentInsertState, INSERT_POLICY, RULED_TERMS, ruledTitle } from "./record-annulments-insert-state";
import { type AppRole, claimsFor, connect, live, patientClaims, Rollback } from "./rls-harness";

const state = await annulmentInsertState();
const SIDE = state.side;
/** The arms that need the ruled expression. */
const itRuled = it.skipIf(!state.applied);
const ruled = (id: string, what: string) => ruledTitle(state, id, what);

type Fixture = {
  tenant: string;
  other: string;
  owner: string;
  admin: string; // assigned to the clinic of P's appointments, so reads P's registos
  adminElsewhere: string; // an admin assigned to no clinic, who reads none of them
  reception: string;
  author: string; // authored every registo of P below; has an appointment with P; assigned to that clinic
  treats: string; // a colleague with an appointment with P; authored none of them
  second: string; // a colleague who is the SECOND practitioner of an appointment with P
  pair: string; // a colleague with an appointment in which P is the SECOND patient
  maker: string; // a therapist who created Q, and has no appointment with anyone
  careTeam: string; // on P's care team, assigned to P's clinic: reads P's registos; no appointment with P, did not create P; created another patient
  untied: string; // a therapist with no appointment with P, who did not create P
  foreignOwner: string;
  p: string;
  q: string; // a second patient of the tenant, created by `maker`
  signed: string; // P's, the author's, signed
  draft: string; // P's, the author's, a draft
  locked: string; // P's, the author's, locked
  unauthored: string; // P's, signed, with no author
  qSigned: string; // Q's, the author's, signed; the author has no appointment with Q and did not create Q
  foreignSigned: string; // another tenant's, signed
};

const T0 = "2026-03-02T09:00:00Z";
const T1 = "2026-03-02T10:00:00Z";

/** The whole fixture, written inside the caller's transaction as the connection's own role. */
async function seed(tx: TransactionSql): Promise<Fixture> {
  const f: Fixture = {
    tenant: randomUUID(),
    other: randomUUID(),
    owner: randomUUID(),
    admin: randomUUID(),
    adminElsewhere: randomUUID(),
    reception: randomUUID(),
    author: randomUUID(),
    treats: randomUUID(),
    second: randomUUID(),
    pair: randomUUID(),
    maker: randomUUID(),
    careTeam: randomUUID(),
    untied: randomUUID(),
    foreignOwner: randomUUID(),
    p: randomUUID(),
    q: randomUUID(),
    signed: randomUUID(),
    draft: randomUUID(),
    locked: randomUUID(),
    unauthored: randomUUID(),
    qSigned: randomUUID(),
    foreignSigned: randomUUID(),
  };
  const x = randomUUID();
  const loc = randomUUID();
  await tx`insert into tenants (id, name, slug) values
    (${f.tenant}, 'Anular', ${`anular-${f.tenant}`}),
    (${f.other}, 'Anular other', ${`anular-o-${f.other}`})`;
  await tx`insert into users (id, tenant_id, email, full_name) values
    (${f.owner},        ${f.tenant}, ${`ow-${f.owner}@x.pt`},        'Owner'),
    (${f.admin},        ${f.tenant}, ${`ad-${f.admin}@x.pt`},        'Admin'),
    (${f.adminElsewhere}, ${f.tenant}, ${`ae-${f.adminElsewhere}@x.pt`}, 'Admin sem clinica'),
    (${f.reception},    ${f.tenant}, ${`rc-${f.reception}@x.pt`},    'Reception'),
    (${f.author},       ${f.tenant}, ${`au-${f.author}@x.pt`},       'Terapeuta autor'),
    (${f.treats},       ${f.tenant}, ${`tr-${f.treats}@x.pt`},       'Terapeuta colega'),
    (${f.second},       ${f.tenant}, ${`se-${f.second}@x.pt`},       'Terapeuta segundo'),
    (${f.pair},         ${f.tenant}, ${`pa-${f.pair}@x.pt`},         'Terapeuta de par'),
    (${f.maker},        ${f.tenant}, ${`mk-${f.maker}@x.pt`},        'Terapeuta que registou'),
    (${f.careTeam},     ${f.tenant}, ${`ct-${f.careTeam}@x.pt`},     'Terapeuta da equipa'),
    (${f.untied},       ${f.tenant}, ${`un-${f.untied}@x.pt`},       'Terapeuta sem ligacao'),
    (${f.foreignOwner}, ${f.other},  ${`fo-${f.foreignOwner}@x.pt`}, 'Owner other')`;
  await tx`insert into locations (id, tenant_id, name) values (${loc}, ${f.tenant}, 'Anular loc')`;
  // clinical_admin_sees_patient (0045) reads staff_locations against the clinic
  // of the patient's appointments. The author's row serves R07: the same user
  // id under the admin role reads the registo too. The care-team therapist's
  // row is what viewer_care_team_patient_ids_at_my_clinics (0096) asks for.
  await tx`insert into staff_locations (tenant_id, user_id, location_id) values
    (${f.tenant}, ${f.admin}, ${loc}),
    (${f.tenant}, ${f.author}, ${loc}),
    (${f.tenant}, ${f.careTeam}, ${loc})`;
  await tx`insert into patients (id, tenant_id, full_name, created_by) values
    (${f.p}, ${f.tenant}, 'Utente P', ${f.reception}),
    (${f.q}, ${f.tenant}, 'Utente Q', ${f.maker})`;
  await tx`insert into patients (id, tenant_id, full_name) values (${x}, ${f.other}, 'Utente X')`;
  await tx`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at) values
    (${f.tenant}, ${f.p}, ${f.author}, ${loc}, ${T0}, ${T1}),
    (${f.tenant}, ${f.p}, ${f.treats}, ${loc}, ${T0}, ${T1})`;
  // The two other slots clinical_therapist_sees_patient (0045) reads: the
  // second practitioner (the author holds the first), and the second patient.
  // `filler` holds the first slot of `pair`'s appointment. The care-team
  // therapist created `filler`, so they are a therapist of ANOTHER patient of
  // the tenant, and of P only a reader. The owner has no appointment with
  // anyone and created nobody.
  const filler = randomUUID();
  await tx`insert into patients (id, tenant_id, full_name, created_by) values (${filler}, ${f.tenant}, 'Utente F', ${f.careTeam})`;
  await tx`insert into appointments (tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id, starts_at, ends_at) values
    (${f.tenant}, ${f.p}, ${f.author}, ${f.second}, ${loc}, ${T0}, ${T1})`;
  await tx`insert into appointments (tenant_id, patient_id, patient_2_id, practitioner_id, location_id, starts_at, ends_at) values
    (${f.tenant}, ${filler}, ${f.p}, ${f.pair}, ${loc}, ${T0}, ${T1})`;
  await tx`insert into patient_care_team (tenant_id, patient_id, user_id, assigned_by) values
    (${f.tenant}, ${f.p}, ${f.careTeam}, ${f.owner})`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${f.signed}, ${f.tenant}, ${f.p}, ${f.author}, 'signed'),
    (${f.draft},  ${f.tenant}, ${f.p}, ${f.author}, 'draft'),
    (${f.locked}, ${f.tenant}, ${f.p}, ${f.author}, 'locked')`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, status) values
    (${f.unauthored}, ${f.tenant}, ${f.p}, 'signed')`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${f.qSigned}, ${f.tenant}, ${f.q}, ${f.author}, 'signed')`;
  await tx`insert into clinical_records (id, tenant_id, patient_id, practitioner_id, status) values
    (${f.foreignSigned}, ${f.other}, ${x}, ${f.foreignOwner}, 'signed')`;
  return f;
}

let sql: Sql;

type Act = {
  f: Fixture;
  tx: TransactionSql;
  /** From here on the transaction is this principal: `authenticated`, with these claims. */
  become: (role: AppRole | string, user: string, tenant?: string) => Promise<void>;
};

/**
 * One fixture, one transaction, always rolled back. The fixture is written as
 * the connection's own role; `become` then drops to `authenticated` with the
 * principal's claims, exactly the two statements of withTenantContext
 * (packages/db/src/client.ts).
 */
async function scenario<R>(fn: (act: Act) => Promise<R>): Promise<R> {
  try {
    await sql.begin(async (tx) => {
      const f = await seed(tx);
      const become = async (role: string, user: string, tenant = f.tenant) => {
        await tx`select set_config('request.jwt.claims', ${claimsFor(tenant, role as AppRole, user)}, true)`;
        await tx.unsafe("set local role authenticated");
      };
      throw new Rollback(await fn({ f, tx, become }));
    });
    throw new Error("unreachable: transaction committed without rollback");
  } catch (err) {
    if (err instanceof Rollback) return err.value as R;
    throw err;
  }
}

/** One annulment INSERT as the current principal. NO RETURNING: the INSERT policy alone decides. */
const annuls = async (tx: TransactionSql, tenant: string, record: string, by: string | null): Promise<number> =>
  (
    await tx`insert into record_annulments (tenant_id, record_id, annulled_by_user_id)
             values (${tenant}, ${record}, ${by})`
  ).count;

type Who = { role: AppRole | string; user: keyof Fixture };
type Row = { record: keyof Fixture; by: keyof Fixture | null };

/** The INSERT `row` attempted as `who`, in a scenario of its own. */
const attempt = (who: Who, row: Row) =>
  scenario(async ({ f, tx, become }) => {
    await become(who.role, f[who.user]);
    return annuls(tx, f.tenant, f[row.record], row.by === null ? null : f[row.by]);
  });

/** The refusal these arms measure: SQLSTATE 42501, the row level security violation. */
async function refused(run: Promise<unknown>): Promise<void> {
  await expect(run).rejects.toMatchObject({
    code: "42501",
    message: expect.stringMatching(/row-level security policy for table "record_annulments"/),
  });
}

describe.skipIf(!live)(`record_annulments: who writes an annulment [${SIDE}]`, () => {
  beforeAll(() => {
    sql = connect();
  });
  afterAll(async () => {
    await sql?.end();
  });

  it("PREMISE: the fixture is what the arms say it is", async () => {
    const out = await scenario(async ({ f, tx }) => {
      const [r] = await tx<
        {
          author_appt: number; treats_appt: number; second_appt: number; pair_appt: number; ties: string;
          maker: string; q_maker: string; q_appts: number; care_team_made: number; owner_ties: number; statuses: string; authors: string; q_author: string; foreign_tenant: string;
        }[]
      >`
        select (select count(*)::int from appointments where patient_id = ${f.p} and practitioner_id = ${f.author}) as author_appt,
               (select count(*)::int from appointments where patient_id = ${f.p} and practitioner_id = ${f.treats}) as treats_appt,
               (select count(*)::int from appointments where patient_id = ${f.p} and practitioner_2_id = ${f.second}
                   and practitioner_id <> ${f.second}) as second_appt,
               (select count(*)::int from appointments where patient_2_id = ${f.p} and patient_id <> ${f.p}
                   and practitioner_id = ${f.pair}) as pair_appt,
               -- Every member of staff who has an appointment with P in any slot, or created P.
               (select string_agg(who, ',' order by who) from (
                  select distinct case u.id
                           when ${f.author}::uuid then 'author' when ${f.treats}::uuid then 'treats' when ${f.second}::uuid then 'second'
                           when ${f.pair}::uuid then 'pair' when ${f.owner}::uuid then 'owner' when ${f.reception}::uuid then 'reception'
                           else 'other' end as who
                    from users u
                   where u.tenant_id = ${f.tenant}
                     and (exists (select 1 from patients p where p.id = ${f.p} and p.created_by = u.id)
                          or exists (select 1 from appointments a
                                      where (a.patient_id = ${f.p} or a.patient_2_id = ${f.p})
                                        and (a.practitioner_id = u.id or a.practitioner_2_id = u.id)))) t) as ties,
               (select created_by::text from patients where id = ${f.p}) as maker,
               (select created_by::text from patients where id = ${f.q}) as q_maker,
               (select count(*)::int from appointments where patient_id = ${f.q} or patient_2_id = ${f.q}) as q_appts,
               (select count(*)::int from patients where tenant_id = ${f.tenant} and created_by = ${f.careTeam} and id <> ${f.p}) as care_team_made,
               (select (select count(*) from patients where created_by = ${f.owner})::int
                     + (select count(*) from appointments where ${f.owner} in (practitioner_id, practitioner_2_id))::int) as owner_ties,
               (select string_agg(status::text, ',' order by status::text) from clinical_records where patient_id = ${f.p}) as statuses,
               (select string_agg(coalesce((practitioner_id = ${f.author})::text, 'none'), ',' order by status::text, practitioner_id)
                  from clinical_records where patient_id = ${f.p}) as authors,
               (select practitioner_id::text from clinical_records where id = ${f.qSigned}) as q_author,
               (select tenant_id::text from clinical_records where id = ${f.foreignSigned}) as foreign_tenant`;
      return {
        ...r,
        makerIsReception: r!.maker === f.reception,
        qMakerIsMaker: r!.q_maker === f.maker,
        qAuthorIsAuthor: r!.q_author === f.author,
        foreignIsOther: r!.foreign_tenant === f.other,
      };
    });
    expect(out).toMatchObject({
      author_appt: 2,
      treats_appt: 1,
      second_appt: 1,
      pair_appt: 1,
      // The owner, the care-team therapist, `maker` and `untied` are not among them.
      ties: "author,pair,reception,second,treats",
      makerIsReception: true,
      qMakerIsMaker: true,
      q_appts: 0,
      care_team_made: 1,
      owner_ties: 0,
      statuses: "draft,locked,signed,signed",
      authors: "true,true,true,none",
      qAuthorIsAuthor: true,
      foreignIsOther: true,
    });
  });

  it("PREMISE: who reads the signed registo, as authenticated with their own claims", async () => {
    const out = await scenario(async ({ f, tx, become }) => {
      const seen: Record<string, number> = {};
      for (const [label, role, user] of [
        ["owner", "owner", f.owner],
        ["author", "therapist", f.author],
        ["admin", "admin", f.admin],
        ["author's user id as admin", "admin", f.author],
        ["admin elsewhere", "admin", f.adminElsewhere],
        ["reception", "reception", f.reception],
        ["treats", "therapist", f.treats],
        ["care team", "therapist", f.careTeam],
        ["untied", "therapist", f.untied],
        ["maker", "therapist", f.maker],
      ] as const) {
        await tx.unsafe("reset role");
        await become(role, user);
        const [r] = await tx<{ n: number }[]>`select count(*)::int as n from clinical_records where id = ${f.signed}`;
        seen[label] = r!.n;
      }
      return seen;
    });
    expect(out).toEqual({
      owner: 1,
      author: 1,
      admin: 1,
      "author's user id as admin": 1,
      "admin elsewhere": 0,
      reception: 0,
      treats: 1,
      "care team": 1,
      untied: 0,
      maker: 0,
    });
  });

  /* ---- the callers the policy admits ------------------------------------ */
  it("the owner, in their own name, annuls a signed registo a therapist authored (both sides)", async () => {
    expect(await attempt({ role: "owner", user: "owner" }, { record: "signed", by: "owner" })).toBe(1);
  });

  it("the owner, in their own name, annuls a signed registo that has no author (both sides)", async () => {
    expect(await attempt({ role: "owner", user: "owner" }, { record: "unauthored", by: "owner" })).toBe(1);
  });

  it("the registo's author, in their own name, annuls their own signed registo (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "author" }, { record: "signed", by: "author" })).toBe(1);
  });

  it("the registo's author annuls their own signed registo of a patient they neither treat nor created (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "author" }, { record: "qSigned", by: "author" })).toBe(1);
  });

  it("a therapist with an appointment with the patient annuls a signed registo a colleague authored (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "treats" }, { record: "signed", by: "treats" })).toBe(1);
  });

  it("the second practitioner of an appointment with the patient annuls a signed registo a colleague authored (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "second" }, { record: "signed", by: "second" })).toBe(1);
  });

  it("a therapist whose appointment has the patient in its second slot annuls a signed registo a colleague authored (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "pair" }, { record: "signed", by: "pair" })).toBe(1);
  });

  it("a therapist who created the patient annuls a signed registo a colleague authored (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "maker" }, { record: "qSigned", by: "maker" })).toBe(1);
  });

  it("a therapist who treats the patient annuls a signed registo that has no author (both sides)", async () => {
    expect(await attempt({ role: "therapist", user: "treats" }, { record: "unauthored", by: "treats" })).toBe(1);
  });

  it("the author's INSERT ... RETURNING returns the row, naming them (both sides)", async () => {
    const out = await scenario(async ({ f, tx, become }) => {
      await become("therapist", f.author);
      const rows = await tx<{ annulled_by_user_id: string; record_id: string }[]>`
        insert into record_annulments (tenant_id, record_id, annulled_by_user_id, reason)
        values (${f.tenant}, ${f.signed}, ${f.author}, 'registo errado')
        returning annulled_by_user_id::text as annulled_by_user_id, record_id::text as record_id`;
      return { rows, author: f.author, signed: f.signed };
    });
    expect(out.rows).toEqual([{ annulled_by_user_id: out.author, record_id: out.signed }]);
  });

  /* ---- the role: each kind of session the policy does not admit --------- */
  itRuled(ruled("R01", "a receptionist's INSERT is refused (42501)"), async () => {
    await refused(attempt({ role: "reception", user: "reception" }, { record: "signed", by: "reception" }));
  });

  itRuled(ruled("R02", "an admin who reads the registo is refused (42501)"), async () => {
    await refused(attempt({ role: "admin", user: "admin" }, { record: "signed", by: "admin" }));
  });

  itRuled(ruled("R03", "an admin who does not read the registo is refused (42501)"), async () => {
    await refused(attempt({ role: "admin", user: "adminElsewhere" }, { record: "signed", by: "adminElsewhere" }));
  });

  // This therapist reads the registo (PREMISE) and is the therapist of another
  // patient of the tenant, so the attempt reaches the two therapist terms and
  // is refused by them alone: neither is true of THIS registo and ITS patient.
  itRuled(ruled("R04", "a therapist on the patient's care team, who reads the registo and treats another patient, is refused (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "careTeam" }, { record: "signed", by: "careTeam" }));
    await refused(attempt({ role: "therapist", user: "careTeam" }, { record: "unauthored", by: "careTeam" }));
  });

  itRuled(ruled("R05", "a therapist with no tie to the patient is refused (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "untied" }, { record: "signed", by: "untied" }));
  });

  itRuled(ruled("R06", "a therapist with no tie to the patient is refused on a signed registo that has no author (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "untied" }, { record: "unauthored", by: "untied" }));
  });

  // Under the admin role this user id reads the registo (PREMISE), authored it
  // and has an appointment with its patient, so the first attempt reaches the
  // role term with both therapist terms true. The other two read no registo.
  itRuled(ruled("R07", "the author's user id under a role that is not therapist or owner is refused (42501)"), async () => {
    await refused(attempt({ role: "admin", user: "author" }, { record: "signed", by: "author" }));
    await refused(attempt({ role: "reception", user: "author" }, { record: "signed", by: "author" }));
    await refused(attempt({ role: "manager", user: "author" }, { record: "signed", by: "author" }));
  });

  /* ---- the row names the caller ----------------------------------------- */
  itRuled(ruled("R08", "a therapist's row naming another member of staff is refused (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "author" }, { record: "signed", by: "treats" }));
    await refused(attempt({ role: "therapist", user: "author" }, { record: "signed", by: "owner" }));
    await refused(attempt({ role: "therapist", user: "treats" }, { record: "signed", by: "author" }));
    await refused(attempt({ role: "therapist", user: "treats" }, { record: "signed", by: null }));
  });

  itRuled(ruled("R09", "the author's row naming nobody is refused (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "author" }, { record: "signed", by: null }));
  });

  itRuled(ruled("R10", "the owner's row naming another member of staff, or nobody, is refused (42501)"), async () => {
    await refused(attempt({ role: "owner", user: "owner" }, { record: "signed", by: "author" }));
    await refused(attempt({ role: "owner", user: "owner" }, { record: "signed", by: null }));
  });

  /* ---- the registo is signed -------------------------------------------- */
  itRuled(ruled("R11", "a draft is refused, for its author, for a therapist of the patient and for the owner (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "author" }, { record: "draft", by: "author" }));
    await refused(attempt({ role: "therapist", user: "treats" }, { record: "draft", by: "treats" }));
    await refused(attempt({ role: "owner", user: "owner" }, { record: "draft", by: "owner" }));
  });

  itRuled(ruled("R12", "a locked registo is refused, for its author, for a therapist of the patient and for the owner (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "author" }, { record: "locked", by: "author" }));
    await refused(attempt({ role: "therapist", user: "treats" }, { record: "locked", by: "treats" }));
    await refused(attempt({ role: "owner", user: "owner" }, { record: "locked", by: "owner" }));
  });

  /* ---- the patient is the registo's own --------------------------------- */
  itRuled(ruled("R15", "a therapist of one patient is refused on a signed registo of another patient (42501)"), async () => {
    await refused(attempt({ role: "therapist", user: "maker" }, { record: "signed", by: "maker" }));
    await refused(attempt({ role: "therapist", user: "treats" }, { record: "qSigned", by: "treats" }));
  });

  /* ---- the tenant ------------------------------------------------------- */
  it("a row of another tenant is refused, for the owner and for the author (42501, both sides)", async () => {
    for (const who of [
      { role: "owner", user: "owner" },
      { role: "therapist", user: "author" },
    ] as const) {
      await refused(
        scenario(async ({ f, tx, become }) => {
          await become(who.role, f[who.user]);
          return annuls(tx, f.other, f.foreignSigned, f[who.user]);
        }),
      );
    }
  });

  itRuled(ruled("R13", "a row of the owner's tenant that names another tenant's signed registo is refused (42501)"), async () => {
    await refused(attempt({ role: "owner", user: "owner" }, { record: "foreignSigned", by: "owner" }));
  });

  it("a session with no tenant in its claims writes nothing (42501, both sides)", async () => {
    await refused(
      scenario(async ({ f, tx }) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ user_role: "owner", sub: f.owner })}, true)`;
        await tx.unsafe("set local role authenticated");
        return annuls(tx, f.tenant, f.signed, f.owner);
      }),
    );
  });

  /* ---- the table privilege: the roles that hold none --------------------- */
  it("the patient role and anon hold no privilege on the table: 42501, permission denied (both sides)", async () => {
    for (const who of ["patient", "anon"] as const) {
      await expect(
        scenario(async ({ f, tx }) => {
          if (who === "patient") {
            await tx`select set_config('request.jwt.claims', ${patientClaims(f.tenant, f.p)}, true)`;
          }
          await tx.unsafe(`set local role ${who}`);
          return annuls(tx, f.tenant, f.signed, null);
        }),
        who,
      ).rejects.toMatchObject({
        code: "42501",
        message: expect.stringMatching(/permission denied for table record_annulments/),
      });
    }
  });

  /* ---- what the migration leaves as it was ------------------------------ */
  it("an annulment is never changed or removed by a staff session: UPDATE and DELETE touch no row (both sides)", async () => {
    const out = await scenario(async ({ f, tx, become }) => {
      await become("owner", f.owner);
      const written = await annuls(tx, f.tenant, f.signed, f.owner);
      const updated = (await tx`update record_annulments set reason = 'outro' where record_id = ${f.signed}`).count;
      const deleted = (await tx`delete from record_annulments where record_id = ${f.signed}`).count;
      const [left] = await tx<{ n: number }[]>`select count(*)::int as n from record_annulments where record_id = ${f.signed}`;
      return { written, updated, deleted, left: left!.n };
    });
    expect(out).toEqual({ written: 1, updated: 0, deleted: 0, left: 1 });
  });

  it("every staff role of the tenant reads the annulment, and another tenant's session does not (both sides)", async () => {
    const out = await scenario(async ({ f, tx, become }) => {
      await tx`insert into record_annulments (tenant_id, record_id, annulled_by_user_id) values (${f.tenant}, ${f.signed}, ${f.owner})`;
      const seen: Record<string, number> = {};
      for (const [label, role, user, tenant] of [
        ["owner", "owner", f.owner, f.tenant],
        ["admin", "admin", f.admin, f.tenant],
        ["reception", "reception", f.reception, f.tenant],
        ["author", "therapist", f.author, f.tenant],
        ["other tenant", "owner", f.foreignOwner, f.other],
      ] as const) {
        await tx.unsafe("reset role");
        await become(role, user, tenant);
        const [r] = await tx<{ n: number }[]>`select count(*)::int as n from record_annulments where record_id = ${f.signed}`;
        seen[label] = r!.n;
      }
      return seen;
    });
    expect(out).toEqual({ owner: 1, admin: 1, reception: 1, author: 1, "other tenant": 0 });
  });

  it("annulling leaves the registo's own row unchanged (both sides)", async () => {
    const out = await scenario(async ({ f, tx, become }) => {
      const [before] = await tx<{ row: string }[]>`select md5((c.*)::text) as row from clinical_records c where c.id = ${f.signed}`;
      await become("therapist", f.author);
      await annuls(tx, f.tenant, f.signed, f.author);
      await tx.unsafe("reset role");
      const [after] = await tx<{ row: string }[]>`select md5((c.*)::text) as row from clinical_records c where c.id = ${f.signed}`;
      return { before: before!.row, after: after!.row };
    });
    expect(out.after).toBe(out.before);
  });

  it("the table carries two policies, SELECT and INSERT for authenticated, both PERMISSIVE, and none for UPDATE or DELETE (both sides)", async () => {
    const rows = await sql<{ polname: string; cmd: string; permissive: boolean; to_roles: string }[]>`
      select p.polname::text as polname, p.polcmd::text as cmd, p.polpermissive as permissive,
             coalesce(array_to_string(array(select pg_get_userbyid(r) from unnest(p.polroles) r order by 1), ','), '') as to_roles
        from pg_policy p
       where p.polrelid = 'public.record_annulments'::regclass
       order by 1`;
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { polname: INSERT_POLICY, cmd: "a", permissive: true, to_roles: "authenticated" },
      { polname: "record_annulments_tenant_select", cmd: "r", permissive: true, to_roles: "authenticated" },
    ]);
  });

  it("authenticated holds SELECT, INSERT, UPDATE and DELETE on the table, anon and patient hold nothing (both sides)", async () => {
    const [g] = await sql<{ auth: string; anon: string; patient: string }[]>`
      select (select coalesce(string_agg(v, ',' order by v), 'none') from unnest(array['SELECT','INSERT','UPDATE','DELETE']) v
               where has_table_privilege('authenticated', 'public.record_annulments', v)) as auth,
             (select coalesce(string_agg(v, ',' order by v), 'none') from unnest(array['SELECT','INSERT','UPDATE','DELETE']) v
               where has_table_privilege('anon', 'public.record_annulments', v)) as anon,
             (select coalesce(string_agg(v, ',' order by v), 'none') from unnest(array['SELECT','INSERT','UPDATE','DELETE']) v
               where has_table_privilege('patient', 'public.record_annulments', v)) as patient`;
    expect(g).toMatchObject({ auth: "DELETE,INSERT,SELECT,UPDATE", anon: "none", patient: "none" });
  });

  itRuled(ruled("R14", "the INSERT policy's expression carries the tenant term and the ruled terms, each nullary helper call wrapped"), async () => {
    const [p] = await sql<{ chk: string; qual: string | null }[]>`
      select pg_get_expr(polwithcheck, polrelid) as chk, pg_get_expr(polqual, polrelid) as qual
        from pg_policy
       where polrelid = 'public.record_annulments'::regclass and polname = ${INSERT_POLICY}`;
    expect(p!.qual).toBeNull();
    expect(p!.chk).toContain("tenant_id = ( SELECT jwt_tenant_id()");
    for (const term of RULED_TERMS) expect(p!.chk).toContain(term);
    // Every helper call sits in a scalar subquery, so it is evaluated once per statement.
    const bare = p!.chk.replace(/\(\s*SELECT\s+(?:auth\.uid|(?:public\.)?jwt_role|(?:public\.)?jwt_tenant_id)\(\)[^)]*\)/g, "");
    expect(bare).not.toMatch(/uid\(\)|jwt_role\(\)|jwt_tenant_id\(\)/);
  });
});
