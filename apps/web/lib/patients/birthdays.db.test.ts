/**
 * birthdays.db.test.ts - Indicação de Aniversários, against a real Postgres,
 * through the production functions, with RLS on.
 *
 * NOT RUN LOCALLY (the lane runs no Docker). DB-gated like every
 * `*.db.test.ts` (skipped without DATABASE_URL); the DB Tests workflow runs
 * it. Its first version ran there 13 of 13 green (run 41486248377). This
 * revision (R4 on #1701: the fixtures' author is no longer the therapist, plus
 * a receptionist, an owner and a patient the therapist has no link to) has not
 * run yet when it is pushed.
 *
 * WHAT IT PINS
 *   1. Who: `listTodaysBirthdays` answers with the set the /patients list
 *      answers with, over the four location classes (location-scope-classes
 *      .db.test.ts builds the same four), for an assigned admin, an assigned
 *      receptionist, an unassigned admin, the owner, the TREATING therapist
 *      (linked by appointments only; every patient was registered by somebody
 *      else) and a therapist who treats nobody. A birthday patient the
 *      therapist has no link to is absent for them and present for the clinic.
 *      Another tenant's patient with the same birthday never appears (RLS).
 *   2. When: today is the LISBON day. NOW is 23:30 UTC on 15 July, which is
 *      00:30 on 16 July in Lisbon (WEST): the 16 July birthdays show, the
 *      15 July ones do not.
 *   3. 29 February: shown on 28 February in a non-leap year, and only on
 *      29 February in a leap year.
 *   4. The setting: OFF by default, ON only for the JSON boolean `true`, read
 *      by every role through the shell's identity read, and the list is null
 *      while OFF. Only owner and admin may switch it.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** 00:30 on Thursday 16 July 2026 in Lisbon; still 15 July in UTC. */
const NOW = new Date("2026-07-15T23:30:00.000Z");
const SEEN = new Date("2026-06-02T10:00:00.000Z");

