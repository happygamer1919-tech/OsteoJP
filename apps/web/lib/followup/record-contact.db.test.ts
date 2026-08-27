/**
 * record-contact.db.test.ts — the contact mark, against a REAL Postgres,
 * THROUGH THE PRODUCTION FUNCTION.
 *
 * ==========================================================================
 * WHY IT EXISTS, AND WHY THE TEST THAT ALREADY "COVERED" THIS WAS GREEN.
 * ==========================================================================
 * `apps/web/e2e/recuperacao.spec.ts` has asserted since RB-01 shipped that
 * "a recorded contact renders with who and when". It passes. It has always
 * passed. It proves the READ, and it says so in its own comment — the row it
 * renders is inserted by `seed-e2e.mjs` through the SERVICE-ROLE client, not by
 * pressing anything.
 *
 * So the write path had no test at all, and the gap was invisible from a green
 * board: a spec named after the visible outcome, asserting the visible outcome,
 * arriving at it by a route no user takes. Criterion F on
 * ACC-vacuous-guard-sweep, and the same spec's own header already confessed the
 * identical class one test earlier ("MY OWN E2E ASSERTED THE WRONG STRING ON
 * THE LANDLINE ROW AND PASSED, because the text was present - for the wrong
 * reason").
 *
 * ==========================================================================
 * IT CALLS `recordFollowupContactFor`. IT DOES NOT MATCH A STRING.
 * ==========================================================================
 * The function under test is the one the route handler calls, unmodified, and
 * every assertion reads the ROW BACK OUT of `patient_followup_contacts`. A
 * suite that asserted the generated SQL would go green against a statement the
 * database refuses, which is most of what went wrong here in the first place.
 *
 * It lives in apps/web because that is where the function is, and packages/db
 * must not import from an app. `.github/workflows/db-tests.yml` globs
 * `.db.test.ts` in this workspace, so it runs; `assert-rls-executed.mjs`
 * hard-requires the file so a silent skip REDDENS rather than passing.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

type Row = { channel: string; contacted_by: string; contacted_at: string; patient_id: string };

d("recordFollowupContactFor against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let record: typeof import("./record-contact").recordFollowupContactFor;
  let tenantId: string;
  let receptionId: string;
  let therapistId: string;
  let otherTherapistId: string;
  let patientId: string;
  let otherPatientId: string;
  let locationId: string;
  let serviceId: string;

  /** The ctx shape the route handler hands the function, built here rather than
   *  mocked: `userId` IS `users.id` (1:1 with the auth user id, per the column's
   *  own comment), which is what `contacted_by` records. */
  const ctxFor = (userId: string, role: "reception" | "therapist") => ({
    tenantId,
    role,
    userId,
  }) as Parameters<typeof record>[0];

  const contactsFor = async (patient: string): Promise<Row[]> => {
    const res = await sql.execute(raw`
      select channel, contacted_by::text, contacted_at::text, patient_id::text
        from patient_followup_contacts
       where patient_id = ${patient}
       order by contacted_at asc, channel asc`);
    return (res as unknown as Row[]).map((r) => ({ ...r }));
  };

  beforeAll(async () => {
    const db = await import("@osteojp/db");
    sql = db.getDbAdmin();
    record = (await import("./record-contact")).recordFollowupContactFor;

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
              values (${tenantId}, 'Contact Co', ${"contact-" + tenantId.slice(0, 8)})`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
              values (${locationId}, ${tenantId}, 'Sede')`);
    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name, duration_min, price_cents)
              values (${serviceId}, ${tenantId}, 'Consulta', 60, 5000)`);

    for (const [id, name] of [
      [(receptionId = randomUUID()), "Rececao Teste"],
      [(therapistId = randomUUID()), "Terapeuta A"],
      [(otherTherapistId = randomUUID()), "Terapeuta B"],
    ] as const) {
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
                values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true)`);
    }

    patientId = randomUUID();
    otherPatientId = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
              values (${patientId}, ${tenantId}, 'Paciente A')`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name)
              values (${otherPatientId}, ${tenantId}, 'Paciente B')`);

    // A's most recent completed consultation is THERAPIST A's; B's is the other
    // therapist's. That is the predicate `followupOwnPatientClause` reads, and it
    // is what makes the scope arm below a real refusal rather than a missing row.
    const appt = async (patient: string, practitioner: string) => {
      const startsAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      await sql.execute(raw`insert into appointments
                (id, tenant_id, patient_id, practitioner_id, location_id, service_id,
                 starts_at, ends_at, status)
              values (${randomUUID()}, ${tenantId}, ${patient}, ${practitioner}, ${locationId},
                      ${serviceId}, ${startsAt}, ${new Date(startsAt.getTime() + 36e5)}, 'completed')`);
    };
    await appt(patientId, therapistId);
    await appt(otherPatientId, otherTherapistId);
  });

  afterAll(async () => {
    if (!live) return;
    // NO TRIGGER IS TOUCHED. `ALTER TABLE ... DISABLE TRIGGER` is global to
    // every connection, and redeem.db.test.ts records at length how that turned
    // two parallel suites into a red REQUIRED check on an unrelated sha. Every
    // read here is keyed by a fresh per-run patient uuid, so leftover rows in an
    // append-only table cannot be seen by anything.
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
  });

  it("WRITES THE ROW - the defect, asserted directly", async () => {
    // The whole card in one assertion. Before the fix nothing reached the
    // database at all when the click also navigated; this proves the function
    // the route now calls does reach it.
    await record(ctxFor(receptionId, "reception"), patientId, "whatsapp");

    const rows = await contactsFor(patientId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.channel).toBe("whatsapp");
    expect(rows[0]?.patient_id).toBe(patientId);
  });

  it("records WHO and WHEN, which is what the line on screen says", async () => {
    // Asserted as VALUES, not as presence. A row whose contacted_by pointed at
    // the wrong user would satisfy a not-null check and would put another
    // receptionist's name under the patient.
    const rows = await contactsFor(patientId);
    const first = rows[0];
    if (!first) throw new Error("no contact row - the suite is asserting nothing");
    expect(first.contacted_by).toBe(receptionId);
    // `contacted_at` defaults at the database. A null here would render as a row
    // that "should not exist" per the page's own stamp() guard.
    expect(Date.parse(first.contacted_at)).not.toBeNaN();
    expect(Math.abs(Date.now() - Date.parse(first.contacted_at))).toBeLessThan(60_000);
  });

  it("a SECOND channel on the same patient is a SECOND ROW, not an update", async () => {
    // 0067 grants no UPDATE and no DELETE for a reason: three attempts to reach
    // somebody is a different fact from one attempt, and only the history tells
    // them apart. An implementation that upserted on (patient, channel) would
    // pass every other test in this file.
    await record(ctxFor(receptionId, "reception"), patientId, "sms");

    const rows = await contactsFor(patientId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(["sms", "whatsapp"]);
  });

  it("the SAME channel twice is also two rows - a second attempt is a fact", async () => {
    await record(ctxFor(receptionId, "reception"), patientId, "whatsapp");
    const rows = await contactsFor(patientId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.channel === "whatsapp")).toHaveLength(2);
  });

  it("REFUSES an unknown channel, and writes nothing", async () => {
    // The negative arm of the channel union. A refusal that still wrote would be
    // a `23514` at the database, which is a 500 the receptionist cannot act on.
    const before = (await contactsFor(otherPatientId)).length;
    await expect(
      record(ctxFor(receptionId, "reception"), otherPatientId, "pigeon"),
    ).rejects.toThrow(/unknown channel/);
    expect(await contactsFor(otherPatientId)).toHaveLength(before);
  });

  it("REFUSES a therapist acting on another therapist's patient, and writes nothing", async () => {
    // The scope guard, at the database rather than in a rendered predicate. This
    // is the refusal the old `catch {}` would have swallowed in silence.
    const before = (await contactsFor(otherPatientId)).length;
    await expect(
      record(ctxFor(therapistId, "therapist"), otherPatientId, "whatsapp"),
    ).rejects.toThrow();
    expect(await contactsFor(otherPatientId)).toHaveLength(before);
  });

  it("ACCEPTS a therapist acting on their OWN patient - the adjacent state", async () => {
    // Without this the refusal above would pass against a guard that refused
    // every therapist, which is a different bug wearing the same green.
    const before = (await contactsFor(patientId)).length;
    await record(ctxFor(therapistId, "therapist"), patientId, "email");
    const rows = await contactsFor(patientId);
    expect(rows).toHaveLength(before + 1);
    expect(rows.some((r) => r.channel === "email" && r.contacted_by === therapistId)).toBe(true);
  });
});
