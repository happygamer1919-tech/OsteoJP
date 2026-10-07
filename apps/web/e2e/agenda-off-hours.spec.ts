/**
 * agenda-off-hours.spec.ts - AGENDA-OFF-HOURS: the agenda marks the hours the
 * selected therapist does not work.
 *
 * Runs as ADMIN (the default project storage state), on the desktop grid.
 *
 * REPORTED FROM RECEPTION: with the agenda filtered to one therapist, blocked
 * time is a grey band but the hours outside their schedule were empty and looked
 * free. The slot was offered on the phone and the booking then refused.
 *
 * ==========================================================================
 * WHAT A UNIT TEST CANNOT DO, AND THEREFORE WHAT THIS IS FOR
 * ==========================================================================
 * lib/scheduling/off-hours-core.test.ts proves WHICH slots are marked, against
 * `checkAvailability` itself, and app/agenda/agenda-off-hours.test.tsx proves
 * what the grid draws for a given answer. Neither can prove that the page reads
 * the therapist's rows from Postgres under the viewer's own scope, that the
 * answer crosses to the browser, or that the band is absent when no therapist
 * is selected. That path is what this drives.
 *
 * WHAT THIS SPEC DOES NOT PROVE, STATED RATHER THAN IMPLIED. It does not submit
 * a booking into a marked slot to watch the refusal. Its therapist exists for
 * this file only, and the drawer's Terapeuta list comes from a 60-second cache
 * that may not hold a row created seconds ago. "Marked equals refused" is the
 * unit test's claim, made against the function that refuses.
 *
 * ==========================================================================
 * ISOLATION IS BY THERAPIST, AS IN horarios-eliminar-dia-definido.spec.ts
 * ==========================================================================
 * The seeded roster's availability is asserted exactly by the location specs,
 * and "E2E Therapist" is asserted to have NO rows (which is what lets a dozen
 * specs book it at any hour). So this spec builds its OWN login-less therapist
 * with the service-role key, gives it two working periods on one weekday at
 * Linda-a-Velha, books nothing, and removes all of it afterwards. The agenda is
 * opened with `?therapist=<id>` rather than through the Terapeutas select, for
 * the same cache reason as above: the page reads blocks and hours by the id in
 * the URL.
 *
 * ITS DAY IS RUN_DAY_BASE + 170 (171 when that lands on a Sunday), which no
 * other spec derives (scripts/e2e-spec-days-do-not-collide.test.mjs). It writes
 * no appointment, so a retry needs no new day: every fixture row has a fixed id
 * or is keyed by this therapist, and is deleted before it is written.
 *
 * THE ASSERTED SLOTS ARE 10:00 TO 17:30. Other specs move Linda-a-Velha's
 * opening hours and midday closure while they run; every slot named here is
 * inside any of those clinic days and outside 13:00 to 14:00.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The app's own Lisbon conversion, so the block lands on the wall-clock hour
// whichever side of a clock change the day falls.
import { lisbonDateTimeToUtc } from "@/lib/scheduling/time";
import { LOCATION, RUN_DAY_BASE, TENANT_A, futureWeekdayDate } from "./fixtures";

/** This file's day. Never a Sunday, so the week view draws it. */
const DAY = futureWeekdayDate(RUN_DAY_BASE + 170);
const DESKTOP = { width: 1440, height: 900 };

const THERAPIST_ID = "00000000-0000-4000-8000-00000000f0a1";
const THERAPIST_NAME = "E2E Terapeuta Fora Horario";
const THERAPIST_EMAIL = "e2e-therapist-fora-horario@osteojp.test";
const BLOCK_ID = "00000000-0000-4000-8000-00000000f0b1";
const BLOCK_NOTE = "Fora horario E2E";

const OFF_HOURS_NAME = "fora do horário do terapeuta";

const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** A day of the same Monday-to-Saturday week as DAY, on another weekday. */
const OTHER_DAY = weekdayOf(DAY) === 6 ? plusDays(DAY, -1) : plusDays(DAY, 1);

/** Service-role client against the local stack. Never production. */
function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (and the Supabase URL) must be set: agenda-off-hours.spec.ts " +
        "builds its own therapist and working hours with the service role. It refuses to skip, " +
        "because a skipped arm would read as a pass.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function removeBlock(db: SupabaseClient): Promise<void> {
  await db.from("time_off").delete().eq("id", BLOCK_ID);
}

