/**
 * week-schedule-vs-dated.db.test.ts — the P0 of 2026-09-08, against a real
 * database.
 *
 * ==========================================================================
 * WHAT RECEPTION REPORTED, AND WHY A PURE TEST COULD NOT HAVE FOUND IT
 * ==========================================================================
 * CB reception set a date window on a therapist, then could not save the weekly
 * editor again: "Nao foi possivel guardar as alteracoes", every time, with days
 * that would not stay ticked. The workaround she found — "Definir dia a dia" —
 * worked, which is why the schedule was right and the editor was not.
 *
 * THE MECHANISM IS AN INTERACTION BETWEEN TWO LAYERS, so neither layer's own
 * unit tests could see it. Layer 2 (a dated window) CARVES layer 1: the weekly
 * row is bounded to the day before the window and an IDENTICAL row resumes the
 * day after (lib/scheduling/schedule-window.ts). That leaves two active rows on
 * the same (therapist, weekday, location) with the same times and DISJOINT
 * validity — a legal, invariant-satisfying pair that layer 2 itself wrote.
 *
 * `assertNoOverlap` in ./availability.ts then refused to touch either of them,
 * because it compared TIMES ONLY and never read valid_from / valid_until. So
 * every therapist who had ever had a date window applied had a permanently
 * unsavable weekly editor for those weekdays.
 *
 * THE SECOND HALF IS THE ONE THAT MADE IT LOOK LIKE MADNESS. `reconcileWeek`
 * drives seven weekdays and each write opened its OWN transaction, so a refusal
 * on Wednesday left Sunday, Monday and Tuesday already committed while the
 * banner said the save had failed. The screen and the database disagreed, which
 * is exactly what reception described.
 *
 * BOTH ARMS RUN HERE. "the carve is legal" and "the week is atomic" go RED on
 * the code as it stood this morning and green after the fix; "a genuinely
 * overlapping dated row is still refused" is the control that proves the fix did
 * not simply delete the guard.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const live = Boolean(process.env.DATABASE_URL);
const d = live ? describe : describe.skip;

/** The reported window: Mon 14/09 .. Fri 18/09 2026. */
const WINDOW_START = "2026-09-14";
const WINDOW_END = "2026-09-18";
const TUE_IN_WINDOW = "2026-09-15";
const MON_IN_WINDOW = "2026-09-14";

