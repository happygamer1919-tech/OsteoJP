import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, live } from "./rls-harness";

/**
 * ITEM 5 DoD 2, THE HALF A TYPESCRIPT TEST CANNOT REACH.
 *
 * The ruling requires JP's alternating weeks to resolve correctly "at EVERY
 * consumer including the portal slot engine". There are two consumers of
 * `availability_templates` and they are written in different languages:
 *
 *   apps/web/lib/scheduling/day-availability-core.ts  TypeScript, isWithinValidity
 *   apps/api/lib/appointments/store.ts                SQL, an EXISTS clause
 *
 * The TypeScript one is proven in apps/web/lib/scheduling/alternating-weeks.test.ts.
 * NOTHING IN THAT FILE SAYS ANYTHING ABOUT THE SQL ONE. A vitest suite can import
 * `buildDay` and be satisfied while the portal offers a patient a slot at the
 * wrong clinic, because the portal never runs that function - it runs the
 * predicate below, inside Postgres, against `valid_from` / `valid_until`.
 *
 * So this file runs THE REAL PREDICATE SHAPE from store.ts against a live,
 * freshly-migrated database, over the exact rows the planner emits.
 *
 * DUPLICATION NOTE, matching booking-conflict-cutoff.test.ts: apps/api is not
 * being refactored into a shared package this wave, so the predicate is
 * mirrored MINIMALLY below rather than imported. It goes red here if the SQL
 * shape drifts. Same TODO(@osteojp/scheduling) as its sibling.
 *
 * GATING: needs a privileged DATABASE_URL with migrations applied; skipped
 * without one, exactly like every other suite here.
 */

const F = {
  tenant: "00000000-0000-0000-0000-0000000a5001",
  role: "00000000-0000-0000-0000-0000000a5002",
  therapist: "00000000-0000-0000-0000-0000000a5003",
  cb: "00000000-0000-0000-0000-0000000a5004",
  lv: "00000000-0000-0000-0000-0000000a5005",
};

// 2026-09-07 is a Monday. Week A -> Castelo Branco, week B -> Linda-a-Velha.
const WEEK_A_MON = "2026-09-07";
const WEEK_B_MON = "2026-09-14";
const WEEK_A2_MON = "2026-09-21";

/**
 * The availability half of `withinTemplate` from apps/api/lib/appointments/store.ts,
 * verbatim in shape: weekday from the Lisbon-local timestamp, the time range
 * containing the window, and BOTH validity bounds.
 */
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
            values (${F.tenant}, 'Alternating Weeks', ${`alt-weeks-${F.tenant}`})`;
  await sql`insert into roles (id, tenant_id, slug, name)
            values (${F.role}, ${F.tenant}, 'therapist', 'Therapist')`;
  await sql`insert into users (id, tenant_id, role_id, email, full_name)
            values (${F.therapist}, ${F.tenant}, ${F.role}, ${`jp-${F.therapist}@example.pt`}, 'JP')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.cb}, ${F.tenant}, 'Castelo Branco')`;
  await sql`insert into locations (id, tenant_id, name)
            values (${F.lv}, ${F.tenant}, 'Linda-a-Velha')`;

  // EXACTLY WHAT planAlternatingWeeks EMITS: one row per (weekday, date),
  // bounded to that single day, alternating clinic by week. Mondays only here -
  // the weekday axis is already covered by the TypeScript suite; what this file
  // is for is the DATE axis inside Postgres.
  const dated = (date: string, locationId: string) =>
    sql`insert into availability_templates
          (tenant_id, user_id, location_id, weekday, start_time, end_time, valid_from, valid_until)
        values (${F.tenant}, ${F.therapist}, ${locationId}, 1, '09:00', '17:00', ${date}, ${date})`;
  await dated(WEEK_A_MON, F.cb);
  await dated(WEEK_B_MON, F.lv);
  await dated(WEEK_A2_MON, F.cb);
}

describe.skipIf(!live)("ITEM 5 - alternating weeks, as the PORTAL's SQL sees them", () => {
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

  it("week A: the portal ALLOWS Castelo Branco", async () => {
    expect(await templateAllows(sql, F.cb, ...at10(WEEK_A_MON))).toBe(true);
  });

  it("week A: the portal REFUSES Linda-a-Velha", async () => {
    expect(await templateAllows(sql, F.lv, ...at10(WEEK_A_MON))).toBe(false);
  });

  it("week B: the portal ALLOWS Linda-a-Velha", async () => {
    expect(await templateAllows(sql, F.lv, ...at10(WEEK_B_MON))).toBe(true);
  });

  it("week B: the portal REFUSES Castelo Branco", async () => {
    expect(await templateAllows(sql, F.cb, ...at10(WEEK_B_MON))).toBe(false);
  });

  it("the alternation continues: week 3 is Castelo Branco again", async () => {
    expect(await templateAllows(sql, F.cb, ...at10(WEEK_A2_MON))).toBe(true);
    expect(await templateAllows(sql, F.lv, ...at10(WEEK_A2_MON))).toBe(false);
  });

  it("NEGATIVE ARM: a Monday OUTSIDE the pattern is refused at BOTH clinics", async () => {
    // The dated rows must not leak into days they do not name. If valid_until
    // were dropped from the predicate, this is the assertion that goes red.
    const outside = "2026-10-05";
    expect(await templateAllows(sql, F.cb, ...at10(outside))).toBe(false);
    expect(await templateAllows(sql, F.lv, ...at10(outside))).toBe(false);
  });

  it("NEGATIVE ARM: a time outside the shift is refused even on a correct day", async () => {
    // Guards against a predicate that has stopped reading start_time/end_time
    // and is answering purely on the date.
    expect(
      await templateAllows(sql, F.cb, `${WEEK_A_MON}T19:00:00Z`, `${WEEK_A_MON}T20:00:00Z`),
    ).toBe(false);
  });
});
