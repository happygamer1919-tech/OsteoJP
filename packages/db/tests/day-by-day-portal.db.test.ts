import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

/**
 * SCHED-04 - THE HALF A TYPESCRIPT TEST CANNOT REACH, for the day-by-day grid.
 *
 * The grid writes the same row shape the alternating pattern does, so the DATE
 * axis inside Postgres is already proven by alternating-weeks-portal.db.test.ts.
 * ONE THING IN THIS MODE IS GENUINELY NEW AND THAT FILE SAYS NOTHING ABOUT IT:
 *
 *   "SUBSTITUIR ESTA JANELA" RETIRES A ROW WITH is_active = false.
 *
 * That is the entire safety of the replace path. If any consumer's predicate
 * ignored is_active, a superseded row would carry on offering the patient a slot
 * at the clinic the therapist has just been moved away from - and every
 * TypeScript test would still be green, because the portal does not run
 * TypeScript to decide this. It runs the SQL below.
 *
 * A CODE READ IS NOT THE SAME EVIDENCE. All three template predicates in
 * apps/api/lib/appointments/store.ts do carry `av.is_active = true` today; this
 * file is what goes red the day one of them is rewritten without it.
 *
 * DUPLICATION NOTE, matching its sibling: apps/api is not being refactored into
 * a shared package this wave, so the predicate is mirrored MINIMALLY rather than
 * imported. Same TODO(@osteojp/scheduling).
 *
 * GATING: needs a privileged DATABASE_URL with migrations applied; skipped
 * without one, exactly like every other suite here.
 */

const F = {
  tenant: "00000000-0000-0000-0000-0000000a6001",
  role: "00000000-0000-0000-0000-0000000a6002",
  therapist: "00000000-0000-0000-0000-0000000a6003",
  cb: "00000000-0000-0000-0000-0000000a6004",
  lv: "00000000-0000-0000-0000-0000000a6005",
};

// A window of three set days. 2026-09-07 and 2026-09-14 are Mondays.
const SET_CB = "2026-09-07";
const SET_LV = "2026-09-14";
/** Inside the window, deliberately left unset by the grid. */
const BLANK = "2026-09-21";
/** After the window, where the ordinary weekly schedule resumes. */
const AFTER = "2026-10-05";

/** The availability half of `withinTemplate` from store.ts, verbatim in shape. */
async function templateAllows(
  sql: Sql,
  locationId: string,
  startsAt: string,
  endsAt: string,
): Promise<boolean> {
  const rows = await sql<{ ok: boolean }[]>`
    select exists (
      select 1 from availability_templates av
      where av.tenant_id = ${F.tenant}
        and av.user_id = ${F.therapist}
        and av.location_id = ${locationId}
        and av.is_active = true
        and av.weekday = extract(dow from (${startsAt}::timestamptz at time zone 'Europe/Lisbon'))::int
        and av.start_time <= (${startsAt}::timestamptz at time zone 'Europe/Lisbon')::time
        and av.end_time   >= (${endsAt}::timestamptz at time zone 'Europe/Lisbon')::time
        and (av.valid_from  is null or av.valid_from  <= (${startsAt}::timestamptz at time zone 'Europe/Lisbon')::date)
        and (av.valid_until is null or av.valid_until >= (${startsAt}::timestamptz at time zone 'Europe/Lisbon')::date)
    ) as ok
  `;
  return rows[0]?.ok === true;
}

/** 10:00-11:00 Lisbon on `date`, as the portal would ask about it. */
const at10 = (date: string): [string, string] => [
  `${date}T09:00:00Z`, // 10:00 Lisbon (WEST, UTC+1 in September)
  `${date}T10:00:00Z`,
];

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${F.tenant}, 'Day By Day', ${`day-grid-${F.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${F.therapist}, ${F.tenant}, ${F.role}, ${`jp-${F.therapist}@example.pt`}, 'JP')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.cb}, ${F.tenant}, 'Castelo Branco')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.lv}, ${F.tenant}, 'Linda-a-Velha')`;

  // EXACTLY WHAT THE GRID WRITES after a save: one row per set date, bounded to
  // that single day. The window ran 2026-09-07..2026-09-27; 2026-09-21 is inside
  // it and was left unset, so it has no row at all - that IS the "not working".
  const dated = (date: string, locationId: string) =>
    sql`insert into availability_templates
          (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until)
        values (${F.tenant}, ${F.therapist}, ${locationId}, 1, '09:00', '17:00', ${date}, ${date})`;
  await dated(SET_CB, F.cb);
  await dated(SET_LV, F.lv);

  // The carved weekly row, resuming the day after the window - what layer 1
  // looks like once a window has been cut into it.
  await sql`insert into availability_templates
              (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until)
            values (${F.tenant}, ${F.therapist}, ${F.lv}, 1, '09:00', '17:00', '2026-09-28', null)`;
}

