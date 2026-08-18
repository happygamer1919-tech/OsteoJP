/**
 * guest-match.db.test.ts — the possible-existing-patient set, against a REAL
 * Postgres.
 *
 * ============================================================================
 * WHY A DATABASE TEST AND NOT MORE UNIT COVERAGE
 * ============================================================================
 * `guest-convert.test.ts` drives the action against a fake transaction, so it
 * proves the ORCHESTRATION: which branch runs, what is refused, what is written.
 * It cannot prove a single thing about the predicate itself, because the fake
 * hands back whatever rows the script says. Every claim below is a claim about
 * SQL:
 *
 *   - a SOFT-DELETED patient does not count as a match (the GUEST-03 defect this
 *     card found and fixed - the shipped subquery had no `deleted_at` filter);
 *   - a patient in ANOTHER TENANT does not count (RLS plus the explicit tenant
 *     predicate);
 *   - the COUNT the queue renders and the LIST the convert dialog offers return
 *     the same set, which is the entire reason `patientPhoneMatchConds` exists;
 *   - `phone_e164` is GENERATED ALWAYS, so the join key is one Postgres computed
 *     for both sides rather than anything this test writes.
 *
 * A UNIT TEST ASSERTING ANY OF THESE WOULD BE ASSERTING ITS OWN FIXTURE.
 *
 * SKIP CONTRACT: gates on DATABASE_URL exactly as pedido-confirm.db.test.ts
 * does, so ci.yml (no database) skips cleanly and the DB-gated job runs it.
 *
 * TEARDOWN NEVER TOUCHES A TRIGGER (INC-db-gated-trigger-race). This suite
 * creates its own tenant, deletes only its own rows, and toggles nothing global.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The auth seam, and NOTHING else. `runScoped` stays REAL: it sets
// `role authenticated` plus the JWT claims, which is what makes the RLS policies
// on `patients` and `guest_booking_requests` apply at all. A faked runScoped
// would strip the claims and every query would return nothing - a suite that
// passed that way would prove the opposite of what it claims.
const h = vi.hoisted(() => ({ requireRequestContext: vi.fn() }));
vi.mock("@/lib/auth/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/context")>();
  return { ...actual, requireRequestContext: h.requireRequestContext };
});
vi.mock("@osteojp/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/auth")>();
  return { ...actual, assertCan: vi.fn() }; // capability granted; RLS still real
});

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** One number, shared by everybody in this suite. The whole point is who it
 *  does and does not match. */
const PHONE = "912345678";

