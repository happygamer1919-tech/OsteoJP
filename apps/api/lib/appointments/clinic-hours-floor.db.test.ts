/**
 * clinic-hours-floor.db.test.ts — AGENDA-2100 B7: THE PORTAL NEVER OFFERS AN
 * HOUR BEFORE THE CLINIC OPENS, PROVEN AGAINST A REAL POSTGRES.
 *
 * ==========================================================================
 * WHY THIS EXISTS BESIDE portal-clinic-hours-parity.test.ts
 * ==========================================================================
 * That file is a SOURCE scan: it proves `withinClinicHoursExists` is defined
 * once, states the 60-minute lead, and appears at all three call sites. That is
 * the right shape for "does the predicate appear", and it is what runs on every
 * PR without a database.
 *
 * It cannot answer the question B7 F2 actually asks, which is behavioural and
 * about SQL: *given a therapist whose template starts at 08:00 and a clinic that
 * opens at 09:00, what is the FIRST slot a patient is offered?* The predicate
 * compares a `timestamptz` converted to Europe/Lisbon against a `time` column;
 * whether that comparison is right at the boundary, across the wall-clock
 * conversion, is not a thing a regex can see. `bookable-parity.test.ts` makes
 * exactly this argument for its own pair and then leaves the behaviour to a
 * live suite — this is that live suite.
 *
 * ==========================================================================
 * THE NEGATIVE CONTROL IS THE POINT
 * ==========================================================================
 * The clinic's hours are widened to 08:00 in the last arm and the 08:00 slots
 * come back. Without it, a query that returned nothing at all — a broken join, a
 * tenant mismatch, an empty fixture — would satisfy every "08:00 is not offered"
 * assertion above and look exactly like a working floor. Running the same read
 * twice, once where the row must appear and once where it must not, is what
 * makes either run evidence.
 *
 * GATING: needs a live DATABASE_URL with migrations applied (see
 * .github/workflows/db-tests.yml, which runs `vitest run .db.test.ts` in this
 * app). Skipped without one.
 */
import { randomUUID } from "node:crypto";

import { sql as raw } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/**
 * A fixed instant the horizon is measured from, so the days this test reads are
 * the same days on every run. 2027-03-01 is BEFORE Lisbon's 2027 clock change
 * (the last Sunday of March), so the whole window sits in WET = UTC+0 and the
 * wall-clock arithmetic has one offset rather than two.
 */
const NOW = new Date("2027-03-01T00:00:00.000Z");
const HORIZON_DAYS = 6;
const DURATION_MIN = 60;

/** The Lisbon wall-clock "HH:MM" of an instant, asked of the same tz the SQL uses. */
const lisbonHHMM = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));

