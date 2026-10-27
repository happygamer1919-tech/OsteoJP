import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

/**
 * PORTAL-ROSTER - THE HALF A TYPESCRIPT TEST CANNOT REACH, for the portal's
 * therapist step.
 *
 * `listBookableTherapists` (apps/api/lib/appointments/store.ts) decides who the
 * patient is offered at a clinic. It is raw SQL, so the only TypeScript arm that
 * can say anything about it is a SOURCE SCAN - and a source scan proves the
 * characters are present, never that Postgres agrees about what they mean. This
 * file is the other half: the predicate's shape, run against a real database,
 * with rows that make each bound matter.
 *
 * THE DEFECT IT PINS. The roster's EXISTS carried `av.is_active = true` and NO
 * validity window, while the two neighbouring predicates in the same file
 * (`availabilityCoversExists`, and slot generation) both compare `valid_from` and
 * `valid_until` against the day being booked. So a template whose window had
 * CLOSED but whose `is_active` flag was still true kept its therapist on the
 * portal roster for that clinic; the patient chose them, and the slot query -
 * which does read the window - then offered nothing. The roster advertised
 * somebody the next step refuses.
 *
 * THE INSTRUMENT AND ITS CONTROL ARE DIFFERENT FILES, deliberately, and neither
 * substitutes for the other:
 *   - reverting the predicate in store.ts reddens the SOURCE arms in
 *     apps/api/lib/appointments/therapist-choice.test.ts, which is where that
 *     control lives;
 *   - this file's own control is the LAST test below, which runs the OLD shape
 *     against the SAME fixture and shows the expired therapist coming back. That
 *     is what proves these rows discriminate, rather than the suite passing
 *     because the fixture never inserted.
 *
 * DUPLICATION NOTE, matching its siblings: apps/api is not being refactored into
 * a shared package this wave, so the predicate is mirrored MINIMALLY rather than
 * imported, exactly as day-by-day-portal.db.test.ts and
 * alternating-weeks-portal.db.test.ts already do. Same TODO(@osteojp/scheduling).
 *
 * GATING: needs a privileged DATABASE_URL with migrations applied; skipped
 * without one, exactly like every other suite here. It needs NO pending
 * migration - `valid_from`/`valid_until` have existed since 0006 - so it runs on
 * every PR and belongs on no skip list.
 *
 * SHARED-DATABASE DISCIPLINE: every assertion is scoped to this fixture's own
 * tenant. The lane database accumulates rows from other suites and other
 * sessions, so a global count here would be a race.
 */

/**
 * R15 (strategy, 2026-10-26): the roster reads the template window against the
 * slot step's horizon, [today, today + OPEN_SLOTS_HORIZON_DAYS]. The number is
 * READ from apps/api/lib/appointments/booking.ts rather than restated, so this
 * mirror cannot keep an old horizon after the constant moves.
 */
const HORIZON_DAYS = Number(
  readFileSync(join(__dirname, "..", "..", "..", "apps", "api", "lib", "appointments", "booking.ts"), "utf8").match(
    /export const OPEN_SLOTS_HORIZON_DAYS = (\d+);/,
  )?.[1],
);

const F = {
  tenant: "00000000-0000-0000-0000-0000000b1101",
  role: "00000000-0000-0000-0000-0000000b1102",
  cb: "00000000-0000-0000-0000-0000000b1103",
  lv: "00000000-0000-0000-0000-0000000b1104",
  // One therapist per condition, so a failure names the condition.
  openEnded: "00000000-0000-0000-0000-0000000b1110",
  current: "00000000-0000-0000-0000-0000000b1111",
  expired: "00000000-0000-0000-0000-0000000b1112",
  future: "00000000-0000-0000-0000-0000000b1113",
  archived: "00000000-0000-0000-0000-0000000b1114",
  notBookable: "00000000-0000-0000-0000-0000000b1115",
  sharedResource: "00000000-0000-0000-0000-0000000b1116",
  otherClinic: "00000000-0000-0000-0000-0000000b1117",
  beyondHorizon: "00000000-0000-0000-0000-0000000b1118",
};

/**
 * The roster predicate from store.ts `listBookableTherapists`, verbatim in
 * shape, WITH the validity bounds, `valid_from` read against the slot horizon
 * (R15).
 *
 * DATES ARE COMPUTED IN POSTGRES, not in JavaScript, and relative to the clinic's
 * own today. A fixture with absolute dates ages into meaninglessness, and one
 * that reads the machine clock measures the machine rather than the database.
 */
