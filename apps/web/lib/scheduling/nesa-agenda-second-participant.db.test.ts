/**
 * nesa-agenda-second-participant.db.test.ts - SCHED-29.3, the app half of 0088.
 *
 * A booking with NESA as Terapeuta 2 is drawn on NESA's agenda for the
 * therapists who share the machine's clinic. 0088 makes the row readable; this
 * proves listAppointments ASKS for it, and that a person's Terapeuta 2 rows
 * stay off that person's agenda (W4-19).
 *
 * runScoped is REAL, so RLS and 0088 run as on production. Built from
 * supabase/migrations, which carries 0088 on this branch.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

d("SCHED-29.3: NESA's agenda draws its Terapeuta 2 bookings", () => {
  let sql: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let list: typeof import("./data").listAppointments;

  let tenantId: string;
  let nesaId: string;
  let booker: string;
  let colleague: string;
  let person: string;
  let cb: string;
  let nesaSecond: string;
  let personSecond: string;

  const START = new Date("2027-05-12T09:00:00.000Z");
  const END = new Date("2027-05-12T09:45:00.000Z");
  const RANGE = { startUtc: new Date("2027-05-12T00:00:00.000Z"), endUtc: new Date("2027-05-13T00:00:00.000Z") };

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    sql = getDbAdmin();
    ({ listAppointments: list } = await import("./data"));

    tenantId = randomUUID();
    await sql.execute(raw`insert into tenants (id, name, slug) values (${tenantId}, 'NESA agenda Co', ${"s293-" + tenantId.slice(0, 8)})`);
    nesaId = randomUUID();
    booker = randomUUID();
    colleague = randomUUID();
    person = randomUUID();
    const user = (id: string, name: string, shared: boolean) =>
      sql.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
        values (${id}, ${tenantId}, ${"u-" + id.slice(0, 8) + "@t.test"}, ${name}, true, ${!shared}, ${shared})`);
    await user(nesaId, "NESA", true);
    await user(booker, "Booker", false);
    await user(colleague, "Colleague", false);
    await user(person, "Person Two", false);
    cb = randomUUID();
    await sql.execute(raw`insert into locations (id, tenant_id, name) values (${cb}, ${tenantId}, 'CB agenda')`);
    for (const u of [nesaId, booker, colleague, person]) {
      await sql.execute(raw`insert into staff_locations (tenant_id, user_id, location_id) values (${tenantId}, ${u}, ${cb})`);
    }
    const patient = randomUUID();
    await sql.execute(raw`insert into patients (id, tenant_id, full_name) values (${patient}, ${tenantId}, 'Paciente agenda')`);
    nesaSecond = randomUUID();
    personSecond = randomUUID();
    const appt = (id: string, prac2: string, startsAt: Date, endsAt: Date) =>
      sql.execute(raw`insert into appointments (id, tenant_id, patient_id, practitioner_id, practitioner_2_id, location_id,
          starts_at, ends_at, status, created_by)
        values (${id}, ${tenantId}, ${patient}, ${booker}, ${prac2}, ${cb},
          ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, 'scheduled', ${booker})`);
    await appt(nesaSecond, nesaId, START, END);
    await appt(personSecond, person, new Date("2027-05-12T11:00:00.000Z"), new Date("2027-05-12T11:45:00.000Z"));
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.execute(raw`delete from appointments where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from staff_locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await sql.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("a CB colleague's merged agenda { self, NESA } shows the booking with NESA as Terapeuta 2", async () => {
    const rows = await list({ tenantId, role: "therapist", userId: colleague }, {
      ...RANGE,
      practitionerIds: [colleague, nesaId],
    });
    expect(rows.map((r) => r.id)).toContain(nesaSecond);
  });

  it("the colleague narrowed to NESA alone still sees it", async () => {
    const rows = await list({ tenantId, role: "therapist", userId: colleague }, { ...RANGE, practitionerIds: [nesaId] });
    expect(rows.map((r) => r.id)).toEqual([nesaSecond]);
  });

  it("the colleague's own agenda { self } does not show it", async () => {
    const rows = await list({ tenantId, role: "therapist", userId: colleague }, { ...RANGE, practitionerIds: [colleague] });
    expect(rows.map((r) => r.id)).not.toContain(nesaSecond);
  });

  it("a PERSON as Terapeuta 2 is not drawn on that person's agenda (W4-19)", async () => {
    const rows = await list({ tenantId, role: "owner", userId: randomUUID() }, { ...RANGE, practitionerId: person });
    expect(rows.map((r) => r.id)).not.toContain(personSecond);
  });

  it("the owner filtering the agenda to NESA sees it too", async () => {
    const rows = await list({ tenantId, role: "owner", userId: randomUUID() }, { ...RANGE, practitionerId: nesaId });
    expect(rows.map((r) => r.id)).toEqual([nesaSecond]);
  });
});
