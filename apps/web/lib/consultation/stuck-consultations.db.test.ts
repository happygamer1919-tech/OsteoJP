/**
 * stuck-consultations.db.test.ts — WHO SEES WHICH ROW, against a REAL Postgres.
 *
 * WHY THIS IS A DB TEST AND NOT A MOCKED QUERY BUILDER. The thing that can go
 * wrong on this screen is not the shape of the query, it is the SET OF ROWS it
 * answers with. SEC-01 is the worked example: a therapist opened /notificacoes
 * on deployed production and saw the entire tenant's guest queue. Every unit
 * test in that area passed, because a mocked builder answers from a fixture and
 * a missing predicate is invisible in a fixture — the rows it should have
 * removed were never there to remove.
 *
 * So this suite mocks NOTHING in the scope path. `therapistPatientScope` and
 * `patientLocationScope` build real SQL, `runScoped` is the real one (it sets
 * `role authenticated` and the JWT claims, which is what RLS keys on), and the
 * rows come back from Postgres. Only `assertCan` is stubbed, and only so each
 * arm can be exercised as a role without minting a session.
 *
 * ==========================================================================
 * THE OWNER ARM IS A POSITIVE CONTROL AND IT IS THE MOST IMPORTANT ASSERTION
 * IN THE FILE.
 * ==========================================================================
 * Every other assertion here is of the form "this role sees FEWER rows". A
 * suite of only those passes perfectly if the table cannot be read at all — by
 * a missing grant, a wrong tenant claim, a typo in the status literal — and it
 * passes for the wrong reason, over a screen the clinic can never see anything
 * on. 0064's own header records exactly that: its first draft shipped the RLS
 * policy with no GRANT, and every negative assertion went green.
 *
 * The owner arm asserts that both stuck rows ARE reachable. Only against that
 * does "reception sees one of them" mean the filter worked.
 *
 * SKIP CONTRACT: gates on DATABASE_URL exactly as pedido-confirm.db.test.ts and
 * redeem.db.test.ts do, so ci.yml (no database) skips cleanly and the DB-gated
 * required job runs it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The capability gate, and NOTHING else. Every role in this file legitimately
// holds `patients:read`; stubbing it keeps the suite from depending on the
// permission matrix while it is testing the DATA SCOPE, which is a different
// question and the one that failed in SEC-01.
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  return { ...actual, assertCan: vi.fn() };
});

const url = process.env.DATABASE_URL;
const live = Boolean(url);
const d = live ? describe : describe.skip;

d("listStuckConsultations against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let listStuckConsultations: typeof import("./stuck-consultations").listStuckConsultations;

  let tenantId: string;
  let locLV: string;
  let locCB: string;
  let ownerId: string;
  /** Assigned to Linda-a-Velha ONLY. The location arm turns on this row. */
  let receptionLV: string;
  let receptionNone: string;
  let therapistA: string;
  let therapistB: string;
  let patientLV: string;
  let patientCB: string;
  let stuckLV: string;
  let stuckCB: string;
  let pendingLV: string;

  /** Two different afternoons, so the newest-first ordering is observable. */
  const OLDER = new Date("2026-08-10T14:00:00.000Z");
  const NEWER = new Date("2026-08-12T09:30:00.000Z");
  /**
   * A THIRD instant, and it is not tidiness. `consultations_recording_unique`
   * is (tenant, patient, started, ended) — the partner's own idempotency grain —
   * so the still-pending row cannot reuse NEWER on the same patient. Giving it
   * NEWER would make this suite fail at seeding, which is the constraint doing
   * its job and would look like a bug in the query.
   */
  const PENDING_AT = new Date("2026-08-12T15:00:00.000Z");

  const ctxFor = (role: string, userId: string) =>
    ({ tenantId, role, userId }) as Parameters<typeof listStuckConsultations>[0];

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ listStuckConsultations } = await import("./stuck-consultations"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Stuck Co', ${"stuck-" + tenantId.slice(0, 8)})`);

    locLV = randomUUID();
    locCB = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locLV}, ${tenantId}, 'Linda-a-Velha')`);
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locCB}, ${tenantId}, 'Castelo Branco')`);

    ownerId = randomUUID();
    receptionLV = randomUUID();
    receptionNone = randomUUID();
    therapistA = randomUUID();
    therapistB = randomUUID();
    for (const [id, name] of [
      [ownerId, "Dono"],
      [receptionLV, "Rececao LV"],
      [receptionNone, "Rececao sem clinica"],
      [therapistA, "Dra A"],
      [therapistB, "Dr B"],
    ] as const) {
      await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
        values (${id}, ${tenantId}, ${id.slice(0, 8) + "@t.test"}, ${name}, true)`);
    }

    // ONE assignment only. `receptionNone` is deliberately left unassigned:
    // PL-09's documented onboarding fallback makes an unassigned reception user
    // UNRESTRICTED, and that fallback is load-bearing enough to assert rather
    // than to trust.
    await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenantId}, ${receptionLV}, ${locLV})`);

    // `created_by` drives therapistPatientScope and `primary_location_id`
    // drives patientLocationScope. Both are set here rather than seeding
    // appointments, because an appointment would satisfy BOTH predicates at
    // once and the two arms would stop being separable.
    patientLV = randomUUID();
    patientCB = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${patientLV}, ${tenantId}, 'Paciente LV', ${locLV}, ${therapistA})`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, primary_location_id, created_by)
      values (${patientCB}, ${tenantId}, 'Paciente CB', ${locCB}, ${therapistB})`);

    const consultation = async (
      patientId: string,
      doctorId: string,
      startedAt: Date,
      fireStatus: string,
      attempts: number,
    ) => {
      const id = randomUUID();
      const endedAt = new Date(startedAt.getTime() + 45 * 60 * 1000);
      await sql.execute(raw`insert into consultations
        (id, tenant_id, patient_id, doctor_id, audio_object_key,
         consultation_started_at, consultation_ended_at, fire_status,
         attempt_count, last_attempt_at, last_error)
        values (${id}, ${tenantId}, ${patientId}, ${doctorId}, ${"audio/" + id},
         ${startedAt.toISOString()}, ${endedAt.toISOString()}, ${fireStatus},
         ${attempts}, ${startedAt.toISOString()}, ${fireStatus === "needs_attention" ? "503" : null})`);
      return id;
    };

    stuckLV = await consultation(patientLV, therapistA, NEWER, "needs_attention", 8);
    stuckCB = await consultation(patientCB, therapistB, OLDER, "needs_attention", 8);
    // STILL BEING RETRIED. It must never appear: this screen says "given up
    // on", and a row that the scanner will fire again in ten minutes rendered
    // beside one whose audio is deleted tells reception to rewrite notes for a
    // consultation that is about to arrive.
    pendingLV = await consultation(patientLV, therapistA, PENDING_AT, "pending", 2);
  });

  afterAll(async () => {
    // CONSULTATIONS ONLY, AND NO TRIGGER IS TOUCHED. INC-db-gated-trigger-race:
    // `ALTER TABLE ... DISABLE TRIGGER` is global rather than session-scoped,
    // and two db-gated suites toggling one trigger under vitest's parallel file
    // execution reddened the required check on a sha whose diff could not touch
    // it. Nothing here needs a trigger off.
    //
    // The patients, users, locations and tenant rows are LEFT. The tenant id is
    // fresh per run and RLS scopes every read to it, so nothing this suite
    // leaves behind is reachable from any other suite or run.
    if (!live) return;
    await sql.execute(raw`delete from consultations where tenant_id = ${tenantId}`);
  });

  it("the OWNER sees both stuck consultations and NOT the pending one", async () => {
    const rows = await listStuckConsultations(ctxFor("owner", ownerId));
    const ids = rows.map((r) => r.id);
    // THE POSITIVE CONTROL. Both rows are reachable; every narrowing assertion
    // below is only meaningful against this one.
    expect(ids).toContain(stuckLV);
    expect(ids).toContain(stuckCB);
    expect(ids).not.toContain(pendingLV);
  });

  it("orders the most recent consultation first, because that is the one still in memory", async () => {
    const rows = await listStuckConsultations(ctxFor("owner", ownerId));
    const mine = rows.filter((r) => r.id === stuckLV || r.id === stuckCB);
    expect(mine.map((r) => r.id)).toEqual([stuckLV, stuckCB]);
  });

  it("carries the patient, the clinician and the technical reason", async () => {
    const rows = await listStuckConsultations(ctxFor("owner", ownerId));
    const row = rows.find((r) => r.id === stuckLV);
    expect(row?.patientName).toBe("Paciente LV");
    expect(row?.clinicianName).toBe("Dra A");
    expect(row?.lastError).toBe("503");
    expect(row?.attemptCount).toBe(8);
  });

  it("RECEPTION assigned to one clinic does NOT see the other clinic's stuck consultation", async () => {
    const rows = await listStuckConsultations(ctxFor("reception", receptionLV));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(stuckLV);
    expect(ids).not.toContain(stuckCB);
  });

  it("an UNASSIGNED reception user is unrestricted, per PL-09's onboarding fallback", async () => {
    const rows = await listStuckConsultations(ctxFor("reception", receptionNone));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(stuckLV);
    expect(ids).toContain(stuckCB);
  });

  it("a THERAPIST sees only their own patients' stuck consultations", async () => {
    const a = await listStuckConsultations(ctxFor("therapist", therapistA));
    expect(a.map((r) => r.id)).toContain(stuckLV);
    expect(a.map((r) => r.id)).not.toContain(stuckCB);

    // The other direction, because a predicate that returned nothing for
    // everybody would satisfy the assertion above.
    const b = await listStuckConsultations(ctxFor("therapist", therapistB));
    expect(b.map((r) => r.id)).toContain(stuckCB);
    expect(b.map((r) => r.id)).not.toContain(stuckLV);
  });

  it("never returns a consultation from another tenant", async () => {
    const otherTenant = randomUUID();
    const rows = await listStuckConsultations({
      tenantId: otherTenant,
      role: "owner",
      userId: ownerId,
    } as Parameters<typeof listStuckConsultations>[0]);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(stuckLV);
    expect(ids).not.toContain(stuckCB);
  });
});