async function cleanUp(db: SupabaseClient): Promise<void> {
  await removeBlock(db);
  await db.from("time_off").delete().eq("tenant_id", TENANT_A).eq("user_id", THERAPIST_ID);
  await db.from("availability_templates").delete().eq("tenant_id", TENANT_A).eq("user_id", THERAPIST_ID);
  await db.from("staff_locations").delete().eq("tenant_id", TENANT_A).eq("user_id", THERAPIST_ID);
  const gone = await db.from("users").delete().eq("id", THERAPIST_ID);
  // Referenced by something (an audit row naming it, say): retire instead, so it
  // can neither be booked nor appear in a roster.
  if (gone.error) await db.from("users").update({ is_active: false, is_bookable: false }).eq("id", THERAPIST_ID);
}

/** The desktop grid's column for a date (only the grid emits `data-day`). */
const column = (page: Page, date: string): Locator => page.locator(`[data-day="${date}"]`);
/** The slot button of a column whose accessible name carries this time. */
const slotAt = (col: Locator, time: string): Locator =>
  col.getByRole("button", { name: new RegExp(` ${time}( - .*)?$`) });
const marked = (col: Locator): Locator => col.locator('button[data-therapist-off-hours="true"]');
const bandsIn = (scope: Locator | Page): Locator => scope.getByTestId("agenda-off-hours-band");