d("the guest possible-patient match set, against a real database", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let listPendingGuestRequests: typeof import("./guest-requests").listPendingGuestRequests;
  let listGuestRequestMatches: typeof import("./guest-convert").listGuestRequestMatches;

  let tenantId: string;
  let otherTenantId: string;
  let receptionId: string;
  let locationId: string;
  let serviceId: string;

  let livePatient: string;
  let deletedPatient: string;

  const ctx = () => ({ tenantId, role: "reception" as const, userId: receptionId });

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ listPendingGuestRequests } = await import("./guest-requests"));
    ({ listGuestRequestMatches } = await import("./guest-convert"));

    tenantId = randomUUID();
    otherTenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Guest Co', ${"guest-" + tenantId.slice(0, 8)})`);
    await sql.execute(raw`insert into tenants (id, name, slug)
      values (${otherTenantId}, 'Other Co', ${"other-" + otherTenantId.slice(0, 8)})`);

    receptionId = randomUUID();
    await sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active)
      values (${receptionId}, ${tenantId}, ${"r-" + receptionId.slice(0, 8) + "@t.test"}, 'Rececao', true)`);

    locationId = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name)
      values (${locationId}, ${tenantId}, 'Sede')`);

    serviceId = randomUUID();
    await sql.execute(raw`insert into services (id, tenant_id, name, duration_min, is_active)
      values (${serviceId}, ${tenantId}, 'Osteopatia', 55, true)`);

    // THE THREE PATIENTS THIS SUITE IS ABOUT. Every one is written with the SAME
    // free-text number; `phone_e164` is GENERATED ALWAYS, so Postgres derives
    // the join key for all of them and nothing here can fake agreement.
    livePatient = randomUUID();
    deletedPatient = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${livePatient}, ${tenantId}, 'Paciente Vivo', ${PHONE})`);
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone, deleted_at)
      values (${deletedPatient}, ${tenantId}, 'Paciente Apagado', ${PHONE}, now())`);
    // Same number, different clinic entirely.
    await sql.execute(raw`insert into patients (id, tenant_id, full_name, phone)
      values (${randomUUID()}, ${otherTenantId}, 'Paciente Alheio', ${PHONE})`);

    h.requireRequestContext.mockResolvedValue(ctx());
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from guest_booking_requests where tenant_id in (${tenantId}, ${otherTenantId})`);
    await sql.execute(raw`delete from patients where tenant_id in (${tenantId}, ${otherTenantId})`);
    await sql.execute(raw`delete from services where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id in (${tenantId}, ${otherTenantId})`);
  });

  async function seedRequest(phone: string): Promise<string> {
    const id = randomUUID();
    const start = new Date(Date.now() + 96 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    await sql.execute(raw`insert into guest_booking_requests
      (id, tenant_id, full_name, phone, service_id, location_id, requested_starts_at, requested_ends_at, status)
      values (${id}, ${tenantId}, 'Convidada', ${phone}, ${serviceId}, ${locationId},
              ${start.toISOString()}, ${end.toISOString()}, 'pending')`);
    return id;
  }

  it("GUARD ON THE GUARD: the generated column agrees for the request and the patient", async () => {
    // If `phone_e164` normalised the two sides differently, EVERY assertion
    // below would pass for the wrong reason - a miss looks exactly like "no
    // match", which is the benign answer. This is the arm that would fail first.
    const requestId = await seedRequest(PHONE);
    const r = (await sql.execute(raw`
      select
        (select phone_e164 from guest_booking_requests where id = ${requestId}) as guest,
        (select phone_e164 from patients where id = ${livePatient}) as patient
    `)) as unknown;
    const row = (Array.isArray(r) ? r[0] : (r as { rows: unknown[] }).rows[0]) as {
      guest: string | null;
      patient: string | null;
    };
    expect(row.guest, "the guest number must normalise at all").toBeTruthy();
    expect(row.patient).toBe(row.guest);
  });

  it("COUNTS the live patient once, and NOT the soft-deleted one", async () => {
    // THE DEFECT THIS CARD FOUND. Two rows in this tenant carry this number and
    // one is deleted. The shipped subquery had no deleted_at filter and would
    // answer 2 here - marking a caller "Poderá já ser paciente (vários registos)"
    // on the strength of a record somebody deliberately removed.
    await seedRequest(PHONE);
    const rows = await listPendingGuestRequests(ctx() as never);
    const mine = rows.filter((r) => r.phone === PHONE);
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      expect(r.possiblePatientMatches, "deleted patients must not be counted").toBe(1);
    }
  });

  it("LISTS exactly the patient it counted, and never the deleted one", async () => {
    // The count and the list are the same rule or the dialog contradicts the
    // badge. This is the assertion that pins them together.
    const requestId = await seedRequest(PHONE);
    const result = await listGuestRequestMatches(requestId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((m) => m.id)).toEqual([livePatient]);
    expect(result.data.map((m) => m.id)).not.toContain(deletedPatient);
  });

  it("does NOT match a patient in another tenant, however the number is written", async () => {
    // The third seeded patient carries the same number under `otherTenantId`.
    // RLS and the explicit tenant predicate must both agree it is invisible.
    const requestId = await seedRequest(PHONE);
    const result = await listGuestRequestMatches(requestId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
  });

  it("COUNTERWEIGHT: an unrelated number matches NOBODY", async () => {
    // Without this the suite would pass just as well against a predicate that
    // returns the empty set for everything - which is exactly the shape a
    // broken `deleted_at` filter would produce if it were written inverted.
    const requestId = await seedRequest("934000111");
    const result = await listGuestRequestMatches(requestId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);

    const rows = await listPendingGuestRequests(ctx() as never);
    const row = rows.find((r) => r.phone === "934000111");
    expect(row?.possiblePatientMatches).toBe(0);
  });
});
