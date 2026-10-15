/**
 * survey-list.db.test.ts: SAT-01 (spec 7.3). THE SURVEY LIST IN COMUNICAÇÕES,
 * READ BY EACH REAL ROLE AGAINST REAL ROWS AND REAL RLS.
 *
 * `listSurveySends` reads the sends, and their answers, in the viewer's own
 * session (`runScoped`), so migration 0102's two SELECT policies decide every
 * row. What only a database can say, and what this suite measures:
 *
 *   1. WHAT EACH ROLE SEES. The owner, every send and every answer of the
 *      tenant. Admin and reception, the sends and answers of appointments at
 *      their clinics, and nothing of another clinic. Reception with no clinic,
 *      nothing. A therapist, the sends of the patients they treat; an answer
 *      ONLY for a visit they attended at one of their own clinics.
 *   2. AN ANSWER THE VIEWER MAY NOT READ IS NAMED AND NOT SHOWN. The row says
 *      "Com resposta" and the reserved sentence; the scores, the comment and
 *      the contact choice are not in what the read returned.
 *   3. NO CONTACT DETAIL, FOR ANYONE: no patient email or telephone number is
 *      in any role's result.
 *   4. A SECOND TENANT SEES NOTHING OF THE FIRST, and the first nothing of it.
 *   5. WHILE THE SURVEY IS SWITCHED OFF THERE IS NO LIST, for any role, for
 *      off, unset and near-miss values. Under canary the list is whole: staff
 *      see the sends of every patient, with no list of patients consulted.
 *   6. THE MONTH FILTER is the Lisbon calendar month of the send.
 *   7. ONE PATIENT'S SENDS, FOR THE FICHA (S11, spec 7.7). The same read asked
 *      for one patient (`readPatientSurveyRows`, lib/patients/survey-rows.ts)
 *      gives each role exactly the rows the list gives them for that patient:
 *      the same sends, the same answers, the same reserved ones. It narrows
 *      and opens nothing, in this tenant or the other, and while the survey is
 *      switched off it gives nobody anything.
 *
 * NEVER ON AN EMPTY FIXTURE. Every "sees nothing" arm stands beside a count of
 * what is there, read on the admin connection, and beside a role that does see
 * it. Each role runs with its real claims: role, tenant and user id.
 *
 * WHAT IS STUBBED: nothing of the read. `server-only` (a build-time marker) and
 * `next/cache`. `runScoped`, RLS, every policy and every join are real.
 *
 * EVERY COUNT IS OF THIS SUITE'S OWN TENANTS. The rows are written on the admin
 * connection, straight into the tables, as `hard-delete-survey.db.test.ts`
 * writes its own; no door is called. THE FIXTURE IS BUILT, NEVER BORROWED: two
 * tenants of its own, removed afterwards. Invented names, addresses and
 * numbers only. It globs into `.github/workflows/db-tests.yml` with every
 * `.db.test.ts` of this workspace and self-skips without DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  updateTag: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

type Role = "owner" | "admin" | "reception" | "therapist";
type Ctx = { tenantId: string; role: Role; userId: string };

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SAT-01: the survey list in Comunicações, as each real role, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let listSurveySends: typeof import("./survey-list").listSurveySends;
  let toSurveyListRow: typeof import("./survey-list-core").toSurveyListRow;
  let readPatientSurveyRows: typeof import("../patients/survey-rows").readPatientSurveyRows;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const run = tenant.slice(0, 8);
  const clinicA = randomUUID();
  const clinicB = randomUUID();
  const otherClinic = randomUUID();

  const owner = randomUUID();
  const adminA = randomUUID();
  const receptionA = randomUUID();
  const receptionB = randomUUID();
  const receptionNone = randomUUID();
  const therapist1 = randomUUID();
  const therapist2 = randomUUID();
  const otherOwner = randomUUID();

  const ctxOf = (role: Role, userId: string, tenantId = tenant): Ctx => ({ tenantId, role, userId });
  const OWNER = ctxOf("owner", owner);
  const ADMIN_A = ctxOf("admin", adminA);
  const RECEPTION_A = ctxOf("reception", receptionA);
  const RECEPTION_B = ctxOf("reception", receptionB);
  const RECEPTION_NONE = ctxOf("reception", receptionNone);
  const THERAPIST_1 = ctxOf("therapist", therapist1);
  const THERAPIST_2 = ctxOf("therapist", therapist2);
  const OTHER_OWNER = ctxOf("owner", otherOwner, otherTenant);
  const EVERY_ROLE: Array<[string, Ctx]> = [
    ["owner", OWNER],
    ["admin A", ADMIN_A],
    ["reception A", RECEPTION_A],
    ["reception B", RECEPTION_B],
    ["reception with no clinic", RECEPTION_NONE],
    ["therapist 1", THERAPIST_1],
    ["therapist 2", THERAPIST_2],
  ];

  const rowsOf = <T>(result: unknown): T[] =>
    (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[];
  const one = async <T>(query: ReturnType<typeof raw>): Promise<T> =>
    rowsOf<T>(await db.execute(query))[0]!;

  /**
   * THE SENDS OF THE FIXTURE. Each is one patient's one visit.
   *
   *   key      clinic  therapist   sent (UTC)            origin     outcome     what it is for
   *   own      A       1           2026-05-24 10:00      manual     answered    therapist 1 attended at their own clinic
   *   colleague A      2           2026-06-10 10:00      automatic  answered    a colleague's visit, another patient
   *   elsewhere B      2           2026-06-11 10:00      automatic  answered    therapist 2 attended at a clinic that is not theirs
   *   shared   A       2           2026-06-30 23:30      automatic  answered    the patient of `own`, seen by the colleague
   *   open     A       1           2026-07-15 10:00      automatic  (none)      nobody answered
   *   refused  A       1           2026-08-02 10:00      automatic  opted_out   the patient refused from the link
   *   purged   A       1           2024-01-05 10:00      automatic  answered    the comment was deleted by retention
   *
   * `shared` is sent at 23:30 UTC on 30 June, which is 00:30 on 1 July in
   * Lisbon: the month filter's boundary case.
   */
  type Send = {
    key: string;
    id: string;
    patient: string;
    visit: string;
    clinic: string;
    therapist: string;
    sentAt: string;
    origin: "automatic" | "manual";
    channel: "email" | "sms";
    outcome: "answered" | "opted_out" | null;
    /** The answer's comment marker, or null for no comment written or kept. */
    comment: string | null;
    consent: boolean;
    purged: boolean;
  };
  const P1 = randomUUID();
  const sends: Send[] = [
    { key: "own", patient: P1, clinic: clinicA, therapist: therapist1, sentAt: "2026-05-24T10:00:00Z", origin: "manual", channel: "email", outcome: "answered", comment: `COMENTARIO-OWN-${run}`, consent: true, purged: false },
    { key: "colleague", patient: randomUUID(), clinic: clinicA, therapist: therapist2, sentAt: "2026-06-10T10:00:00Z", origin: "automatic", channel: "sms", outcome: "answered", comment: `COMENTARIO-COLLEAGUE-${run}`, consent: false, purged: false },
    { key: "elsewhere", patient: randomUUID(), clinic: clinicB, therapist: therapist2, sentAt: "2026-06-11T10:00:00Z", origin: "automatic", channel: "email", outcome: "answered", comment: `COMENTARIO-ELSEWHERE-${run}`, consent: true, purged: false },
    { key: "shared", patient: P1, clinic: clinicA, therapist: therapist2, sentAt: "2026-06-30T23:30:00Z", origin: "automatic", channel: "email", outcome: "answered", comment: `COMENTARIO-SHARED-${run}`, consent: true, purged: false },
    { key: "open", patient: randomUUID(), clinic: clinicA, therapist: therapist1, sentAt: "2026-07-15T10:00:00Z", origin: "automatic", channel: "email", outcome: null, comment: null, consent: false, purged: false },
    { key: "refused", patient: randomUUID(), clinic: clinicA, therapist: therapist1, sentAt: "2026-08-02T10:00:00Z", origin: "automatic", channel: "sms", outcome: "opted_out", comment: null, consent: false, purged: false },
    { key: "purged", patient: randomUUID(), clinic: clinicA, therapist: therapist1, sentAt: "2024-01-05T10:00:00Z", origin: "automatic", channel: "email", outcome: "answered", comment: null, consent: false, purged: true },
  ].map((s) => ({ ...s, id: randomUUID(), visit: randomUUID() }) as Send);
  const byKey = (key: string) => sends.find((s) => s.key === key)!;
  /** Newest first, as the list orders them. */
  const NEWEST_FIRST = ["refused", "open", "shared", "elsewhere", "colleague", "own", "purged"];
  const ANSWERED = sends.filter((s) => s.outcome === "answered").map((s) => s.key);
  const COMMENTS = sends.filter((s) => s.comment).map((s) => s.comment!);

  // A send and an answer of the OTHER tenant.
  const otherPatient = randomUUID();
  const otherVisit = randomUUID();
  const otherSend = randomUUID();
  const OTHER_COMMENT = `COMENTARIO-OUTRO-INQUILINO-${run}`;

  const EMAIL_MARK = `@sat01list-${run}.test`;
  const PHONE_MARK = "+35193077";

  const keyOf = new Map<string, string>();
  /** What a role's list holds: the keys in order, and per key how the answer reads. */
  async function listed(ctx: Ctx, opts: { month?: string } = {}) {
    const page = await listSurveySends(ctx, opts);
    const keys = page.rows.map((r) => keyOf.get(r.sendId) ?? `UNKNOWN ${r.sendId}`);
    const answers = Object.fromEntries(
      page.rows.map((r) => [keyOf.get(r.sendId) ?? r.sendId, toSurveyListRow(r).answer]),
    );
    return { page, keys, answers, json: JSON.stringify(page) };
  }

  const savedMode = process.env.SURVEY_SEND_MODE;
  const savedCanary = process.env.SURVEY_CANARY_PATIENT_IDS;

  beforeAll(async () => {
    const schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    ({ listSurveySends } = await import("./survey-list"));
    ({ toSurveyListRow } = await import("./survey-list-core"));
    ({ readPatientSurveyRows } = await import("../patients/survey-rows"));
    for (const s of sends) keyOf.set(s.id, s.key);
    keyOf.set(otherSend, "OTHER TENANT");

    for (const [id, label] of [
      [tenant, "a"],
      [otherTenant, "b"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug)
            values (${id}::uuid, ${`sat01 list ${label}`}, ${`sat01list-${label}-${run}`})`,
      );
    }
    await db.execute(
      raw`insert into locations (id, tenant_id, name)
          values (${clinicA}::uuid, ${tenant}::uuid, ${`Clinica A ${run}`}),
                 (${clinicB}::uuid, ${tenant}::uuid, ${`Clinica B ${run}`}),
                 (${otherClinic}::uuid, ${otherTenant}::uuid, ${`Clinica Alheia ${run}`})`,
    );
    for (const [id, label, t] of [
      [owner, "owner", tenant],
      [adminA, "admin-a", tenant],
      [receptionA, "reception-a", tenant],
      [receptionB, "reception-b", tenant],
      [receptionNone, "reception-none", tenant],
      [therapist1, "therapist-1", tenant],
      [therapist2, "therapist-2", tenant],
      [otherOwner, "other-owner", otherTenant],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${t}::uuid, ${`${label}-${run}@sat01list-staff.test`}, ${`${label} ${run}`})`,
      );
    }
    // Each member of staff's ONLY clinic. Both therapists are at clinic A only;
    // reception-none has none, which under S7 reads nothing.
    for (const [userId, locationId] of [
      [adminA, clinicA],
      [receptionA, clinicA],
      [receptionB, clinicB],
      [therapist1, clinicA],
      [therapist2, clinicA],
    ] as const) {
      await db.execute(
        raw`insert into staff_locations (tenant_id, user_id, location_id)
            values (${tenant}::uuid, ${userId}::uuid, ${locationId}::uuid)`,
      );
    }

    // One patient per distinct id, each with an email and a telephone number
    // that carry this run's marks, so a contact detail in a result is findable.
    const patientClinic = new Map<string, string>();
    for (const s of sends) if (!patientClinic.has(s.patient)) patientClinic.set(s.patient, s.clinic);
    let n = 0;
    for (const [id, clinic] of patientClinic) {
      n += 1;
      await db.execute(
        raw`insert into patients (id, tenant_id, full_name, email, phone, primary_location_id)
            values (${id}::uuid, ${tenant}::uuid, ${`Paciente Lista ${run} ${n}`},
                    ${`paciente-${n}${EMAIL_MARK}`}, ${`${PHONE_MARK}${String(n).padStart(4, "0")}`}, ${clinic}::uuid)`,
      );
      await db.execute(
        raw`insert into patient_locations (tenant_id, patient_id, location_id)
            values (${tenant}::uuid, ${id}::uuid, ${clinic}::uuid)`,
      );
    }
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, email, phone)
          values (${otherPatient}::uuid, ${otherTenant}::uuid, ${`Paciente Alheio ${run}`},
                  ${`alheio${EMAIL_MARK}`}, ${`${PHONE_MARK}9999`})`,
    );

    const insertVisit = (id: string, t: string, patient: string, practitioner: string, clinic: string, sentAt: string) => {
      // The visit ended 24 hours before its survey was sent.
      const ends = new Date(new Date(sentAt).getTime() - 24 * 3_600_000);
      return db.execute(
        raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, location_id,
                                      starts_at, ends_at, status)
            values (${id}::uuid, ${t}::uuid, ${patient}::uuid, ${practitioner}::uuid, ${clinic}::uuid,
                    ${new Date(ends.getTime() - 45 * 60_000).toISOString()}::timestamptz,
                    ${ends.toISOString()}::timestamptz, 'completed'::appointment_status)`,
      );
    };
    const insertSend = (
      id: string, t: string, visit: string, patient: string, clinic: string,
      s: Pick<Send, "channel" | "origin" | "sentAt" | "outcome">, sentBy: string | null,
    ) =>
      db.execute(
        raw`insert into appointment_survey_sends
              (id, tenant_id, appointment_id, patient_id, location_id, channel, origin, sent_by, sent_at,
               consumed_at, outcome)
            values (${id}::uuid, ${t}::uuid, ${visit}::uuid, ${patient}::uuid, ${clinic}::uuid, ${s.channel},
                    ${s.origin}, ${sentBy}::uuid, ${s.sentAt}::timestamptz,
                    ${s.outcome ? raw`${s.sentAt}::timestamptz + interval '1 day'` : raw`null`}, ${s.outcome})`,
      );
    const insertAnswer = (
      t: string, send: string, visit: string, patient: string, clinic: string, practitioner: string,
      s: Pick<Send, "channel" | "sentAt" | "comment" | "consent" | "purged">,
    ) =>
      db.execute(
        raw`insert into appointment_survey_responses
              (tenant_id, send_id, appointment_id, patient_id, location_id, practitioner_id,
               nps, rating, comment, comment_purged_at, contact_consent, consent_version, channel, sent_at,
               submitted_at)
            values (${t}::uuid, ${send}::uuid, ${visit}::uuid, ${patient}::uuid, ${clinic}::uuid,
                    ${practitioner}::uuid, 9, 4, ${s.comment},
                    ${s.purged ? raw`${s.sentAt}::timestamptz + interval '25 months'` : raw`null`},
                    ${s.consent}, 'sat01-list-fixture', ${s.channel}, ${s.sentAt}::timestamptz,
                    ${s.sentAt}::timestamptz + interval '1 day')`,
      );

    for (const s of sends) {
      await insertVisit(s.visit, tenant, s.patient, s.therapist, s.clinic, s.sentAt);
      await insertSend(s.id, tenant, s.visit, s.patient, s.clinic, s, s.origin === "manual" ? receptionA : null);
      if (s.outcome === "answered") {
        await insertAnswer(tenant, s.id, s.visit, s.patient, s.clinic, s.therapist, s);
      }
    }
    const other = { channel: "email", origin: "automatic", sentAt: "2026-06-12T10:00:00Z", outcome: "answered", comment: OTHER_COMMENT, consent: true, purged: false } as const;
    await insertVisit(otherVisit, otherTenant, otherPatient, otherOwner, otherClinic, other.sentAt);
    await insertSend(otherSend, otherTenant, otherVisit, otherPatient, otherClinic, other, null);
    await insertAnswer(otherTenant, otherSend, otherVisit, otherPatient, otherClinic, otherOwner, other);
  });

  afterAll(async () => {
    if (savedMode === undefined) delete process.env.SURVEY_SEND_MODE;
    else process.env.SURVEY_SEND_MODE = savedMode;
    if (savedCanary === undefined) delete process.env.SURVEY_CANARY_PATIENT_IDS;
    else process.env.SURVEY_CANARY_PATIENT_IDS = savedCanary;
    if (!db) return;
    const both = raw`(${tenant}::uuid, ${otherTenant}::uuid)`;
    const statements = [
      raw`delete from appointment_survey_responses where tenant_id in ${both}`,
      raw`delete from appointment_survey_sends where tenant_id in ${both}`,
      raw`delete from appointments where tenant_id in ${both}`,
      raw`delete from audit_log where tenant_id in ${both}`,
      raw`delete from patient_locations where tenant_id in ${both}`,
      raw`delete from patients where tenant_id in ${both}`,
      raw`delete from staff_locations where tenant_id in ${both}`,
      raw`delete from users where tenant_id in ${both}`,
      raw`delete from locations where tenant_id in ${both}`,
      raw`delete from tenants where id in ${both}`,
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

  beforeEach(() => {
    process.env.SURVEY_SEND_MODE = "on";
    delete process.env.SURVEY_CANARY_PATIENT_IDS;
  });

  /* ================================================================== */
  /* PREMISE: THE FIXTURE IS THERE                                       */
  /* ================================================================== */

  it("PREMISE: the fixture holds seven sends and five answers in one tenant, and one of each in the other", async () => {
    expect(
      await one(raw`
        select
          (select count(*)::int from appointment_survey_sends where tenant_id = ${tenant}::uuid) as sends,
          (select count(*)::int from appointment_survey_responses where tenant_id = ${tenant}::uuid) as answers,
          (select count(*)::int from appointment_survey_responses
            where tenant_id = ${tenant}::uuid and comment is not null) as comments,
          (select count(*)::int from appointment_survey_sends where tenant_id = ${otherTenant}::uuid) as other_sends,
          (select count(*)::int from appointment_survey_responses where tenant_id = ${otherTenant}::uuid) as other_answers
      `),
    ).toEqual({ sends: 7, answers: 5, comments: 4, other_sends: 1, other_answers: 1 });
    expect(ANSWERED).toEqual(["own", "colleague", "elsewhere", "shared", "purged"]);
    expect(COMMENTS).toHaveLength(4);
  });

  /* ================================================================== */
  /* 1 AND 2. WHAT EACH ROLE SEES                                        */
  /* ================================================================== */

  it("the owner sees every send of the tenant, newest first, and reads every answer", async () => {
    const got = await listed(OWNER);
    expect(got.keys).toEqual(NEWEST_FIRST);
    expect(got.page.total).toBe(7);
    expect(got.answers).toEqual({
      refused: "open",
      open: "open",
      shared: "shown",
      elsewhere: "shown",
      colleague: "shown",
      own: "shown",
      purged: "shown",
    });
    for (const comment of COMMENTS) expect(got.json).toContain(comment);
  });

  it("the owner's rows carry what the page shows: who sent, the visit, the therapist, the clinic, the answer", async () => {
    const got = await listed(OWNER);
    const row = (key: string) => toSurveyListRow(got.page.rows.find((r) => r.sendId === byKey(key).id)!);

    const own = row("own");
    expect(own.send).toBe(`24/05/2026, por reception-a ${run}`);
    expect(own.visit).toBe("23/05/2026");
    expect(own.therapist).toBe(`therapist-1 ${run}`);
    expect(own.clinic).toBe(`Clinica A ${run}`);
    expect(own.patientName).toMatch(new RegExp(`^Paciente Lista ${run} \\d+$`));
    expect(own.patientHref).toBe(`/patients/${P1}`);
    expect(own.answerState).toBe("Com resposta");
    expect(own.nps).toBe("9");
    expect(own.rating).toBe("4");
    expect(own.comment).toBe(`COMENTARIO-OWN-${run}`);
    expect(own.contact).toBe("Sim");
    expect(own.channel).toBe("Email");
    expect(own.answeredAt).toBe("25/05/2026, 11:00");

    const colleague = row("colleague");
    expect(colleague.send).toBe("10/06/2026, automático");
    expect(colleague.channel).toBe("SMS");
    expect(colleague.contact).toBe("Não");

    expect(row("elsewhere").clinic).toBe(`Clinica B ${run}`);
    expect(row("purged").comment).toBe("Comentário apagado ao fim de 24 meses.");
    expect(row("open").answerState).toBe("Sem resposta");
    expect(row("open").comment).toBe("-");
    expect(row("refused").answerState).toBe("Sem resposta");
  });

  it.each([
    ["an admin at clinic A", () => ADMIN_A],
    ["reception at clinic A", () => RECEPTION_A],
  ] as const)("%s sees the sends and answers of clinic A, and nothing of clinic B", async (_name, who) => {
    const got = await listed(who());
    expect(got.keys).toEqual(["refused", "open", "shared", "colleague", "own", "purged"]);
    expect(got.page.total).toBe(6);
    expect(got.answers).toEqual({
      refused: "open",
      open: "open",
      shared: "shown",
      colleague: "shown",
      own: "shown",
      purged: "shown",
    });
    // Clinic B's answer is not there, in any form.
    expect(got.json).not.toContain(`COMENTARIO-ELSEWHERE-${run}`);
    expect(got.json).not.toContain(byKey("elsewhere").id);
  });

  it("reception at clinic B sees clinic B's one send and its answer, and nothing of clinic A", async () => {
    const got = await listed(RECEPTION_B);
    expect(got.keys).toEqual(["elsewhere"]);
    expect(got.answers).toEqual({ elsewhere: "shown" });
    expect(got.json).toContain(`COMENTARIO-ELSEWHERE-${run}`);
    for (const key of ["own", "colleague", "shared"]) {
      expect(got.json, key).not.toContain(byKey(key).comment!);
    }
  });

  it("reception with no clinic sees nothing, while the rows are there for the owner", async () => {
    const got = await listed(RECEPTION_NONE);
    expect(got.keys).toEqual([]);
    expect(got.page.total).toBe(0);
    // CONTROL: the same read, the same moment, as the owner.
    expect((await listed(OWNER)).page.total).toBe(7);
  });

  it("THERAPIST 1 sees the sends of the patients they treat, and reads an answer only for a visit they attended", async () => {
    const got = await listed(THERAPIST_1);
    // Not `colleague` (another therapist's patient) and not `elsewhere`.
    expect(got.keys).toEqual(["refused", "open", "shared", "own", "purged"]);
    expect(got.answers).toEqual({
      refused: "open",
      open: "open",
      // Their patient, seen that day by the colleague: answered, and reserved.
      shared: "reserved",
      own: "shown",
      purged: "shown",
    });
    expect(got.json).toContain(`COMENTARIO-OWN-${run}`);
    // THE COMMENT OF THE VISIT THEY DID NOT ATTEND NEVER LEFT THE DATABASE.
    expect(got.json).not.toContain(`COMENTARIO-SHARED-${run}`);
    expect(got.json).not.toContain(`COMENTARIO-COLLEAGUE-${run}`);
    expect(got.json).not.toContain(`COMENTARIO-ELSEWHERE-${run}`);

    const shared = got.page.rows.find((r) => r.sendId === byKey("shared").id)!;
    expect(shared.answer).toBeNull();
    expect(shared.outcome).toBe("answered");
    const view = toSurveyListRow(shared);
    expect(view.answerState).toBe("Com resposta");
    expect([view.nps, view.rating, view.comment, view.contact, view.answeredAt]).toEqual(["-", "-", "-", "-", "-"]);
    // The send's own cells still read, and so does the visit of a patient they treat.
    expect(view.send).toBe("01/07/2026, automático");
    expect(view.clinic).toBe(`Clinica A ${run}`);
    // The visit began at 22:45 UTC on 29 June, which is 23:45 that day in Lisbon.
    expect(view.visit).toBe("29/06/2026");
    expect(view.therapist).toBe(`therapist-2 ${run}`);
  });

  it("THERAPIST 2 reads the answers of the visits they attended at their own clinic, and not the one at another clinic", async () => {
    const got = await listed(THERAPIST_2);
    // They treat the patient of `own` too (the `shared` visit), so that send shows.
    expect(got.keys).toEqual(["shared", "elsewhere", "colleague", "own"]);
    expect(got.answers).toEqual({
      shared: "shown",
      // Attended, at a clinic that is not theirs: reserved (S7: "within their own clinics").
      elsewhere: "reserved",
      colleague: "shown",
      // The same patient's earlier visit, with therapist 1: reserved.
      own: "reserved",
    });
    expect(got.json).toContain(`COMENTARIO-SHARED-${run}`);
    expect(got.json).toContain(`COMENTARIO-COLLEAGUE-${run}`);
    expect(got.json).not.toContain(`COMENTARIO-OWN-${run}`);
    expect(got.json).not.toContain(`COMENTARIO-ELSEWHERE-${run}`);
  });

  it("no role reads a comment through a row it reads as reserved, and the answer rows read equal the database's own policy", async () => {
    for (const [name, ctx] of EVERY_ROLE) {
      const got = await listed(ctx);
      for (const r of got.page.rows) {
        const s = byKey(keyOf.get(r.sendId)!);
        if (r.answer === null && s.comment) expect(got.json, `${name} ${s.key}`).not.toContain(s.comment);
        if (r.answer !== null) expect(s.outcome, `${name} ${s.key}`).toBe("answered");
      }
    }
  });

  /* ================================================================== */
  /* 3. NO CONTACT DETAIL                                                */
  /* ================================================================== */

  it("no role's list carries a patient's email or telephone number", async () => {
    // PREMISE: the fixture patients do have both, with this run's marks.
    expect(
      await one(raw`
        select count(*)::int as n from patients
         where tenant_id = ${tenant}::uuid and email like ${`%${EMAIL_MARK}`} and phone like ${`${PHONE_MARK}%`}`),
    ).toEqual({ n: 6 });
    let rowsSeen = 0;
    for (const [name, ctx] of EVERY_ROLE) {
      const got = await listed(ctx);
      rowsSeen += got.page.rows.length;
      expect(got.json, name).not.toContain(EMAIL_MARK);
      expect(got.json, name).not.toContain(PHONE_MARK);
      expect(got.json, name).not.toContain("@sat01list-staff.test");
    }
    // NOT VACUOUS: those results held rows.
    expect(rowsSeen).toBe(7 + 6 + 6 + 1 + 0 + 5 + 4);
  });

  /* ================================================================== */
  /* 4. A SECOND TENANT                                                  */
  /* ================================================================== */

  it("the other tenant's owner sees their own one send and nothing of this tenant", async () => {
    const got = await listed(OTHER_OWNER);
    expect(got.keys).toEqual(["OTHER TENANT"]);
    expect(got.page.total).toBe(1);
    expect(got.json).toContain(OTHER_COMMENT);
    for (const s of sends) {
      expect(got.json, s.key).not.toContain(s.id);
      if (s.comment) expect(got.json, s.key).not.toContain(s.comment);
    }
    expect(got.json).not.toContain(`Paciente Lista ${run}`);
  });

  it("no role of this tenant sees the other tenant's send, answer or patient", async () => {
    for (const [name, ctx] of EVERY_ROLE) {
      const got = await listed(ctx);
      expect(got.json, name).not.toContain(otherSend);
      expect(got.json, name).not.toContain(OTHER_COMMENT);
      expect(got.json, name).not.toContain(`Paciente Alheio ${run}`);
    }
  });

  it("a role whose claims name the other tenant reads that tenant only, whatever user id it carries", async () => {
    // This tenant's owner id, under the other tenant's claim: the tenant wall is
    // the claim, and nothing of the first tenant comes with the user id.
    const got = await listed(ctxOf("owner", owner, otherTenant));
    expect(got.keys).toEqual(["OTHER TENANT"]);
  });

  /* ================================================================== */
  /* 5. THE SWITCH                                                       */
  /* ================================================================== */

  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true"])(
    "SURVEY_SEND_MODE=%j: there is no list, for any role",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      for (const [name, ctx] of [...EVERY_ROLE, ["other owner", OTHER_OWNER] as [string, Ctx]]) {
        await expect(listSurveySends(ctx), name).rejects.toMatchObject({ name: "ForbiddenError" });
      }
      // CONTROL: the same read with the survey on.
      process.env.SURVEY_SEND_MODE = "on";
      expect((await listed(OWNER)).page.total).toBe(7);
    },
  );

  it("under canary the list is whole for every role, with no patient on the canary list", async () => {
    process.env.SURVEY_SEND_MODE = "canary";
    delete process.env.SURVEY_CANARY_PATIENT_IDS;
    expect((await listed(OWNER)).keys).toEqual(NEWEST_FIRST);
    expect((await listed(RECEPTION_A)).keys).toEqual(["refused", "open", "shared", "colleague", "own", "purged"]);
    expect((await listed(THERAPIST_1)).keys).toEqual(["refused", "open", "shared", "own", "purged"]);
    // A list naming one patient changes nothing a member of staff sees.
    process.env.SURVEY_CANARY_PATIENT_IDS = byKey("open").patient;
    expect((await listed(OWNER)).keys).toEqual(NEWEST_FIRST);
    expect((await listed(THERAPIST_1)).answers.shared).toBe("reserved");
  });

  /* ================================================================== */
  /* 6. THE MONTH FILTER                                                 */
  /* ================================================================== */

  it("the month filter is the Lisbon month of the send, and keeps each role's own rows", async () => {
    // `shared` was sent at 23:30 UTC on 30 June: 1 July in Lisbon.
    expect((await listed(OWNER, { month: "2026-06" })).keys).toEqual(["elsewhere", "colleague"]);
    expect((await listed(OWNER, { month: "2026-07" })).keys).toEqual(["open", "shared"]);
    expect((await listed(OWNER, { month: "2026-07" })).page.total).toBe(2);
    expect((await listed(OWNER, { month: "2024-01" })).keys).toEqual(["purged"]);
    // A month with no send: nothing, and the filter did not fall back to all.
    expect((await listed(OWNER, { month: "2025-03" })).keys).toEqual([]);
    // The filter narrows within what the role may read; it opens nothing.
    expect((await listed(RECEPTION_A, { month: "2026-06" })).keys).toEqual(["colleague"]);
    expect((await listed(RECEPTION_B, { month: "2026-07" })).keys).toEqual([]);
    expect((await listed(THERAPIST_1, { month: "2026-07" })).answers).toEqual({ open: "open", shared: "reserved" });
    // A value that is not a month is no filter.
    expect((await listed(OWNER, { month: "2026-13" })).keys).toEqual(NEWEST_FIRST);
  });

  /* ================================================================== */
  /* 7. ONE PATIENT'S SENDS, FOR THE FICHA                               */
  /* ================================================================== */

  /** What a role's ficha holds for one patient: the keys in order, and how each answer reads. */
  async function onFicha(ctx: Ctx, patientId: string) {
    const rows = await readPatientSurveyRows(ctx, patientId);
    if (rows === null) return { rows, keys: null, answers: null, json: "null" };
    const keys = rows.map((r) => keyOf.get(r.sendId) ?? `UNKNOWN ${r.sendId}`);
    const answers = Object.fromEntries(rows.map((r) => [keyOf.get(r.sendId) ?? r.sendId, toSurveyListRow(r).answer]));
    return { rows, keys, answers, json: JSON.stringify(rows) };
  }

  it("PREMISE: the patient of `own` has two sends, both answered with a comment, and the patient of `elsewhere` one", async () => {
    expect(
      await one(raw`
        select
          (select count(*)::int from appointment_survey_sends
            where tenant_id = ${tenant}::uuid and patient_id = ${P1}::uuid) as sends,
          (select count(*)::int from appointment_survey_responses
            where tenant_id = ${tenant}::uuid and patient_id = ${P1}::uuid and comment is not null) as answers,
          (select count(*)::int from appointment_survey_sends
            where tenant_id = ${tenant}::uuid and patient_id = ${byKey("elsewhere").patient}::uuid) as elsewhere_sends
      `),
    ).toEqual({ sends: 2, answers: 2, elsewhere_sends: 1 });
  });

  it.each([
    ["the owner", () => OWNER],
    ["an admin at clinic A", () => ADMIN_A],
    ["reception at clinic A", () => RECEPTION_A],
  ] as const)("ficha: %s reads both of the patient's sends, newest first, and both answers", async (_name, who) => {
    const got = await onFicha(who(), P1);
    expect(got.keys).toEqual(["shared", "own"]);
    expect(got.answers).toEqual({ shared: "shown", own: "shown" });
    expect(got.json).toContain(`COMENTARIO-SHARED-${run}`);
    expect(got.json).toContain(`COMENTARIO-OWN-${run}`);
    // ONLY THIS PATIENT'S: no other send of the tenant came with them.
    for (const key of ["colleague", "elsewhere", "open", "refused", "purged"]) {
      expect(got.json, key).not.toContain(byKey(key).id);
    }
  });

  it("ficha: THERAPIST 1 reads the answer of the visit they attended, and the colleague's visit as reserved", async () => {
    const got = await onFicha(THERAPIST_1, P1);
    expect(got.keys).toEqual(["shared", "own"]);
    expect(got.answers).toEqual({ shared: "reserved", own: "shown" });
    expect(got.json).toContain(`COMENTARIO-OWN-${run}`);
    // THE COMMENT OF THE VISIT THEY DID NOT ATTEND NEVER LEFT THE DATABASE.
    expect(got.json).not.toContain(`COMENTARIO-SHARED-${run}`);
    const shared = got.rows!.find((r) => r.sendId === byKey("shared").id)!;
    expect(shared.answer).toBeNull();
    expect(shared.outcome).toBe("answered");
    const view = toSurveyListRow(shared);
    expect(view.answerState).toBe("Com resposta");
    expect([view.nps, view.rating, view.comment, view.contact, view.answeredAt]).toEqual(["-", "-", "-", "-", "-"]);
  });

  it("ficha: THERAPIST 2 reads the same two sends the other way round", async () => {
    const got = await onFicha(THERAPIST_2, P1);
    expect(got.keys).toEqual(["shared", "own"]);
    expect(got.answers).toEqual({ shared: "shown", own: "reserved" });
    expect(got.json).toContain(`COMENTARIO-SHARED-${run}`);
    expect(got.json).not.toContain(`COMENTARIO-OWN-${run}`);
  });

  it("ficha: reception at another clinic, and reception with no clinic, read none of the patient's sends", async () => {
    for (const [name, ctx] of [
      ["reception B", RECEPTION_B],
      ["reception with no clinic", RECEPTION_NONE],
    ] as const) {
      const got = await onFicha(ctx, P1);
      // The section is offered (not null) and holds nothing.
      expect(got.keys, name).toEqual([]);
    }
    // CONTROL: the same read, the same patient, as the owner.
    expect((await onFicha(OWNER, P1)).keys).toEqual(["shared", "own"]);
  });

  it("ficha: a patient seen at clinic B reads to clinic B and not to clinic A; the therapist who attended elsewhere reads it reserved", async () => {
    const patient = byKey("elsewhere").patient;
    expect((await onFicha(RECEPTION_B, patient)).answers).toEqual({ elsewhere: "shown" });
    expect((await onFicha(OWNER, patient)).answers).toEqual({ elsewhere: "shown" });
    for (const ctx of [ADMIN_A, RECEPTION_A]) expect((await onFicha(ctx, patient)).keys).toEqual([]);
    // Therapist 2 attended, at a clinic that is not theirs (S7): the send, no answer.
    const t2 = await onFicha(THERAPIST_2, patient);
    expect(t2.answers).toEqual({ elsewhere: "reserved" });
    expect(t2.json).not.toContain(`COMENTARIO-ELSEWHERE-${run}`);
    // Therapist 1 does not treat this patient: nothing.
    expect((await onFicha(THERAPIST_1, patient)).keys).toEqual([]);
  });

  it("ficha: every role reads for a patient exactly the rows the list gives them for that patient", async () => {
    let compared = 0;
    for (const patient of new Set(sends.map((s) => s.patient))) {
      for (const [name, ctx] of EVERY_ROLE) {
        const whole = (await listSurveySends(ctx)).rows.filter((r) => r.patientId === patient);
        const ficha = await readPatientSurveyRows(ctx, patient);
        expect(ficha, `${name} ${patient}`).toEqual(whole);
        compared += whole.length;
      }
    }
    // NOT VACUOUS: the sum of every role's list (7 + 6 + 6 + 1 + 0 + 5 + 4).
    expect(compared).toBe(29);
  });

  it("ficha: a patient with no send reads as an empty list, for a role that reads the others", async () => {
    const noSends = randomUUID();
    await db.execute(
      raw`insert into patients (id, tenant_id, full_name, primary_location_id)
          values (${noSends}::uuid, ${tenant}::uuid, ${`Paciente Sem Envios ${run}`}, ${clinicA}::uuid)`,
    );
    expect((await onFicha(OWNER, noSends)).keys).toEqual([]);
    expect((await onFicha(THERAPIST_1, noSends)).keys).toEqual([]);
    // CONTROL: the owner reads another patient's sends at the same moment.
    expect((await onFicha(OWNER, P1)).keys).toHaveLength(2);
  });

  it("ficha: no role's rows carry the patient's email or telephone number", async () => {
    let rowsSeen = 0;
    for (const [name, ctx] of EVERY_ROLE) {
      const got = await onFicha(ctx, P1);
      rowsSeen += got.rows!.length;
      expect(got.json, name).not.toContain(EMAIL_MARK);
      expect(got.json, name).not.toContain(PHONE_MARK);
      expect(got.json, name).not.toContain("@sat01list-staff.test");
    }
    // NOT VACUOUS: owner, admin A, reception A and both therapists read two each.
    expect(rowsSeen).toBe(10);
  });

  it("ficha: the other tenant reads nothing of this tenant's patient, and this tenant nothing of theirs", async () => {
    expect((await onFicha(OTHER_OWNER, P1)).keys).toEqual([]);
    // This tenant's owner id under the other tenant's claim: still nothing of P1.
    expect((await onFicha(ctxOf("owner", owner, otherTenant), P1)).keys).toEqual([]);
    for (const [name, ctx] of EVERY_ROLE) {
      const got = await onFicha(ctx, otherPatient);
      expect(got.keys, name).toEqual([]);
      expect(got.json, name).not.toContain(OTHER_COMMENT);
    }
    // CONTROL: the other tenant's owner reads their own patient's send and answer.
    const theirs = await onFicha(OTHER_OWNER, otherPatient);
    expect(theirs.keys).toEqual(["OTHER TENANT"]);
    expect(theirs.json).toContain(OTHER_COMMENT);
  });

  it("the patient narrows the list and composes with the month; a value that is not an id reads nothing, never the whole list", async () => {
    const forP1 = await listSurveySends(OWNER, { patientId: P1 });
    expect(forP1.total).toBe(2);
    expect(forP1.pageCount).toBe(1);
    expect(forP1.rows.map((r) => keyOf.get(r.sendId))).toEqual(["shared", "own"]);
    expect((await listSurveySends(OWNER, { patientId: P1, month: "2026-07" })).rows.map((r) => keyOf.get(r.sendId))).toEqual(["shared"]);
    expect((await listSurveySends(OWNER, { patientId: P1, month: "2025-03" })).total).toBe(0);
    for (const bad of ["", "not-an-id", `${P1}' or '1'='1`]) {
      const got = await listSurveySends(OWNER, { patientId: bad });
      expect(got.rows, bad).toEqual([]);
      expect(got.total, bad).toBe(0);
    }
    // No patient named: the whole list, as before.
    expect((await listSurveySends(OWNER, { patientId: null })).total).toBe(7);
  });

  it.each([undefined, "", "off", "ON", "On", " on", "on ", "Canary", "true"])(
    "ficha, SURVEY_SEND_MODE=%j: no role is given the patient's sends, and the read itself refuses",
    async (mode) => {
      if (mode === undefined) delete process.env.SURVEY_SEND_MODE;
      else process.env.SURVEY_SEND_MODE = mode;
      for (const [name, ctx] of [...EVERY_ROLE, ["other owner", OTHER_OWNER] as [string, Ctx]]) {
        expect(await readPatientSurveyRows(ctx, P1), name).toBeNull();
        await expect(listSurveySends(ctx, { patientId: P1 }), name).rejects.toMatchObject({ name: "ForbiddenError" });
      }
      // CONTROL: the same read with the survey on.
      process.env.SURVEY_SEND_MODE = "on";
      expect((await onFicha(OWNER, P1)).keys).toEqual(["shared", "own"]);
    },
  );

  it("ficha, under canary: every role reads the patient's sends as under on, whoever is on the canary list", async () => {
    process.env.SURVEY_SEND_MODE = "canary";
    delete process.env.SURVEY_CANARY_PATIENT_IDS;
    expect((await onFicha(OWNER, P1)).answers).toEqual({ shared: "shown", own: "shown" });
    expect((await onFicha(RECEPTION_A, P1)).answers).toEqual({ shared: "shown", own: "shown" });
    expect((await onFicha(THERAPIST_1, P1)).answers).toEqual({ shared: "reserved", own: "shown" });
    // A canary list that names another patient changes nothing staff see of this one.
    process.env.SURVEY_CANARY_PATIENT_IDS = byKey("open").patient;
    expect((await onFicha(THERAPIST_1, P1)).answers).toEqual({ shared: "reserved", own: "shown" });
    expect((await onFicha(RECEPTION_B, P1)).keys).toEqual([]);
  });
});