async function roster(sql: Sql, locationId: string): Promise<string[]> {
  const rows = await sql<{ practitioner_id: string }[]>`
    select distinct u.id as practitioner_id, u.full_name as full_name
    from users u
    where u.tenant_id = ${F.tenant}
      and u.is_active = true
      and u.is_bookable = true
      and u.is_shared_resource = false
      and exists (
        select 1 from availability_templates av
        where av.tenant_id = ${F.tenant}
          and av.user_id = u.id
          and av.location_id = ${locationId}
          and av.is_active = true
          and (av.valid_from  is null or av.valid_from  <= (now() at time zone 'Europe/Lisbon')::date + ${HORIZON_DAYS}::int)
          and (av.valid_until is null or av.valid_until >= (now() at time zone 'Europe/Lisbon')::date)
      )
    order by u.full_name
  `;
  return rows.map((r) => r.practitioner_id);
}

/** The predicate as Q-ROSTER left it, before R15: both bounds against today alone. */
async function rosterTodayOnly(sql: Sql, locationId: string): Promise<string[]> {
  const rows = await sql<{ practitioner_id: string }[]>`
    select distinct u.id as practitioner_id, u.full_name as full_name
    from users u
    where u.tenant_id = ${F.tenant}
      and u.is_active = true
      and u.is_bookable = true
      and u.is_shared_resource = false
      and exists (
        select 1 from availability_templates av
        where av.tenant_id = ${F.tenant}
          and av.user_id = u.id
          and av.location_id = ${locationId}
          and av.is_active = true
          and (av.valid_from  is null or av.valid_from  <= (now() at time zone 'Europe/Lisbon')::date)
          and (av.valid_until is null or av.valid_until >= (now() at time zone 'Europe/Lisbon')::date)
      )
    order by u.full_name
  `;
  return rows.map((r) => r.practitioner_id);
}

/** The predicate EXACTLY as it stood before PORTAL-ROSTER: no validity bounds. */
async function rosterBeforeTheFix(sql: Sql, locationId: string): Promise<string[]> {
  const rows = await sql<{ practitioner_id: string }[]>`
    select distinct u.id as practitioner_id, u.full_name as full_name
    from users u
    where u.tenant_id = ${F.tenant}
      and u.is_active = true
      and u.is_bookable = true
      and u.is_shared_resource = false
      and exists (
        select 1 from availability_templates av
        where av.tenant_id = ${F.tenant}
          and av.user_id = u.id
          and av.location_id = ${locationId}
          and av.is_active = true
      )
    order by u.full_name
  `;
  return rows.map((r) => r.practitioner_id);
}