d("AGENDA-2100: the advertised slot grid starts at opens_at, not at the therapist's template", () => {
  let db: Awaited<ReturnType<typeof import("@osteojp/db").getDbAdmin>>;
  let listOpenSlots: typeof import("./store").drizzleAppointmentsStore.listOpenSlots;

  let tenantId: string;
  let locationId: string;
  let therapistId: string;
  let patientId: string;

  const principal = () => ({ tenantId, patientId, role: "patient" }) as never;

  const slots = (): Promise<string[]> =>
    listOpenSlots(principal(), {
      locationId,
      durationMin: DURATION_MIN,
      horizonDays: HORIZON_DAYS,
      now: NOW,
      practitionerId: null,
    } as never);

  /** Every distinct Lisbon start time the portal would advertise. */
  async function offeredTimes(): Promise<string[]> {
    const iso = await slots();
    return [...new Set(iso.map(lisbonHHMM))].sort();
  }

  const setHours = (opensAt: string) =>
    db.execute(raw`update locations set opens_at = ${opensAt}::time
                    where id = ${locationId} and tenant_id = ${tenantId}`);

  beforeAll(async () => {
    const { getDbAdmin } = await import("@osteojp/db");
    db = getDbAdmin();
    ({
      drizzleAppointmentsStore: { listOpenSlots },
    } = await import("./store"));

    tenantId = randomUUID();
    locationId = randomUUID();
    therapistId = randomUUID();
    patientId = randomUUID();

    await db.execute(raw`insert into tenants (id, name, slug)
      values (${tenantId}, 'Clinic Hours Co', ${"ch-" + tenantId.slice(0, 8)})`);

    // Opens 09:00, closes 21:00 - the hours GREEN sets. The hourly step is what
    // the owner's PL-25 ruling gives the portal, so the offered times are whole
    // hours and the boundary is unambiguous.
    await db.execute(raw`insert into locations
        (id, tenant_id, name, opens_at, closes_at, slot_granularity_min)
      values (${locationId}, ${tenantId}, 'Linda-a-Velha (teste)', '09:00', '21:00', 60)`);

    await db.execute(raw`insert into users
        (id, tenant_id, email, full_name, is_active, is_bookable)
      values (${therapistId}, ${tenantId}, ${"t-" + therapistId.slice(0, 8) + "@t.test"},
              'Terapeuta Madrugador', true, true)`);

    await db.execute(raw`insert into patients (id, tenant_id, full_name)
      values (${patientId}, ${tenantId}, 'Paciente Portal')`);

    // THE THERAPIST STARTS AT 08:00, WHICH IS THE WHOLE FIXTURE. This is LV's
    // real shape: 15 active schedule rows there start before 09:00. Every
    // weekday is templated so the horizon yields slots whichever day NOW lands
    // on, and the test never has to reason about the calendar.
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.execute(raw`insert into availability_templates
          (id, tenant_id, user_id, location_id, weekday, start_time, end_time, is_active)
        values (${randomUUID()}, ${tenantId}, ${therapistId}, ${locationId},
                ${weekday}, '08:00', '21:00', true)`);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(raw`delete from availability_templates where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from patients where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from users where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from locations where tenant_id = ${tenantId}`);
    await db.execute(raw`delete from tenants where id = ${tenantId}`);
  });

  it("offers something at all - the positive control", async () => {
    // Without this, every refusal assertion below could be satisfied by a query
    // that returns nothing for a reason unrelated to the clinic's hours.
    await setHours("09:00");
    expect((await slots()).length).toBeGreaterThan(0);
  });

  it("THE FIRST OFFERED SLOT IS 09:00, even though the therapist's template starts 08:00", async () => {
    await setHours("09:00");
    const times = await offeredTimes();
    expect(times[0]).toBe("09:00");
  });

  it("never offers 08:00, 08:15, 08:30 or 08:45 at any point in the horizon", async () => {
    // Named rather than counted: a failure should say WHICH shut hour was
    // advertised. The quarter-hours are listed even though the step is 60,
    // because the step is per-location DATA and a future 15-minute clinic must
    // not quietly reopen the floor.
    await setHours("09:00");
    const times = await offeredTimes();
    expect(times.filter((t) => t < "09:00")).toEqual([]);
  });

  it("still stops at 20:00, so the two halves of the rule hold together", async () => {
    // The latest start is `closes_at` minus 60. Asserting it here keeps this
    // suite honest about the whole predicate rather than only its floor - a
    // change that dropped the upper bound would otherwise pass every arm above.
    await setHours("09:00");
    const times = await offeredTimes();
    expect(times[times.length - 1]).toBe("20:00");
  });

  it("offers every whole hour between them, so the floor narrows and nothing else", async () => {
    await setHours("09:00");
    const expected = Array.from({ length: 12 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);
    expect(await offeredTimes()).toEqual(expected);
  });

  /**
   * THE NEGATIVE CONTROL. Widen the clinic and 08:00 must come back. This is
   * what tells a real floor apart from a query that was returning nothing, and
   * it is the arm that proves the filter is `opens_at` rather than some other
   * predicate that happens to exclude the early hours.
   */
  it("offers 08:00 the moment the clinic itself opens at 08:00 - nothing else changed", async () => {
    await setHours("08:00");
    const times = await offeredTimes();
    expect(times[0]).toBe("08:00");
    expect(times).toContain("09:00");
    // The upper bound is untouched by the floor: closes_at did not move.
    expect(times[times.length - 1]).toBe("20:00");
  });
});