async function openAgenda(page: Page, query: string): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/agenda?${query}`);
  await expect(page.getByRole("heading", { name: /Agenda/i })).toBeVisible();
  await expect(column(page, DAY)).toHaveCount(1);
}

test.describe("AGENDA-OFF-HOURS: the hours a therapist does not work", () => {
  // One fixture for the file; the block test adds and removes its own row.
  test.describe.configure({ mode: "serial" });

  let db: SupabaseClient;

  test.beforeAll(async () => {
    db = serviceClient();
    const role = must(
      await db.from("roles").select("id").eq("tenant_id", TENANT_A).eq("slug", "therapist").single(),
      "therapist role",
    ) as { id: string };

    await cleanUp(db);
    must(
      await db.from("users").upsert({
        id: THERAPIST_ID,
        tenant_id: TENANT_A,
        role_id: role.id,
        email: THERAPIST_EMAIL,
        full_name: THERAPIST_NAME,
        is_bookable: true,
        is_active: true,
      }),
      "therapist row",
    );
    must(
      await db
        .from("staff_locations")
        .upsert(
          { tenant_id: TENANT_A, user_id: THERAPIST_ID, location_id: LOCATION.id },
          { onConflict: "tenant_id,user_id,location_id" },
        ),
      "therapist at Linda-a-Velha",
    );
    // THE HOURS: 10:00-12:00 and 14:00-16:00 on DAY's weekday ONLY, no validity.
    // Every other weekday has none, so OTHER_DAY is a day not worked.
    must(
      await db.from("availability_templates").insert(
        [
          { start_time: "10:00", end_time: "12:00" },
          { start_time: "14:00", end_time: "16:00" },
        ].map((period) => ({
          tenant_id: TENANT_A,
          user_id: THERAPIST_ID,
          location_id: LOCATION.id,
          weekday: weekdayOf(DAY),
          is_active: true,
          ...period,
        })),
      ),
      "the two working periods",
    );
  });

  test.afterAll(async () => {
    if (db) await cleanUp(db);
  });

  test("one therapist selected: the hours outside their schedule are marked, named, and still clickable", async ({
    page,
  }) => {
    await openAgenda(page, `view=day&date=${DAY}&therapist=${THERAPIST_ID}`);
    const day = column(page, DAY);

    // THE BAND, with its words: colour is not the only cue.
    await expect(bandsIn(day).first()).toBeVisible();
    await expect(bandsIn(day).first()).toContainText("Fora do horário");
    // At least the midday gap and the hours after 16:00.
    expect(await bandsIn(day).count()).toBeGreaterThanOrEqual(2);

    // INSIDE THE HOURS: untouched. The name ends at the time.
    for (const time of ["10:00", "11:30", "14:00", "15:30"]) {
      const slot = slotAt(day, time);
      await expect(slot, `${time} is inside the hours`).toHaveCount(1);
      await expect(slot).toHaveAccessibleName(new RegExp(` ${time}$`));
      await expect(slot).not.toHaveAttribute("data-therapist-off-hours", "true");
      await expect(slot).toBeEnabled();
    }

    // OUTSIDE THEM: marked, named for a screen reader, and ENABLED.
    for (const time of ["12:00", "12:30", "16:00", "16:30", "17:00"]) {
      const slot = slotAt(day, time);
      await expect(slot, `${time} is outside the hours`).toHaveCount(1);
      await expect(slot).toHaveAccessibleName(new RegExp(` ${time} - ${OFF_HOURS_NAME}$`));
      await expect(slot).toHaveAttribute("data-therapist-off-hours", "true");
      await expect(slot).toBeEnabled();
    }

    // The band is not the clinic's marker and not either of the other two bands.
    await expect(slotAt(day, "16:30")).not.toHaveAttribute("data-outside-hours", "true");
    await expect(page.getByTestId("agenda-blocked-band")).toHaveCount(0);

    // STILL CLICKABLE, EXACTLY AS BEFORE: the slot opens Nova marcação. The
    // refusal on save is unchanged and is not driven here (see the header).
    await slotAt(day, "16:30").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 8_000 });
  });

  test("week view: a day with no hours is one band from the first slot to the last", async ({ page }) => {
    await openAgenda(page, `view=week&date=${DAY}&therapist=${THERAPIST_ID}`);

    // DAY keeps its own shape in the week.
    await expect(slotAt(column(page, DAY), "10:30")).not.toHaveAttribute("data-therapist-off-hours", "true");
    await expect(slotAt(column(page, DAY), "16:30")).toHaveAttribute("data-therapist-off-hours", "true");

    // OTHER_DAY is not worked: every slot that is still enabled is marked.
    const other = column(page, OTHER_DAY);
    await expect(other).toHaveCount(1);
    await expect(bandsIn(other).first()).toBeVisible();
    const enabled = await other.locator("button[aria-label]:not([disabled])").count();
    expect(enabled, "the not-worked day draws enabled slots").toBeGreaterThan(10);
    await expect(marked(other)).toHaveCount(enabled);
  });

  test("all therapists shown: no band and no marked slot, on the same day", async ({ page }) => {
    // CONTROL FIRST, so the absence below is not a fixture that never loaded.
    await openAgenda(page, `view=day&date=${DAY}&therapist=${THERAPIST_ID}`);
    await expect(bandsIn(page).first()).toBeVisible();

    await openAgenda(page, `view=day&date=${DAY}`);
    await expect(bandsIn(page)).toHaveCount(0);
    await expect(marked(column(page, DAY))).toHaveCount(0);
    await expect(slotAt(column(page, DAY), "16:30")).toHaveAccessibleName(/ 16:30$/);

    await openAgenda(page, `view=week&date=${DAY}`);
    await expect(bandsIn(page)).toHaveCount(0);
  });

  test("a block wins: blocked slots keep the block's name and stay disabled, and the band resumes after it", async ({
    page,
  }) => {
    // 16:00-17:00 Lisbon, inside the off-hours run that starts at 16:00.
    await removeBlock(db);
    must(
      await db.from("time_off").insert({
        id: BLOCK_ID,
        tenant_id: TENANT_A,
        user_id: THERAPIST_ID,
        starts_at: lisbonDateTimeToUtc(DAY, "16:00").toISOString(),
        ends_at: lisbonDateTimeToUtc(DAY, "17:00").toISOString(),
        reason: "other",
        note: BLOCK_NOTE,
      }),
      "the time-off block",
    );
    try {
      await openAgenda(page, `view=day&date=${DAY}&therapist=${THERAPIST_ID}`);
      const day = column(page, DAY);

      await expect(page.getByTestId("agenda-blocked-band")).toHaveCount(1);
      await expect(page.getByTestId("agenda-blocked-note")).toHaveText(BLOCK_NOTE);
      for (const time of ["16:00", "16:30"]) {
        const slot = slotAt(day, time);
        await expect(slot).toHaveAccessibleName(new RegExp(` ${time} - Tempo bloqueado$`));
        await expect(slot).toBeDisabled();
        await expect(slot).not.toHaveAttribute("data-therapist-off-hours", "true");
      }
      // Before the block (the midday gap) and after it, the band is still there.
      await expect(slotAt(day, "12:30")).toHaveAttribute("data-therapist-off-hours", "true");
      await expect(slotAt(day, "17:00")).toHaveAttribute("data-therapist-off-hours", "true");
      await expect(slotAt(day, "17:00")).toBeEnabled();
    } finally {
      await removeBlock(db);
    }
  });
});
