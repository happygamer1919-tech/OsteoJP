/**
 * effective-availability.db.test.ts - HOR-01 AGAINST A REAL POSTGRES.
 *
 * The readers test (effective-availability.readers.test.ts) proves what each
 * staff reader does with the rows it is handed. This proves the rows: that the
 * resolver's queries, run as `authenticated` under the caller's tenant claims
 * through `runScoped`, find the therapist's flags, memberships and the clinic's
 * hours, and that the column-presence check for the Saturday hours answers on
 * a real catalogue.
 *
 * THE SATURDAY COLUMNS ARE MADE HERE, NEVER COMMITTED. HOR-02's columns are not
 * on a database built from main, so each Saturday arm adds the columns it needs
 * (none, only the closing one, or both) INSIDE ONE TRANSACTION that also runs
 * the booking check, as `authenticated` with the caller's claims (what
 * runScoped does), and is then rolled back. Nothing outside that transaction
 * ever sees them: an ALTER TABLE that committed would change `locations` for
 * every suite running beside this one. The arm first drops both columns if
 * they exist, so on a database where HOR-02 IS applied it measures the same
 * states, with no CHECK in the way of the close <= open arm.
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
  let toClaims: typeof import("@osteojp/auth").toClaims;
  let saturdayHoursPresent: boolean;

  const tenant = randomUUID();
  const lv = randomUUID();
  const archived = randomUUID();
  const second = randomUUID();
  const owner = randomUUID();

  const who = {
    eligible: randomUUID(),
    notMember: randomUUID(),
    inactive: randomUUID(),
    notBookable: randomUUID(),
    nesa: randomUUID(),
    memberOfArchivedOnly: randomUUID(),
    ownRows: randomUUID(),
    rowsAtArchivedOnly: randomUUID(),
    // MINOR d: two clinics. A has rows at LV only and is a member of both; B has
    // no rows and is a member of both.
    twoClinicsRowsAtOne: randomUUID(),
    twoClinicsNoRows: randomUUID(),
    // Only an EXPIRED row: not in force, so the default applies.
    expiredOnly: randomUUID(),
  };

  const checkAt = (therapist: string, loc: string, date: string, from: string, to: string) =>
    runScoped(ctx, (tx) =>
      checkAvailability(tx, {
        practitionerId: therapist,
        locationId: loc,
        startsAt: at(date, from),
        endsAt: at(date, to),
      }),
    );

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
    ({ toClaims } = await import("@osteojp/auth"));

    const [col] = (await db.execute(raw`
      select count(*) = 2 as present from information_schema.columns
        where table_schema = 'public' and table_name = 'locations'
          and column_name in ('saturday_opens_at', 'saturday_closes_at')
    `)) as unknown as [{ present: boolean }];
    saturdayHoursPresent = col.present === true;

    await db.execute(
      raw`insert into tenants (id, name, slug) values (${tenant}::uuid, 'hor-01', ${"hor-01-" + tenant.slice(0, 8)})`,
    );
    await db.execute(raw`insert into locations (id, tenant_id, name, opens_at, closes_at, is_active)
      values (${lv}::uuid, ${tenant}::uuid, 'HOR Linda', '08:00', '21:00', true),
             (${archived}::uuid, ${tenant}::uuid, 'HOR Fechada', '08:00', '21:00', false),
             (${second}::uuid, ${tenant}::uuid, 'HOR Segunda', '09:00', '19:00', true)`);

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
    await user(who.rowsAtArchivedOnly, "rows-at-archived");
    await user(who.twoClinicsRowsAtOne, "two-rows-at-one");
    await user(who.twoClinicsNoRows, "two-no-rows");
    await user(who.expiredOnly, "expired-only");

    for (const id of [
      who.eligible,
      who.inactive,
      who.notBookable,
      who.nesa,
      who.ownRows,
      who.rowsAtArchivedOnly,
      who.twoClinicsRowsAtOne,
      who.twoClinicsNoRows,
      who.expiredOnly,
    ]) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenant}::uuid, ${id}::uuid, ${lv}::uuid)`);
    }
    await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
      values (${tenant}::uuid, ${who.memberOfArchivedOnly}::uuid, ${archived}::uuid)`);
    for (const id of [who.twoClinicsRowsAtOne, who.twoClinicsNoRows]) {
      await db.execute(raw`insert into staff_locations (tenant_id, user_id, location_id)
        values (${tenant}::uuid, ${id}::uuid, ${second}::uuid)`);
    }

    // Own rows: Monday 09:00 to 13:00 only.
    await db.execute(raw`insert into availability_templates
        (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
      values (${tenant}::uuid, ${who.ownRows}::uuid, ${lv}::uuid, 1, '09:00', '13:00', true)`);
    // A member of LV whose only row is at the ARCHIVED clinic.
    await db.execute(raw`insert into availability_templates
        (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
      values (${tenant}::uuid, ${who.rowsAtArchivedOnly}::uuid, ${archived}::uuid, 1, '09:00', '10:00', true)`);
    await db.execute(raw`insert into availability_templates
        (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
      values (${tenant}::uuid, ${who.twoClinicsRowsAtOne}::uuid, ${lv}::uuid, 1, '09:00', '13:00', true)`);
    await db.execute(raw`insert into availability_templates
        (tenant_id, user_id, location_id, weekday, start_time, end_time, is_active, valid_from, valid_until)
      values (${tenant}::uuid, ${who.expiredOnly}::uuid, ${lv}::uuid, 1, '09:00', '10:00', true,
              '2020-01-01'::date, '2020-12-31'::date)`);
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

  it("PREMISE: three therapists have a row at the live clinic, one of them expired", async () => {
    const [r] = (await db.execute(raw`
      select count(*)::int as n, count(distinct user_id)::int as users
        from availability_templates where tenant_id = ${tenant}::uuid and is_active
          and location_id = ${lv}::uuid
    `)) as unknown as [{ n: number; users: number }];
    // own-rows, two-rows-at-one and expired-only.
    expect(r).toEqual({ n: 3, users: 3 });
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

  /**
   * Run `fn` with the HOR-02 columns in the state named, inside ONE rolled-back
   * transaction (see the header). The Saturday cache is cleared before and
   * after, so the arm's own catalogue is what is read and nothing it learned
   * outlives the columns it made.
   */
  class Rollback {
    constructor(readonly value: unknown) {}
  }
  async function underSaturdayColumns<T>(
    cols: { opens: boolean; closes: boolean },
    values: { opensAt: string | null; closesAt: string | null },
    fn: (tx: import("@osteojp/db").DbTx) => Promise<T>,
  ): Promise<T> {
    const dbmod = await import("@osteojp/db");
    dbmod.resetLocationSaturdayHoursCache();
    try {
      await db.transaction(async (tx) => {
        // "does not exist, skipping" is the expected answer on a main-built
        // database; it is a NOTICE, and it is not this arm's evidence.
        await tx.execute(raw`set local client_min_messages = warning`);
        await tx.execute(raw`alter table public.locations
          drop column if exists saturday_opens_at, drop column if exists saturday_closes_at`);
        if (cols.opens) {
          await tx.execute(raw`alter table public.locations add column saturday_opens_at time`);
          await tx.execute(raw`update locations set saturday_opens_at = ${values.opensAt}::time where id = ${lv}::uuid`);
        }
        if (cols.closes) {
          await tx.execute(raw`alter table public.locations add column saturday_closes_at time`);
          await tx.execute(raw`update locations set saturday_closes_at = ${values.closesAt}::time where id = ${lv}::uuid`);
        }
        // What runScoped does: the policies decide, as for a real booking.
        await tx.execute(raw`set local role authenticated`);
        await tx.execute(raw`select set_config('request.jwt.claims', ${JSON.stringify(toClaims(ctx))}, true)`);
        throw new Rollback(await fn(tx as never));
      });
    } catch (e) {
      if (e instanceof Rollback) return e.value as T;
      throw e;
    } finally {
      dbmod.resetLocationSaturdayHoursCache();
    }
    throw new Error("unreachable: the transaction committed");
  }

  const satCheck = (tx: import("@osteojp/db").DbTx, date: string, from: string, to: string) =>
    checkAvailability(tx, { practitionerId: who.eligible, locationId: lv, startsAt: at(date, from), endsAt: at(date, to) });

  it("Saturday on the database as built: refused (no columns, or both NULL)", async () => {
    // On a database built from main the columns do not exist, which is the
    // state the resolver must survive. Where HOR-02 is applied the fixture's
    // clinic was inserted without Saturday values, so both are NULL: same answer.
    expect(await check(who.eligible, SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
  });

  it("Saturday, only the CLOSING column exists (with a value): refused, the catalogue reads absent", async () => {
    const dbmod = await import("@osteojp/db");
    const out = await underSaturdayColumns({ opens: false, closes: true }, { opensAt: null, closesAt: "13:00" }, async (tx) => ({
      present: await dbmod.locationSaturdayHoursPresent(tx),
      sat: await satCheck(tx, SAT, "10:00", "11:00"),
    }));
    expect(out).toEqual({ present: false, sat: { ok: false, windows: [] } });
  });

  it("Saturday, both columns, opening NULL: refused", async () => {
    const out = await underSaturdayColumns({ opens: true, closes: true }, { opensAt: null, closesAt: "13:00" }, (tx) =>
      satCheck(tx, SAT, "10:00", "11:00"),
    );
    expect(out).toEqual({ ok: false, windows: [] });
  });

  it("Saturday, both columns set 09:00 and 13:00: bookable 09:00 to 13:00 and nowhere else; Sunday never", async () => {
    const dbmod = await import("@osteojp/db");
    const out = await underSaturdayColumns({ opens: true, closes: true }, { opensAt: "09:00", closesAt: "13:00" }, async (tx) => ({
      present: await dbmod.locationSaturdayHoursPresent(tx),
      first: await satCheck(tx, SAT, "09:00", "10:00"),
      last: await satCheck(tx, SAT, "12:00", "13:00"),
      // 08:00 is the WEEKDAY opening: on Saturday the clinic is still shut.
      early: await satCheck(tx, SAT, "08:00", "09:00"),
      late: await satCheck(tx, SAT, "13:00", "14:00"),
      sunday: await satCheck(tx, SUN, "10:00", "11:00"),
      monday: await satCheck(tx, MON, "08:00", "09:00"),
    }));
    const shut = { ok: false, windows: [{ startTime: "09:00", endTime: "13:00" }] };
    expect(out).toEqual({
      present: true,
      first: { ok: true, reason: "covered" },
      last: { ok: true, reason: "covered" },
      early: shut,
      late: shut,
      sunday: { ok: false, windows: [] },
      monday: { ok: true, reason: "covered" },
    });
  });

  it.each([
    ["closing before opening", "13:00", "09:00"],
    ["closing AT opening", "09:00", "09:00"],
  ])("Saturday, both columns set, %s: refused", async (_why, opensAt, closesAt) => {
    const out = await underSaturdayColumns({ opens: true, closes: true }, { opensAt, closesAt }, (tx) =>
      satCheck(tx, SAT, "08:00", "09:00"),
    );
    expect(out).toEqual({ ok: false, windows: [] });
  });

  it.each([
    ["notMember", "not a member of the clinic"],
    ["inactive", "inactive"],
    ["notBookable", "not bookable"],
    ["nesa", "a shared resource"],
  ] as const)("%s (%s) gets no default: still unconfigured, as before", async (key, why) => {
    expect(why.length).toBeGreaterThan(0);
    expect(await check(who[key], SUN, "03:00", "04:00")).toEqual({ ok: true, reason: "unconfigured" });
  });

  it("a member of an ARCHIVED clinic only gets no default there, and no auto-fill", async () => {
    // Asked AT the archived clinic, where the membership exists: only the
    // locations.is_active filter keeps the default out.
    const v = await runScoped(ctx, (tx) =>
      checkAvailability(tx, {
        practitionerId: who.memberOfArchivedOnly,
        locationId: archived,
        startsAt: at(SUN, "03:00"),
        endsAt: at(SUN, "04:00"),
      }),
    );
    expect(v).toEqual({ ok: true, reason: "unconfigured" });
    expect(await getTherapistLocationIds(ctx, who.memberOfArchivedOnly)).toEqual([]);
  });

  it("the Horarios label and the button follow the same rule", async () => {
    const { listScheduleKinds } = await import("@/lib/admin/clinic-default-schedule");
    const kinds = await listScheduleKinds(ctx, [
      who.eligible,
      who.ownRows,
      who.notBookable,
      who.memberOfArchivedOnly,
      who.rowsAtArchivedOnly,
      who.expiredOnly,
    ]);
    expect(kinds.get(who.eligible)).toEqual({
      kind: "clinic_default",
      switchVerdict: { ok: false, reason: "nothing_to_switch" },
    });
    expect(kinds.get(who.ownRows)).toEqual({
      kind: "own",
      switchVerdict: { ok: true, clinics: [{ locationId: lv, name: "HOR Linda" }] },
    });
    expect(kinds.get(who.notBookable)).toEqual({
      kind: "none",
      switchVerdict: { ok: false, reason: "nothing_to_switch" },
    });
    expect(kinds.get(who.memberOfArchivedOnly)).toEqual({
      kind: "none",
      switchVerdict: { ok: false, reason: "nothing_to_switch" },
    });
    // A row in force at an ARCHIVED clinic is still an own schedule (per
    // therapist: any row anywhere), and the switch is refused, naming the
    // clinic, because the therapist is not an active member there.
    expect(kinds.get(who.rowsAtArchivedOnly)).toEqual({
      kind: "own",
      switchVerdict: { ok: false, reason: "not_member", clinics: [{ locationId: archived, name: "HOR Fechada" }] },
    });
    expect(await check(who.rowsAtArchivedOnly, MON, "15:00", "16:00")).toEqual({ ok: true, reason: "unconfigured" });
    // An EXPIRED row is not in force: the clinic default is what applies.
    expect(kinds.get(who.expiredOnly)?.kind).toBe("clinic_default");
    expect(await check(who.expiredOnly, MON, "15:00", "16:00")).toEqual({ ok: true, reason: "covered" });
  });

  it("two clinics, PER THERAPIST: rows at one clinic mean nothing generated at the other", async () => {
    // A: rows at LV only (Monday 09:00 to 13:00), a member of LV and of Segunda.
    expect(await checkAt(who.twoClinicsRowsAtOne, lv, MON, "15:00", "16:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "13:00" }],
    });
    expect(await checkAt(who.twoClinicsRowsAtOne, second, MON, "10:00", "11:00")).toEqual({
      ok: true,
      reason: "unconfigured",
    });
    // B: no rows, a member of both: the default at both, each clinic's own hours.
    expect(await checkAt(who.twoClinicsNoRows, lv, MON, "08:00", "09:00")).toEqual({ ok: true, reason: "covered" });
    expect(await checkAt(who.twoClinicsNoRows, second, MON, "08:00", "09:00")).toEqual({
      ok: false,
      windows: [{ startTime: "09:00", endTime: "19:00" }],
    });
    expect(await checkAt(who.twoClinicsNoRows, second, MON, "09:00", "10:00")).toEqual({ ok: true, reason: "covered" });
    expect((await getTherapistLocationIds(ctx, who.twoClinicsNoRows)).sort()).toEqual([lv, second].sort());
    expect(await getTherapistLocationIds(ctx, who.twoClinicsRowsAtOne)).toEqual([lv]);
  });

  it("Saturday columns that vanish under a cached 'present' do not break booking", async () => {
    const dbmod = await import("@osteojp/db");
    dbmod.markLocationSaturdayHoursPresentForTests();
    try {
      // The whole check runs in ONE transaction: if the failed Saturday read
      // were not inside a savepoint, the transaction would be aborted and this
      // would throw instead of answering.
      expect(await check(who.eligible, MON, "10:00", "11:00")).toEqual({ ok: true, reason: "covered" });
      expect(await check(who.eligible, SAT, "10:00", "11:00")).toEqual({ ok: false, windows: [] });
      if (!saturdayHoursPresent) {
        // And the cache now says absent, so the columns are not re-queried per booking.
        expect(await dbmod.locationSaturdayHoursPresent(db)).toBe(false);
      }
    } finally {
      dbmod.resetLocationSaturdayHoursCache();
    }
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
    expect(res).toEqual({ ok: true, deactivated: 1, clinics: [{ locationId: lv, name: "HOR Linda" }] });
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

    // Pressed again: nothing in force any more, so nothing is written, not even
    // a second audit row.
    expect(await applyClinicDefaultSchedule(ctx, who.ownRows)).toEqual({ ok: false, reason: "nothing_to_switch" });
    const [again] = (await db.execute(raw`
      select count(*)::int as n from audit_log
       where tenant_id = ${tenant}::uuid and action = 'availability_template.use_clinic_default'
    `)) as unknown as [{ n: number }];
    expect(again.n).toBe(1);
  });

  it("the server refuses the switch where the default would not replace the rows, and writes nothing", async () => {
    expect(await applyClinicDefaultSchedule(ctx, who.rowsAtArchivedOnly)).toEqual({
      ok: false,
      reason: "not_member",
      clinics: [{ locationId: archived, name: "HOR Fechada" }],
    });
    const [rows] = (await db.execute(raw`
      select count(*) filter (where is_active)::int as active from availability_templates
       where user_id = ${who.rowsAtArchivedOnly}::uuid
    `)) as unknown as [{ active: number }];
    expect(rows.active).toBe(1);
    const [audit] = (await db.execute(raw`
      select count(*)::int as n from audit_log
       where tenant_id = ${tenant}::uuid and entity_id = ${who.rowsAtArchivedOnly}::uuid
    `)) as unknown as [{ n: number }];
    expect(audit.n).toBe(0);
  });
});