d("Indicação de Aniversários, against a real database", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let mod: typeof import("./birthdays");
  let setBirthdayHeaderIcon: typeof import("@/lib/admin/settings").setBirthdayHeaderIcon;
  let staffShellIdentity: typeof import("@/lib/auth/staff-identity").staffShellIdentity;

  const tenant = randomUUID();
  const otherTenant = randomUUID();
  const assignedOne = randomUUID();
  const assignedTwo = randomUUID();
  const elsewhere = randomUUID();
  const assignedAdmin = randomUUID();
  const assignedReception = randomUUID();
  const unassignedAdmin = randomUUID();
  const owner = randomUUID();
  const therapist = randomUUID(); // treats the four classes, registered none
  const strangerTherapist = randomUUID(); // treats nobody, registered nobody
  const registrar = randomUUID(); // registered every patient of the tenant
  const otherTenantUser = randomUUID();

  /* The four location classes, all born on 16 July and TREATED by `therapist`. */
  const byAppointmentOnly = randomUUID();
  const byPrimaryOnly = randomUUID();
  const byBoth = randomUUID();
  const byNeither = randomUUID();
  /* Born on 16 July at an assigned clinic, and no link to `therapist` at all. */
  const noTherapistLink = randomUUID();
  /* Controls, at an assigned clinic. */
  const utcDayOnly = randomUUID(); // born 15 July: the UTC day, not the Lisbon day
  const tomorrow = randomUUID(); // born 17 July
  const noDob = randomUUID();
  const softDeleted = randomUUID(); // born 16 July, deleted
  const leapling = randomUUID(); // born 29 February 2000
  const otherTenantPatient = randomUUID(); // born 16 July, other tenant

  /** A viewer located at assignedOne and assignedTwo: every arm but byNeither's. */
  const ASSIGNED_SEES = [byAppointmentOnly, byPrimaryOnly, byBoth, noTherapistLink].sort();
  /** A tenant-wide viewer. */
  const TENANT_SEES = [...ASSIGNED_SEES, byNeither].sort();
  /** The treating therapist: the four classes, by their appointments alone. */
  const THERAPIST_SEES = [byAppointmentOnly, byPrimaryOnly, byBoth, byNeither].sort();

  let n = 9700;
  const patient = (
    id: string,
    name: string,
    dob: string | null,
    primary: string | null,
    t: string = tenant,
    createdBy: string = registrar,
  ) =>
    raw`insert into patients (id, tenant_id, full_name, patient_number, date_of_birth, primary_location_id, created_by)
        values (${id}::uuid, ${t}::uuid, ${name}, ${n++}, ${dob}::date, ${primary}::uuid, ${createdBy}::uuid)`;

  const appt = (patientId: string, location: string) =>
    raw`insert into appointments (tenant_id, patient_id, practitioner_id, location_id, starts_at, ends_at, status)
        values (${tenant}::uuid, ${patientId}::uuid, ${therapist}::uuid, ${location}::uuid,
                ${SEEN.toISOString()}::timestamptz, ${new Date(SEEN.getTime() + 45 * 60000).toISOString()}::timestamptz,
                'completed'::appointment_status)`;

  type Ctx = Parameters<typeof import("./birthdays").listTodaysBirthdays>[0];
  const as = (role: Ctx["role"], userId: string): Ctx => ({ tenantId: tenant, role, userId }) as Ctx;
  const admin = (userId: string): Ctx => as("admin", userId);
  const asTherapist = (userId: string): Ctx => as("therapist", userId);

  const idsAt = async (ctx: Ctx, now: Date = NOW) =>
    (await mod.listTodaysBirthdays(ctx, now)).map((r) => r.id).sort();

  const iconOn = async (ctx: Ctx) => (await staffShellIdentity(ctx)).birthdayIconOn;

  const setRaw = (value: unknown) =>
    db.execute(
      raw`update tenants set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{birthdayIndication}', ${JSON.stringify(value)}::jsonb)
          where id = ${tenant}::uuid`,
    );

  beforeAll(async () => {
    const dbMod = await import("@osteojp/db");
    db = dbMod.getDbAdmin();
    mod = await import("./birthdays");
    ({ setBirthdayHeaderIcon } = await import("@/lib/admin/settings"));
    ({ staffShellIdentity } = await import("@/lib/auth/staff-identity"));

    for (const [id, slug] of [
      [tenant, "bday-"],
      [otherTenant, "bday-o-"],
    ] as const) {
      await db.execute(
        raw`insert into tenants (id, name, slug) values (${id}::uuid, 'birthdays', ${slug + id.slice(0, 8)})`,
      );
    }
    for (const [id, name] of [
      [assignedOne, "Assigned One"],
      [assignedTwo, "Assigned Two"],
      [elsewhere, "Elsewhere"],
    ] as const) {
      await db.execute(
        raw`insert into locations (id, tenant_id, name) values (${id}::uuid, ${tenant}::uuid, ${name})`,
      );
    }
    for (const [id, label, t] of [
      [assignedAdmin, "asg", tenant],
      [assignedReception, "rec", tenant],
      [unassignedAdmin, "una", tenant],
      [owner, "own", tenant],
      [therapist, "thr", tenant],
      [strangerTherapist, "str", tenant],
      [registrar, "reg", tenant],
      [otherTenantUser, "oth", otherTenant],
    ] as const) {
      await db.execute(
        raw`insert into users (id, tenant_id, email, full_name)
            values (${id}::uuid, ${t}::uuid, ${label + "-" + id.slice(0, 8) + "@example.test"}, ${label})`,
      );
    }
    for (const user of [assignedAdmin, assignedReception]) {
      for (const loc of [assignedOne, assignedTwo]) {
        await db.execute(
          raw`insert into staff_locations (tenant_id, user_id, location_id)
              values (${tenant}::uuid, ${user}::uuid, ${loc}::uuid)`,
        );
      }
    }

    await db.execute(patient(byAppointmentOnly, "AAA appointment only BDAY", "1980-07-16", null));
    await db.execute(patient(byPrimaryOnly, "BBB primary only BDAY", "1990-07-16", assignedOne));
    await db.execute(patient(byBoth, "CCC both arms BDAY", "2000-07-16", assignedTwo));
    await db.execute(patient(byNeither, "DDD neither arm BDAY", "1970-07-16", elsewhere));
    await db.execute(patient(noTherapistLink, "KKK no therapist link BDAY", "1960-07-16", assignedOne));
    await db.execute(patient(utcDayOnly, "EEE utc day BDAY", "1980-07-15", assignedOne));
    await db.execute(patient(tomorrow, "FFF tomorrow BDAY", "1980-07-17", assignedOne));
    await db.execute(patient(noDob, "GGG no date BDAY", null, assignedOne));
    await db.execute(patient(softDeleted, "HHH deleted BDAY", "1980-07-16", assignedOne));
    await db.execute(raw`update patients set deleted_at = now() where id = ${softDeleted}::uuid`);
    await db.execute(patient(leapling, "III leapling BDAY", "2000-02-29", assignedOne));
    await db.execute(
      patient(otherTenantPatient, "JJJ other tenant BDAY", "1980-07-16", null, otherTenant, otherTenantUser),
    );

    // `therapist` treats the four classes and nobody else.
    await db.execute(appt(byAppointmentOnly, assignedOne));
    await db.execute(appt(byPrimaryOnly, elsewhere));
    await db.execute(appt(byBoth, assignedOne));
    await db.execute(appt(byNeither, elsewhere));
  });

  afterAll(async () => {
    if (!db) return;
    for (const t of [tenant, otherTenant]) {
      // audit_log first: setBirthdayHeaderIcon writes a row pointing at the
      // actor, and audit_log.actor_user_id has no ON DELETE action.
      await db.execute(raw`delete from audit_log where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from appointments where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from staff_locations where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from patients where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from users where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from locations where tenant_id = ${t}::uuid`);
      await db.execute(raw`delete from tenants where id = ${t}::uuid`);
    }
  });

  // ------------------------------------------------------------------ //
  // WHO
  // ------------------------------------------------------------------ //

  it("an ASSIGNED admin gets the classes an arm reaches, and not the one no arm reaches", async () => {
    expect(await idsAt(admin(assignedAdmin))).toEqual(ASSIGNED_SEES);
  });

  it("an ASSIGNED receptionist gets the same set as the assigned admin", async () => {
    expect(await idsAt(as("reception", assignedReception))).toEqual(ASSIGNED_SEES);
  });

  it("an UNASSIGNED admin gets the whole tenant's birthdays, and no other tenant's", async () => {
    const ids = await idsAt(admin(unassignedAdmin));
    expect(ids).toEqual(TENANT_SEES);
    expect(ids).not.toContain(otherTenantPatient);
  });

  it("the OWNER gets the whole tenant's birthdays, and no other tenant's", async () => {
    const ids = await idsAt(as("owner", owner));
    expect(ids).toEqual(TENANT_SEES);
    expect(ids).not.toContain(otherTenantPatient);
  });

  it("the TREATING therapist gets the patients they treat, and not the one they have no link to", async () => {
    // Every patient was registered by `registrar`, so the only link the
    // therapist has to anyone is an appointment: this is the treatment arm.
    const ids = await idsAt(asTherapist(therapist));
    expect(ids).toEqual(THERAPIST_SEES);
    expect(ids).not.toContain(noTherapistLink);
  });

  it("a therapist who treats and registered nobody gets none", async () => {
    expect(await idsAt(asTherapist(strangerTherapist))).toEqual([]);
  });

  it("the same set as the /patients list for the same principal (the scope is the list's)", async () => {
    const { listPatientsPage } = await import("./list-queries");
    const listed = (
      await listPatientsPage(
        { q: "BDAY", locationId: null, upcomingOnly: false, sort: "name", dir: "asc", page: 1 },
        admin(assignedAdmin),
      )
    ).rows.map((r) => r.id);
    for (const id of await idsAt(admin(assignedAdmin))) expect(listed).toContain(id);
    expect(listed).not.toContain(byNeither);
  });

  // ------------------------------------------------------------------ //
  // WHEN
  // ------------------------------------------------------------------ //

  it("00:30 in Lisbon on 16 July (23:30 UTC on the 15th) is 16 July: not the UTC day, not tomorrow", async () => {
    const ids = await idsAt(admin(unassignedAdmin));
    expect(ids).not.toContain(utcDayOnly);
    expect(ids).not.toContain(tomorrow);
    expect(ids).not.toContain(noDob);
    expect(ids).not.toContain(softDeleted);
  });

  it("an hour earlier (23:30 Lisbon on the 15th) the 15 July birthday shows instead", async () => {
    const ids = await idsAt(admin(unassignedAdmin), new Date("2026-07-15T22:30:00.000Z"));
    expect(ids).toEqual([utcDayOnly]);
  });

  it("the age is the one the patient turns today, sorted by name", async () => {
    const rows = await mod.listTodaysBirthdays(admin(unassignedAdmin), NOW);
    expect(rows.map((r) => [r.fullName, r.age])).toEqual([
      ["AAA appointment only BDAY", 46],
      ["BBB primary only BDAY", 36],
      ["CCC both arms BDAY", 26],
      ["DDD neither arm BDAY", 56],
      ["KKK no therapist link BDAY", 66],
    ]);
  });

  it("29 February shows on 28 February 2027 (not a leap year), turning 27", async () => {
    const rows = await mod.listTodaysBirthdays(admin(unassignedAdmin), new Date("2027-02-28T12:00:00.000Z"));
    expect(rows).toEqual([{ id: leapling, fullName: "III leapling BDAY", age: 27 }]);
  });

  it("in a leap year it shows on 29 February only, not on the 28th", async () => {
    expect(await idsAt(admin(unassignedAdmin), new Date("2028-02-28T12:00:00.000Z"))).toEqual([]);
    expect(await idsAt(admin(unassignedAdmin), new Date("2028-02-29T12:00:00.000Z"))).toEqual([leapling]);
  });

  // ------------------------------------------------------------------ //
  // THE SETTING
  // ------------------------------------------------------------------ //

  it("is OFF for a tenant that never set it, and the shell then gets null", async () => {
    expect(await iconOn(admin(unassignedAdmin))).toBe(false);
    expect(await mod.loadBirthdayIndication(admin(unassignedAdmin), false, NOW)).toBeNull();
  });

  it("reads ON only from the JSON boolean true, for every role, in the shell's identity read", async () => {
    await setRaw({ headerIcon: "true" });
    expect(await iconOn(admin(unassignedAdmin))).toBe(false);
    await setRaw({ headerIcon: true });
    expect(await iconOn(admin(unassignedAdmin))).toBe(true);
    // Every staff role reads its own tenant row (tenants_tenant_select, 0094).
    expect(await iconOn(asTherapist(strangerTherapist))).toBe(true);
    expect(await iconOn(as("reception", assignedReception))).toBe(true);
    // The name rides on the same read.
    expect((await staffShellIdentity(admin(unassignedAdmin))).name).toBe("una");
    expect(await mod.loadBirthdayIndication(admin(unassignedAdmin), true, NOW)).toHaveLength(5);
    await setRaw({ headerIcon: false });
  });

  it("an admin switches it through setBirthdayHeaderIcon; a therapist and a receptionist are refused and nothing changes", async () => {
    await setBirthdayHeaderIcon(admin(assignedAdmin), true);
    expect(await iconOn(admin(unassignedAdmin))).toBe(true);

    // assertCan's ForbiddenError (packages/auth/guard.ts), before any read.
    await expect(setBirthdayHeaderIcon(asTherapist(therapist), false)).rejects.toMatchObject({
      name: "ForbiddenError",
      capability: "settings:manage",
    });
    await expect(setBirthdayHeaderIcon(as("reception", assignedReception), false)).rejects.toMatchObject({
      name: "ForbiddenError",
      capability: "settings:manage",
    });
    expect(await iconOn(admin(unassignedAdmin))).toBe(true);

    await setBirthdayHeaderIcon(admin(assignedAdmin), false);
    expect(await iconOn(admin(unassignedAdmin))).toBe(false);
  });

  it("the switch keeps every other key of the settings blob", async () => {
    await db.execute(
      raw`update tenants set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{locale}', '"en"'::jsonb)
          where id = ${tenant}::uuid`,
    );
    await setBirthdayHeaderIcon(admin(assignedAdmin), true);
    const rows = (await db.execute(
      raw`select settings ->> 'locale' as locale from tenants where id = ${tenant}::uuid`,
    )) as unknown as { rows?: { locale: string }[] } & { locale: string }[];
    const first = rows.rows?.[0] ?? rows[0];
    expect(first?.locale).toBe("en");
    await setBirthdayHeaderIcon(admin(assignedAdmin), false);
  });
});