describe.skipIf(!live)("SCHED-04 - the day-by-day grid, as the PORTAL's SQL sees it", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect();
    await seed(sql);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from tenants where id = ${F.tenant}`;
    await sql.end();
  });

  it("NEGATIVE CONTROL: the three template rows really seeded", async () => {
    // Without this, every "false" below could be a fixture that never inserted,
    // and the suite would pass while proving nothing.
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n from availability_templates
      where tenant_id = ${F.tenant} and user_id = ${F.therapist}
    `;
    expect(rows[0]?.n).toBe(3);
  });

  it("a set day is allowed at the clinic it names, and refused at the other", async () => {
    expect(await templateAllows(sql, F.cb, ...at10(SET_CB))).toBe(true);
    expect(await templateAllows(sql, F.lv, ...at10(SET_CB))).toBe(false);
    expect(await templateAllows(sql, F.lv, ...at10(SET_LV))).toBe(true);
    expect(await templateAllows(sql, F.cb, ...at10(SET_LV))).toBe(false);
  });

  it("A BLANK DAY INSIDE THE WINDOW IS REFUSED AT BOTH CLINICS", async () => {
    // The whole meaning of the mode, at the consumer that decides what a patient
    // can book. It is a Monday, and the weekly Monday row exists - but it is
    // bounded to resume AFTER the window, so this day offers nothing.
    expect(await templateAllows(sql, F.cb, ...at10(BLANK))).toBe(false);
    expect(await templateAllows(sql, F.lv, ...at10(BLANK))).toBe(false);
  });

  it("after the window, the ordinary weekly schedule is serving again", async () => {
    // The counterweight to the assertion above: if the carve had removed layer 1
    // instead of bounding it, this would be false too and the blank-day result
    // would mean nothing.
    expect(await templateAllows(sql, F.lv, ...at10(AFTER))).toBe(true);
  });

  it("THE REPLACE PATH: a superseded row stops offering its day, in SQL", async () => {
    // "Substituir esta janela" sets is_active = false. This is the only thing
    // standing between a replaced schedule and the portal still offering the
    // clinic the therapist was moved away from.
    expect(await templateAllows(sql, F.cb, ...at10(SET_CB))).toBe(true); // before
    await sql`update availability_templates set is_active = false
              where tenant_id = ${F.tenant} and valid_from = ${SET_CB}`;
    expect(await templateAllows(sql, F.cb, ...at10(SET_CB))).toBe(false); // after
  });

  it("and its replacement, written in the same save, is offered instead", async () => {
    // The rest of the replace: the day comes back at the OTHER clinic. Asserted
    // after the deactivation above, in order, because that is the sequence the
    // save performs.
    await sql`insert into availability_templates
                (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until)
              values (${F.tenant}, ${F.therapist}, ${F.lv}, 1, '09:00', '17:00', ${SET_CB}, ${SET_CB})`;
    expect(await templateAllows(sql, F.lv, ...at10(SET_CB))).toBe(true);
    expect(await templateAllows(sql, F.cb, ...at10(SET_CB))).toBe(false);
  });

  it("NEGATIVE ARM: an inverted row can never be offered, which is why SCHED-05 was invisible", async () => {
    // valid_from AFTER valid_until. The predicate refuses every date, so a row
    // like this is dead rather than dangerous - and that is exactly why the
    // defect accumulated for three days without a symptom.
    await sql`insert into availability_templates
                (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until)
              values (${F.tenant}, ${F.therapist}, ${F.cb}, 1, '09:00', '17:00', ${BLANK}, ${SET_CB})`;
    expect(await templateAllows(sql, F.cb, ...at10(BLANK))).toBe(false);
    expect(await templateAllows(sql, F.cb, ...at10(SET_CB))).toBe(false);
  });
});