d("P0: the weekly editor after a dated window", () => {
  let db: ReturnType<typeof import("@osteojp/db").getDbAdmin>;
  let schema: typeof import("@osteojp/db");
  let availability: typeof import("./availability");
  let dayByDay: typeof import("./day-by-day-schedule");

  const tenant = randomUUID();
  const role = randomUUID();
  const ownerId = randomUUID();
  const therapist = randomUUID();
  const cb = randomUUID();

  /** Owner: resolveScheduleScope gives {kind:"all"}, so the fixture needs no
   *  staff_locations rows and the test is about the schedule, not the scope. */
  const actor = () => ({ tenantId: tenant, role: "owner" as const, userId: ownerId });

  type Row = {
    id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    valid_from: string | null;
    valid_until: string | null;
  };

  const rowsFor = async (weekday: number): Promise<Row[]> => {
    const { sql } = await import("drizzle-orm");
    const res = await db.execute<Row>(
      sql`select id, weekday, start_time::text, end_time::text,
                 valid_from::text as valid_from, valid_until::text as valid_until
            from public.availability_templates
           where user_id = ${therapist} and weekday = ${weekday} and is_active = true
           order by valid_from nulls first, start_time`,
    );
    return (Array.isArray(res) ? res : ((res as { rows?: Row[] }).rows ?? [])) as Row[];
  };

  const countActive = async (): Promise<number> => {
    const { sql } = await import("drizzle-orm");
    const res = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from public.availability_templates
           where user_id = ${therapist} and is_active = true`,
    );
    const list = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
    return Number((list[0] as { n: string }).n);
  };

  beforeAll(async () => {
    schema = await import("@osteojp/db");
    db = schema.getDbAdmin();
    availability = await import("./availability");
    dayByDay = await import("./day-by-day-schedule");
    const { sql } = await import("drizzle-orm");

    await db.execute(
      sql`insert into public.tenants (id, name, slug) values (${tenant}, 'sched', ${`sched-${tenant.slice(0, 8)}`})`,
    );
    await db.execute(
      sql`insert into public.roles (id, tenant_id, slug, name) values (${role}, ${tenant}, 'owner', 'Owner')`,
    );
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name)
          values (${ownerId}, ${tenant}, ${role}, ${`o-${ownerId.slice(0, 8)}@sched.test`}, 'Owner')`,
    );
    await db.execute(
      sql`insert into public.users (id, tenant_id, role_id, email, full_name, is_bookable)
          values (${therapist}, ${tenant}, ${role}, ${`t-${therapist.slice(0, 8)}@sched.test`}, 'JP', true)`,
    );
    await db.execute(
      sql`insert into public.locations (id, tenant_id, name, is_active)
          values (${cb}, ${tenant}, 'Castelo Branco', true)`,
    );
    // The base week reception's screenshot shows: Terca and Sabado, undated.
    await db.execute(
      sql`insert into public.availability_templates
            (tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${tenant}, ${therapist}, ${cb}, 2, '09:00', '17:00')`,
    );
    await db.execute(
      sql`insert into public.availability_templates
            (tenant_id, user_id, location_id, weekday, start_time, end_time)
          values (${tenant}, ${therapist}, ${cb}, 6, '09:00', '13:00')`,
    );
  });

  afterAll(async () => {
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`delete from public.tenants where id = ${tenant}`);
  });

  it("a dated window CARVES the weekly row, leaving two rows with disjoint validity", async () => {
    const res = await dayByDay.applyDayByDaySchedule(actor(), therapist, {
      startDate: WINDOW_START,
      endDate: WINDOW_END,
      // Mon, Tue, Thu, Fri at 09:00-20:00. WEDNESDAY IS DELIBERATELY ABSENT:
      // the reported inspector showed 16/09 as "Nao trabalha", and the window is
      // exhaustive by design, so an unset day is a day not worked.
      entries: [
        { date: MON_IN_WINDOW, locationId: cb, startTime: "09:00", endTime: "20:00" },
        { date: TUE_IN_WINDOW, locationId: cb, startTime: "09:00", endTime: "20:00" },
        { date: "2026-09-17", locationId: cb, startTime: "09:00", endTime: "20:00" },
        { date: "2026-09-18", locationId: cb, startTime: "09:00", endTime: "20:00" },
      ],
    });
    expect(res.ok).toBe(true);

    const tue = await rowsFor(2);
    // head (…-> 13/09), the dated day (15/09), and the resume (19/09 ->).
    expect(tue).toHaveLength(3);
    expect(tue.map((r) => [r.valid_from, r.valid_until])).toEqual([
      [null, "2026-09-13"],
      ["2026-09-15", "2026-09-15"],
      ["2026-09-19", null],
    ]);
    // Wednesday got nothing, which is what "Nao trabalha" on 16/09 means.
    expect(await rowsFor(3)).toHaveLength(0);
  });

  it("THE P0: editing the carved weekly row is legal and must be allowed", async () => {
    const tue = await rowsFor(2);
    const head = tue.find((r) => r.valid_from === null)!;
    // Reception widens Terca to 09:00-20:00. The resume row (19/09 ->) has the
    // SAME times and the SAME location and can never apply on the same date, so
    // there is no double coverage and nothing to refuse.
    await expect(
      availability.updateAvailabilityTemplate(actor(), head.id, {
        userId: therapist,
        locationId: cb,
        weekday: 2,
        startTime: "09:00",
        endTime: "20:00",
      }),
    ).resolves.toBeUndefined();

    const after = await rowsFor(2);
    expect(after.find((r) => r.id === head.id)!.end_time).toBe("20:00:00");
    // The carve is untouched: an update must not widen the row's validity.
    expect(after.find((r) => r.id === head.id)!.valid_until).toBe("2026-09-13");
  });

  it("THE CONTROL: a weekly row that WOULD double-cover a dated date is still refused", async () => {
    // Monday has no base row and one dated row on 14/09. An UNDATED Monday row
    // covers 14/09 too, so the two genuinely double-cover and the refusal is
    // correct. If the fix had simply deleted the guard, this goes green-red.
    await expect(
      availability.createAvailabilityTemplate(actor(), {
        userId: therapist,
        locationId: cb,
        weekday: 1,
        startTime: "09:00",
        endTime: "20:00",
      }),
    ).rejects.toMatchObject({ name: "AdminError" });
    // And nothing was written.
    expect((await rowsFor(1)).map((r) => r.valid_from)).toEqual([MON_IN_WINDOW]);
  });

  it("THE SECOND HALF: a week that fails partway writes NOTHING", async () => {
    const { saveWeekSchedule } = await import("./week-schedule");
    const before = await countActive();
    // Sunday is legal and would be created first; Monday is the refusal above.
    // Before the fix each write had its own transaction, so Sunday survived a
    // failed save and the banner said nothing had been saved.
    const fd = new Map<string, string>([
      ["d0_on", "on"],
      ["d0_id", ""],
      ["d0_start", "10:00"],
      ["d0_end", "12:00"],
      ["d0_location", cb],
      ["d1_on", "on"],
      ["d1_id", ""],
      ["d1_start", "09:00"],
      ["d1_end", "20:00"],
      ["d1_location", cb],
    ]);
    await expect(
      saveWeekSchedule(actor(), therapist, { get: (n: string) => fd.get(n) ?? null }),
    ).rejects.toMatchObject({ name: "AdminError" });
    expect(await countActive()).toBe(before);
    expect(await rowsFor(0)).toHaveLength(0);
  });
});