async function seed(sql: Sql): Promise<void> {
  await sql`insert into tenants (id, name, slug)
            values (${F.tenant}, 'Portal Roster', ${`portal-roster-${F.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.cb}, ${F.tenant}, 'Castelo Branco')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.lv}, ${F.tenant}, 'Linda-a-Velha')`;

  const user = (
    id: string,
    name: string,
    opts: { bookable?: boolean; shared?: boolean } = {},
  ) =>
    sql`insert into users (id, tenant_id, role_id, email, full_name, is_active, is_bookable, is_shared_resource)
        values (${id}, ${F.tenant}, ${F.role}, ${`u-${id.slice(-4)}@portal-roster.test`}, ${name},
                true, ${opts.bookable ?? true}, ${opts.shared ?? false})`;

  // Names drive `order by u.full_name`; letters keep the order readable.
  await user(F.openEnded, "A Aberta");
  await user(F.current, "B Corrente");
  await user(F.expired, "C Expirada");
  await user(F.future, "D Futura");
  await user(F.archived, "E Arquivada");
  await user(F.notBookable, "F Nao Bookable", { bookable: false });
  await user(F.sharedResource, "G Recurso", { shared: true });
  await user(F.otherClinic, "H Outra Clinica", {});
  await user(F.beyondHorizon, "I Alem do Horizonte");

  /** Offsets are days from the clinic's today, resolved by Postgres. */
  const tpl = (
    userId: string,
    locationId: string,
    fromOffset: number | null,
    untilOffset: number | null,
    isActive = true,
  ) =>
    sql`insert into availability_templates
          (tenant_id, user_id, location_id, weekday, start_time, end_time,
           valid_from, valid_until, is_active)
        values (${F.tenant}, ${userId}, ${locationId}, 1, '09:00', '17:00',
                ${fromOffset === null ? null : sql`(now() at time zone 'Europe/Lisbon')::date + ${fromOffset}::int`},
                ${untilOffset === null ? null : sql`(now() at time zone 'Europe/Lisbon')::date + ${untilOffset}::int`},
                ${isActive})`;

  await tpl(F.openEnded, F.cb, null, null);
  await tpl(F.current, F.cb, -30, 30);
  // THE DEFECT ROW: the window closed yesterday, the flag was never cleared.
  await tpl(F.expired, F.cb, -60, -1);
  // Starts tomorrow: inside the slot horizon, so listed since R15 (Q-ROSTER,
  // = now, excluded it). The test named for it below is where a change of that
  // ruling lands.
  await tpl(F.future, F.cb, 1, 60);
  // Starts the day after the horizon's last day: no slot can come from it, so
  // it stays off the roster.
  await tpl(F.beyondHorizon, F.cb, HORIZON_DAYS + 1, HORIZON_DAYS + 60);
  await tpl(F.archived, F.cb, null, null, false);
  await tpl(F.notBookable, F.cb, null, null);
  await tpl(F.sharedResource, F.cb, null, null);
  await tpl(F.otherClinic, F.lv, null, null);
}

describe.skipIf(!live)("PORTAL-ROSTER - template validity, as the portal's SQL sees it", () => {
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

  it("PREMISE: the horizon was read from booking.ts", () => {
    expect(Number.isInteger(HORIZON_DAYS) && HORIZON_DAYS > 0).toBe(true);
  });

  it("PREMISE: all nine therapists and nine templates really seeded", async () => {
    // Without this, every "is not listed" below could be a fixture that never
    // inserted, and the suite would pass while proving nothing.
    const users = await sql<{ n: number }[]>`
      select count(*)::int as n from users where tenant_id = ${F.tenant}
    `;
    const tpls = await sql<{ n: number }[]>`
      select count(*)::int as n from availability_templates where tenant_id = ${F.tenant}
    `;
    expect(users[0]?.n).toBe(9);
    expect(tpls[0]?.n).toBe(9);
  });

  it("AN EXPIRED TEMPLATE NO LONGER LISTS ITS THERAPIST - the defect", async () => {
    // GREEN G8 T1, carded by STEWARD as PORTAL-ROSTER-expired-template-still-listed.
    expect(await roster(sql, F.cb)).not.toContain(F.expired);
  });

  it("an open-ended template still lists, so the fix narrowed and did not empty", async () => {
    expect(await roster(sql, F.cb)).toContain(F.openEnded);
  });

  it("a window that COVERS today still lists", async () => {
    expect(await roster(sql, F.cb)).toContain(F.current);
  });

  it("a template that has not STARTED yet lists when it starts inside the slot horizon, and not beyond it (R15)", async () => {
    // THE ASYMMETRY WORTH KNOWING. `valid_until` is the defect: an expired row can
    // never be offered at any date, so excluding it is strictly correct.
    // `valid_from` is the RULING: the roster step has no date, and R15 (strategy,
    // 2026-10-26, replacing Q-ROSTER's "now") settles it as the days the slot
    // step can offer. A template starting tomorrow is listed; one starting after
    // the horizon's last day is not. If that ruling changes, THIS test is the one
    // place that has to change with it.
    const listed = await roster(sql, F.cb);
    expect(listed).toContain(F.future);
    expect(listed).not.toContain(F.beyondHorizon);
  });

  it("the rules that were already there are untouched", async () => {
    const listed = await roster(sql, F.cb);
    expect(listed).not.toContain(F.archived); // is_active = false
    expect(listed).not.toContain(F.notBookable); // PL-06b
    expect(listed).not.toContain(F.sharedResource); // NESA and friends
    expect(listed).not.toContain(F.otherClinic); // scoped by av.location_id
  });

  it("the clinic scoping still holds from the other side", async () => {
    const atLv = await roster(sql, F.lv);
    expect(atLv).toEqual([F.otherClinic]);
  });

  it("the whole roster at CB is exactly the three therapists who should be there", async () => {
    // Ordered by full_name: "A Aberta", "B Corrente", "D Futura".
    expect(await roster(sql, F.cb)).toEqual([F.openEnded, F.current, F.future]);
  });

  it("CONTROL FOR R15: today alone (Q-ROSTER) leaves out the therapist who starts tomorrow", async () => {
    // The fixture discriminates the R15 change: under the old instant the same
    // rows give the roster without "D Futura".
    expect(await rosterTodayOnly(sql, F.cb)).toEqual([F.openEnded, F.current]);
  });

  it("NEGATIVE CONTROL: the OLD predicate lists the expired therapist, and both future ones", async () => {
    // THE FIXTURE IS DISCRIMINATING, PROVED BOTH WAYS. Run the pre-change shape
    // against these same rows and the two excluded therapists come straight back.
    // Without this arm, every "not listed" above would also pass against a
    // fixture whose templates failed to insert, or whose dates landed outside the
    // range by accident.
    const before = await rosterBeforeTheFix(sql, F.cb);
    expect(before).toContain(F.expired);
    expect(before).toContain(F.future);
    expect(before).toContain(F.beyondHorizon);
    expect(before).toEqual([F.openEnded, F.current, F.expired, F.future, F.beyondHorizon]);
  });
});
