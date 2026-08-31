/**
 * inbound-reply.db.test.ts — the SMS-reply status transitions, against a REAL
 * Postgres, through the production function.
 *
 * WHY IT HAS TO BE A DATABASE. Every property this file asserts is a property
 * of the DATABASE rather than of the code:
 *
 *   - the transition is written and VISIBLE afterwards, in one transaction
 *     with its audit row;
 *   - `appointments_no_double_confirmed` (an EXCLUDE ... USING gist constraint,
 *     migration 0061) REFUSES the second confirmed overlap, and the whole
 *     transaction rolls back leaving the appointment untouched;
 *   - the stored-phone predicate matches the four formats
 *     `normalizePhonePT` accepts, as SQL, against free text a human typed.
 *
 * A mock cannot fail an exclusion constraint. It would agree with whatever the
 * code believed, which is precisely the belief under test.
 *
 * THE SKIP CONTRACT. `live` gates on DATABASE_URL exactly as
 * redeem.db.test.ts does, so ci.yml (no database) skips cleanly. That makes a
 * silent skip possible, so this file is HARD-REQUIRED in
 * .github/scripts/assert-rls-executed.mjs: a skip here reddens the DB-gated
 * job instead of reporting green.
 *
 * Seeding goes through getDbAdmin(), and the code under test goes through
 * withReminderTenantContext (RLS enforced, `set local role authenticated`) -
 * so the test writes as the service role and the PRODUCT reads and writes
 * under the same RLS it does in production.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

const H = 60 * 60 * 1000;

d("applyInboundReply against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let tenantId: string;
  let practitionerId: string;
  let locationId: string;

  /**
   * EVERY TEST GETS ITS OWN PHONE NUMBER, AND THAT IS NOT TIDINESS.
   *
   * The predicate under test is "EXACTLY ONE live patient carries this
   * number". Two tests reusing one number seed two patients with it, and the
   * second test then exercises the AMBIGUOUS-match refusal while claiming to
   * test something else - it fails, but for the wrong reason, and had it been
   * written the other way round it would have PASSED for the wrong reason.
   * One allocator, nine digits, never repeated.
   */
  let phoneSeq = 0;
  function nextSubscriber(): string {
    phoneSeq += 1;
    return "91" + String(1000000 + phoneSeq).slice(-7);
  }

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
              values (${tenantId}, 'Inbound Co', ${"inbound-" + tenantId.slice(0, 8)})`);

    practitionerId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${practitionerId}, ${tenantId},
                      ${"p-" + practitionerId.slice(0, 8) + "@t.test"}, 'Dra Teste', true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
              values (${locationId}, ${tenantId}, 'Sede')`);
  });

  // Teardown never touches a trigger (INC-db-gated-trigger-race). audit_log is
  // append-only by RLS, not by a trigger, and every read below filters on a
  // freshly-minted appointment id, so leftover rows are invisible to later
  // tests. The tenant row is left behind for the same reason redeem.db.test.ts
  // leaves it: audit FKs do not cascade, and that is correct for an audit trail.
  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
  });

  type Row = Record<string, unknown>;
  async function rows(q: Parameters<typeof sql.execute>[0]): Promise<Row[]> {
    const r = (await sql.execute(q)) as unknown;
    return (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Row[];
  }

  /** A patient whose stored phone is whatever a human typed. */
  async function seedPatient(storedPhone: string | null): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
              values (${id}, ${tenantId}, 'Paciente Teste', ${storedPhone})`);
    return id;
  }

  /** A therapist of their own, so no two seeded appointments can overlap. */
  async function seedPractitioner(): Promise<string> {
    const id = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
              values (${id}, ${tenantId}, ${"p-" + id.slice(0, 8) + "@t.test"}, 'Dra Teste', true)`);
    return id;
  }

  /**
   * EACH APPOINTMENT GETS ITS OWN THERAPIST BY DEFAULT, deliberately.
   *
   * `appointments_no_double_confirmed` keys on (practitioner_id, time range),
   * so a shared therapist plus a shared hour means the SECOND test that
   * confirms trips the constraint and fails for a reason that has nothing to
   * do with what it asserts. The one test that WANTS the collision passes an
   * explicit `practitioner`, which makes the sharing the visible subject of
   * that test rather than an accident of the fixture.
   */
  async function seedAppointment(args: {
    patientId: string;
    hoursFromNow: number;
    status?: string;
    practitioner?: string;
  }): Promise<string> {
    const id = randomUUID();
    // ISO strings, not Date objects: the raw-template path binds through the
    // driver's serializer, which rejects a Date for a timestamptz.
    const starts = new Date(Date.now() + args.hoursFromNow * H).toISOString();
    const ends = new Date(Date.now() + (args.hoursFromNow + 1) * H).toISOString();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id,
                 starts_at, ends_at, status)
              values (${id}, ${tenantId}, ${args.patientId},
                      ${args.practitioner ?? (await seedPractitioner())}, ${locationId},
                      ${starts}, ${ends}, ${args.status ?? "scheduled"})`);
    return id;
  }

  async function apptRow(id: string) {
    const r = await rows(raw`select status, confirmation_state, confirmation_channel
                               from appointments where id = ${id}`);
    return r[0]!;
  }

  async function auditRows(appointmentId: string) {
    return rows(raw`select action, metadata from audit_log
                     where entity_id = ${appointmentId}
                       and action = 'appointment.patient_sms_reply'
                     order by created_at`);
  }

  async function reply(body: string, from: string) {
    const { applyInboundReply } = await import("./inbound-reply");
    return applyInboundReply({ tenantId, fromPhone: from, body, now: new Date() });
  }

  /* ------------------------------ happy paths ----------------------------- */

  it("SIM moves a scheduled appointment to confirmed, inside the window", async () => {
    const n = nextSubscriber();
    // Stored the way a receptionist types it, not in E.164.
    const patientId = await seedPatient(n.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3"));
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });

    const out = await reply("Sim", "+351" + n);
    // `patientId` rides on every outcome since W14-06: the route files the queue
    // row from it rather than asking the database the same questions again.
    expect(out).toEqual({ outcome: "confirmed", appointmentId: apptId, patientId });

    const row = await apptRow(apptId);
    expect(row.status).toBe("confirmed");
    // The confirmation AXIS is written too, so the agenda shows the patient
    // answered and by which channel - the column 0024 added and which nothing
    // but redeem.ts had ever written.
    expect(row.confirmation_state).toBe("confirmed");
    expect(row.confirmation_channel).toBe("sms");
  });

  it("NAO moves a scheduled appointment to cancelled", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient("+351" + n);
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });

    // With the accent, as a Portuguese handset sends it.
    const out = await reply("Não", "+351" + n);
    expect(out).toEqual({ outcome: "cancelled", appointmentId: apptId, patientId });
    expect((await apptRow(apptId)).status).toBe("cancelled");
  });

  it("EVERY transition writes an audit row naming the source patient-sms-reply", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient("00351" + n);
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });

    await reply("confirmo", "+351" + n);

    const audit = await auditRows(apptId);
    expect(audit).toHaveLength(1);
    const meta = audit[0]!.metadata as Record<string, unknown>;
    expect(meta.source).toBe("patient-sms-reply");
    expect(meta.intent).toBe("confirmada");
    expect(meta.outcome).toBe("confirmed");
    // PII rule #7: the audit row carries ids and verdicts, never the reply
    // body, the phone, or a name.
    const json = JSON.stringify(meta);
    expect(json).not.toContain(n);
    expect(json).not.toContain("confirmo");
    expect(json).not.toContain("Paciente");
  });

  /* --------------------------- the refusal arms --------------------------- */

  it("WRONG STATUS: a reply cannot move an appointment that is not scheduled", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient(n);
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20, status: "completed" });

    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "wrong_status" });
    // UNCHANGED. The assertion that matters: a refusal is not a partial write.
    expect((await apptRow(apptId)).status).toBe("completed");
    // And it is still recorded, so reception can see a reply arrived.
    const meta = (await auditRows(apptId))[0]!.metadata as Record<string, unknown>;
    expect(meta.reason).toBe("wrong_status");
  });

  it("EXPIRED WINDOW: a reply before the 24h reminder was due changes nothing", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient(n);
    // Six days out: the 24h SMS has not been sent, so there is no question
    // being answered. `startsAt > now` is still true, so this is the LOWER
    // bound of the window doing the work, not the upper one.
    const apptId = await seedAppointment({ patientId, hoursFromNow: 6 * 24 });

    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "outside_window" });
    expect((await apptRow(apptId)).status).toBe("scheduled");
  });

  it("the window opens at the 24h offset — asserted from BOTH sides", async () => {
    // 23h out: inside.
    const inN = nextSubscriber();
    const inPatient = await seedPatient(inN);
    const inside = await seedAppointment({ patientId: inPatient, hoursFromNow: 23 });
    expect(await reply("sim", "+351" + inN)).toEqual({
      outcome: "confirmed",
      appointmentId: inside,
      patientId: inPatient,
    });

    // 25h out: outside. An off-by-one in REPLY_WINDOW_MINUTES cannot pass both.
    const outN = nextSubscriber();
    const outPatient = await seedPatient(outN);
    await seedAppointment({ patientId: outPatient, hoursFromNow: 25 });
    expect(await reply("sim", "+351" + outN)).toMatchObject({
      outcome: "review",
      reason: "outside_window",
    });
  });

  it("NO MATCH: an unknown number changes nothing", async () => {
    const before = await rows(
      raw`select count(*)::int as n from appointments
           where tenant_id = ${tenantId} and status = 'confirmed'`,
    );
    const out = await reply("sim", "+351" + nextSubscriber());
    expect(out).toMatchObject({ outcome: "review", reason: "no_patient_match" });
    const after = await rows(
      raw`select count(*)::int as n from appointments
           where tenant_id = ${tenantId} and status = 'confirmed'`,
    );
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it("NO MATCH: two patients sharing a number is a refusal, not a coin flip", async () => {
    const n = nextSubscriber();
    const a = await seedPatient(n);
    const b = await seedPatient(n);
    const apptA = await seedAppointment({ patientId: a, hoursFromNow: 20 });
    const apptB = await seedAppointment({ patientId: b, hoursFromNow: 20 });

    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "no_patient_match" });
    // NEITHER moved. With `limit(1)` this test would confirm whichever row the
    // planner happened to return first - a medical record touched on a guess,
    // which is the refusal WF-07 ruled for OTP linkage applied to this path.
    expect((await apptRow(apptA)).status).toBe("scheduled");
    expect((await apptRow(apptB)).status).toBe("scheduled");
  });

  it("NO APPOINTMENT: a known patient with nothing upcoming changes nothing", async () => {
    const n = nextSubscriber();
    await seedPatient(n);
    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "no_appointment" });
  });

  it("AMBIGUOUS: a reply saying both words changes nothing", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient(n);
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });

    const out = await reply("sim ou nao?", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "ambiguous" });
    expect((await apptRow(apptId)).status).toBe("scheduled");
  });

  it("A PAST APPOINTMENT IS NOT THE NEXT ONE — the query only looks forward", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient(n);
    // Yesterday, still `scheduled` because nobody closed it out. A reply must
    // not reach back and confirm it.
    await seedAppointment({ patientId, hoursFromNow: -24 });
    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "no_appointment" });
  });

  /* ------------------- the constraint refuses the confirm ------------------ */

  it("DOUBLE CONFIRMED: the EXCLUDE constraint refuses, and NOTHING is written", async () => {
    // ONE therapist deliberately shared: the constraint keys on
    // practitioner_id, so the two appointments must share one to overlap for
    // its purposes.
    const shared = await seedPractitioner();
    const otherN = nextSubscriber();
    const other = await seedPatient(otherN);
    const n = nextSubscriber();
    const patientId = await seedPatient(n);

    const starts = new Date(Date.now() + 20 * H).toISOString();
    const ends = new Date(Date.now() + 21 * H).toISOString();

    // The already-confirmed row holding the slot.
    const held = randomUUID();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id,
                 starts_at, ends_at, status)
              values (${held}, ${tenantId}, ${other}, ${shared}, ${locationId},
                      ${starts}, ${ends}, 'confirmed')`);

    // The stacked request on the same window. 0061 states plainly that two
    // SCHEDULED rows on one window stay legal at the database layer, which is
    // exactly how this situation arises in production.
    const stacked = randomUUID();
    await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id,
                 starts_at, ends_at, status)
              values (${stacked}, ${tenantId}, ${patientId}, ${shared}, ${locationId},
                      ${starts}, ${ends}, 'scheduled')`);

    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "double_confirmed_refused" });

    // THE APPOINTMENT IS UNTOUCHED. The whole transaction rolled back, so the
    // patient is never told their appointment is confirmed when the database
    // refused to confirm it.
    const row = await apptRow(stacked);
    expect(row.status).toBe("scheduled");
    expect(row.confirmation_state).toBe("pending");
    expect(row.confirmation_channel).toBeNull();

    // The holder is unaffected too.
    expect((await apptRow(held)).status).toBe("confirmed");

    // And the refusal IS recorded - written in its own transaction, because
    // the one that would have carried it is dead.
    const meta = (await auditRows(stacked))[0]!.metadata as Record<string, unknown>;
    expect(meta.source).toBe("patient-sms-reply");
    expect(meta.reason).toBe("double_confirmed_refused");
  });

  /* --------------------------------- STOP -------------------------------- */

  it("STOP switches the patient's SMS preference off and touches no appointment", async () => {
    const n = nextSubscriber();
    const patientId = await seedPatient(n);
    const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });

    const out = await reply("STOP", "+351" + n);
    expect(out).toEqual({ outcome: "opt_out", patientId, appointmentId: null });

    const p = await rows(raw`select reminder_sms_enabled from patients where id = ${patientId}`);
    expect(p[0]!.reminder_sms_enabled).toBe(false);
    expect((await apptRow(apptId)).status).toBe("scheduled");
  });

  /* ---------------------- the stored-phone predicate ---------------------- */

  it("matches every stored format normalizePhonePT accepts", async () => {
    // The four accepted spellings, each on its OWN number so the "exactly one
    // patient" rule is never the thing being exercised here.
    const spellings: ((n: string) => string)[] = [
      (n) => n,
      (n) => "+351" + n,
      (n) => "00351" + n,
      (n) => "351" + n,
      (n) => n.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3"),
      (n) => "+351 " + n.replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3"),
    ];
    for (const spell of spellings) {
      const n = nextSubscriber();
      const stored = spell(n);
      const patientId = await seedPatient(stored);
      const apptId = await seedAppointment({ patientId, hoursFromNow: 20 });
      expect(await reply("sim", "+351" + n), `stored as ${JSON.stringify(stored)}`).toEqual({
        outcome: "confirmed",
        appointmentId: apptId,
        patientId,
      });
    }
  });

  it("does NOT match on a nine-digit suffix coincidence", async () => {
    const n = nextSubscriber();
    // A UK number whose last nine digits are the PT subscriber. A
    // `right(digits, 9) = subscriber` predicate would match it and cancel a
    // stranger's appointment; the exact-form set cannot.
    const patientId = await seedPatient("+44 20 " + n);
    await seedAppointment({ patientId, hoursFromNow: 20 });
    const out = await reply("sim", "+351" + n);
    expect(out).toMatchObject({ outcome: "review", reason: "no_patient_match" });
  });

  it("a patient with NO stored phone is never matched", async () => {
    await seedPatient(null);
    const out = await reply("sim", "+351" + nextSubscriber());
    expect(out).toMatchObject({ outcome: "review", reason: "no_patient_match" });
  });
});
