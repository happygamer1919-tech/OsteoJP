/**
 * effective-availability.db.test.ts - HOR-01 AGAINST A REAL POSTGRES.
 *
 * The readers test (effective-availability.readers.test.ts) proves what each
 * staff reader does with the rows it is handed. This proves the rows: that the
 * resolver's queries, run as `authenticated` under the caller's tenant claims
 * through `runScoped`, find the therapist's flags, memberships and the clinic's
 * hours, and that the column-presence check for the Saturday closing time
 * answers on a real catalogue.
 *
 * ONE THERAPIST PER REASON. Each differs from the eligible one in exactly one
 * way, so dropping a term from the eligibility rule turns exactly one arm red.
 *
 * TIMES ARE PINNED (November 2026, Lisbon on WET, so a "Z" instant is the Lisbon
 * wall clock). Nothing here reads the clock, so it does not go red after closing
 * time the way now-relative fixtures do.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (db-tests.yml runs
 * `vitest run .db.test.ts` in this workspace). Skipped without one.
 */
import { randomUUID } from "node:crypto";
import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

const MON = "2026-11-02";
const SAT = "2026-11-07";
const SUN = "2026-11-08";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00.000Z`);

d("HOR-01: a therapist with no Horarios rows works the clinic's hours (staff side)", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let runScoped: typeof import("@/lib/auth/context").runScoped;
  let checkAvailability: typeof import("./availability-enforcement").checkAvailability;
  let getTherapistAvailability: typeof import("./day-availability").getTherapistAvailability;
  let getTherapistLocationIds: typeof import("./therapist-locations").getTherapistLocationIds;
  let applyClinicDefaultSchedule: typeof import("@/lib/admin/clinic-default-schedule").applyClinicDefaultSchedule;
  let saturdayColumnPresent: boolean;

  const tenant = randomUUID();
  const lv = randomUUID();
  const archived = randomUUID();
  const owner = randomUUID();

  const who = {
    eligible: randomUUID(),
    notMember: randomUUID(),
    inactive: randomUUID(),
    notBookable: randomUUID(),
    nesa: randomUUID(),
    memberOfArchivedOnly: randomUUID(),
    ownRows: randomUUID(),
  };

  const ctx = { tenantId: tenant, role: "owner", userId: owner } as never;

  const check = (therapist: string, date: string, from: string, to: string) =>
    runScoped(ctx, (tx) =>
      checkAvailability(tx, {
        practitionerId: therapist,
        locationId: lv,
        startsAt: at(date, from),
        endsAt: at(date, to),
      }),
    );

  beforeAll(async () => {
    const mod = await import("@osteojp/db");
    db = mod.getDbAdmin();
    ({ runScoped } = await import("@/lib/auth/context"));
    ({ checkAvailability } = await import("./availability-enforcement"));
    ({ getTherapistAvailability } = await import("./day-availability"));
    ({ getTherapistLocationIds } = await import("./therapist-locations"));
    ({ applyClinicDefaultSchedule } = await import("@/lib/admin/clinic-default-schedule"));

    const [col] = (await db.execute(raw`
      select exists (select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'locations'
          and column_name = 'saturday_closes_at') as present
    `)) as unknown as [{ present: boolean }];
    saturdayColumnPresent = col.present === true;

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'hor-01', ${"hor-01-" + tenant.slice(0, 8)})`,
    );
    await db.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at, is_active)
      values (${lv}::uuid, ${tenant}::uuid, 'HOR Linda', '08:00', '21:00', true),
             (${archived}::uuid, ${tenant}::uuid, 'HOR Fechada', '08:00', '21:00', false)`);

    const user = (id: string, label: string, f: { active?: boolean; bookable?: boolean; shared?: boolean } = {}) =>
      db.execute(raw`insert into users (id, tenant_id, email, full_name, is_active, is_bookable, is_shared_resource)
        values (${id}::uuid, ${tenant}::uuid, ${label + "-" + id.slice(0, 8) + "@hor.test"}, ${label},
                ${f.active ?? true}, ${f.bookable ?? true}, ${f.shared ?? false})`);
    await user(owner, "owner", { bookable: false });
    await user(who.eligible, "eligible");
    await user(who.notMember, "not-member");
    await user(who.inactive, "inactive", { active: false });
    await user(who.notBookable, "not-bookable", { bookable: false });
    await user(who.nesa, "nesa", { shared: true });
    await user(who.memberOfArchivedOnly, "archived-only");
    await user(who.ownRows, "own-rows");

    for (const id of [who.eligible, who.inactive, who.notBookable, who.nesa, who.ownRows]) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenant}::uuid, ${id}::uuid, ${lv}::uuid)`);
    }
    await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenant}::uuid, ${who.memberOfArchivedOnly}::uuid, ${archived}::uuid)`);

    // Own rows: Monday 09:00 to 13:00 only.
    await db.execute(raw`insert into availability_templates
        (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
      values (${tenant}::uuid, ${who.ownRows}::uuid, ${lv}::uuid, 1, '09:00', '13:00', true)`);
  });

  afterAll(async () => {
    if (!live) return;
    await db.execute(raw`delete from audit_log where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from staff_locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from users where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from locations where tenant_id = ${tenant}::uuid`);
    await db.execute(raw`delete from tenants where id = ${tenant}::uuid`);
  });

  it("PREMISE: only the own-rows therapist has any availability row", async () => {
    const [r] = (await db.execute(raw`
      select count(*)::int as n, count(distinct user_id)::int as users
        from availability_templates where tenant_id = ${tenant}::uuid and is_active
    `)) as unknown as [{ n: number; users: number }];
    expect(r).toEqual({ n: 1, users: 1 });
  });

  it("the eligible member is BOOKABLE inside the clinic's hours on a weekday", async () => {
    expect(await check(who.eligible, MON, "08:00", "09:00")).toEqual({ ok: true, reason: "covered" });
    expect(await check(who.eligible, MON, "20:00", "21:00")).toEqual({ ok: true, reason: "covered" });
  });

  it("and REFUSED outside them, and on Sunday", async () => {
    expect(await check(who.eligible, MON, "21:00", "22:00")).toEqual({
      ok: false,
      windows: [{ startTime: "08:00", endTime: "21:00" }],
    });
    expect(await check(who.eligible, SUN, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday follows the database: refused without a Saturday closing time column", async () => {
    // On a database built from main this column does not exist yet, which is
    // the state the resolver must survive. Where it exists and is NULL, the
    // answer is the same.
    if (saturdayColumnPresent) {
      await db.execute(raw`update locations set saturday_closes_at = null where id = ${lv}::uuid`);
    }
    expect(await check(who.eligible, SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
    // And where the column exists (HOR-02 applied), a value turns Saturday on,
    // opening at opens_at. On a database without it this half has nothing to
    // measure, and the line above is the whole answer.
    if (saturdayColumnPresent) {
      await db.execute(raw`update locations set saturday_closes_at = '13:00' where id = ${lv}::uuid`);
      try {
        expect(await check(who.eligible, SAT, "10:00", "11:00")).toEqual({ ok: true, reason: "covered" });
        expect(await check(who.eligible, SAT, "13:00", "14:00")).toEqual({
          ok: false,
          windows: [{ startTime: "08:00", endTime: "13:00" }],
        });
      } finally {
        await db.execute(raw`update locations set saturday_closes_at = null where id = ${lv}::uuid`);
      }
    }
  });

  it.each([
    ["notMember", "not a member of the clinic"],
    ["inactive", "inactive"],
    ["notBookable", "not bookable"],
    ["nesa", "a shared resource"],
    ["memberOfArchivedOnly", "a member of an archived clinic only"],
  ] as const)("%s (%s) gets no default: still unconfigured, as before", async (key, why) => {
    expect(why.length).toBeGreaterThan(0);
    expect(await check(who[key], SUN, "03:00", "04:00")).toEqual({ ok: true, reason: "unconfigured" });
  });

  it("own rows override the default", async () => {
    expect(await check(who.ownRows, MON, "10:00", "11:00")).toEqual({ ok: true, reason: "covered" });
    expect(await check(who.ownRows, MON, "15:00", "16:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "13:00" }],
    });
  });

  it("the day panel offers the clinic's hours, and the auto-fill finds the clinic", async () => {
    const [mon] = await getTherapistAvailability(ctx, {
      therapistId: who.eligible,
      from: MON,
      to: MON,
      locationId: lv,
    });
    expect(mon!.free).toEqual([{ start: at(MON, "08:00").toISOString(), end: at(MON, "21:00").toISOString() }]);
    expect(await getTherapistLocationIds(ctx, who.eligible)).toEqual([lv]);
    expect(await getTherapistLocationIds(ctx, who.notMember)).toEqual([]);
  });

  it("Usar horario da clinica switches the own rows off, deletes none, and the default then applies", async () => {
    const res = await applyClinicDefaultSchedule(ctx, who.ownRows);
    expect(res).toEqual({ deactivated: 1 });
    const [rows] = (await db.execute(raw`
      select count(*)::int as total, count(*) filter (where is_active)::int as active
        from availability_templates where user_id = ${who.ownRows}::uuid
    `)) as unknown as [{ total: number; active: number }];
    expect(rows).toEqual({ total: 1, active: 0 });
    expect(await check(who.ownRows, MON, "15:00", "16:00")).toEqual({ ok: true, reason: "covered" });
    const [audit] = (await db.execute(raw`
      select count(*)::int as n from audit_log
       where tenant_id = ${tenant}::uuid and action = 'availability_template.use_clinic_default'
         and entity_id = ${who.ownRows}::uuid
    `)) as unknown as [{ n: number }];
    expect(audit.n).toBe(1);
  });
});
