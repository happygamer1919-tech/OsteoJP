/**
 * agenda-2100-last-row.spec.ts — THE 20:00-21:00 ROW, ON THE DRAWN PAGE.
 *
 * ==========================================================================
 * WHAT THIS PROVES THAT NO UNIT TEST CAN
 * ==========================================================================
 * `clinic-hours-window.test.ts` proves `gridWindow` returns 09:00-21:00 and
 * `agenda-grid-hours.test.tsx` proves the component draws what it is handed.
 * Neither of them ever loads the page, and the owner's complaint is about the
 * page: the agenda stops at 19:00-20:00 and the clinic works until 21:00.
 *
 * So this sets a clinic's real hours in the database, loads the real agenda, and
 * asserts the last row is there AND usable:
 *   - the closing label reads 21:00, not 20:00
 *   - the 09:00 and 20:00 hour labels are drawn
 *   - the 20:00 slot is ENABLED and opens Nova marcação, so "bookable" means
 *     bookable rather than merely visible
 *
 * ON A WEEKDAY AND ON A SATURDAY, because Q-HOURS = a covers every open day and
 * Saturday is the one that has bitten this repo before (the week grid is Mon-Sat
 * and a Sunday-derived date silently renders the wrong six days).
 *
 * ==========================================================================
 * IT CREATES ITS OWN CLINIC, AND THAT IS NOT TIDINESS
 * ==========================================================================
 * The obvious move is to borrow LOCATION_B, the way agenda-clinic-closure.spec.ts
 * borrows it for its closure. IT WOULD COLLIDE. That spec asserts LOCATION_B's
 * closing label reads "20:00"; this one would set the same clinic to 21:00 for
 * the length of its run. The day-offset guard cannot see that: it protects
 * against two specs deriving the same DAY, and opening hours are a property of
 * the CLINIC, true of every day at once. Two specs in one shard, on different
 * days, would still fight.
 *
 * So this spec inserts its own clinic, uses it, and deletes it in afterAll.
 *
 * DAYS 100-106 (Saturday search) and 110-111 (weekday), private to this file per
 * scripts/e2e-spec-days-do-not-collide.test.mjs.
 */
import { test, expect, type Page } from "@playwright/test";

import { RUN_DAY_BASE, TENANT_A, futureDate, futureWeekdayDate } from "./fixtures";
import { serviceClient } from "./helpers/confirm-code";

/** This spec's own clinic. No other spec books, reads or asserts here. */
const CLINIC = {
  id: "00000000-0000-0000-0000-00000000a1ff",
  name: "Clínica 2100 (E2E)",
} as const;

/** The hours Q-HOURS = a asks for. */
const OPENS = "09:00:00";
const CLOSES = "21:00:00";

/** The same shape weekend-two-period.spec.ts uses, and the day guard reads it. */
function nextWeekday(fromOffset: number, weekday: number): string {
  for (let i = 0; i < 14; i++) {
    const iso = futureDate(fromOffset + i);
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() === weekday) return iso;
  }
  throw new Error(`no weekday ${weekday} found`);
}

const SATURDAY = nextWeekday(RUN_DAY_BASE + 100, 6);
const WEEKDAY = futureWeekdayDate(RUN_DAY_BASE + 110);

async function createClinic() {
  const db = serviceClient();
  const { data, error } = await db
    .from("locations")
    .upsert(
      {
        id: CLINIC.id,
        tenant_id: TENANT_A,
        name: CLINIC.name,
        is_active: true,
        opens_at: OPENS,
        closes_at: CLOSES,
      },
      { onConflict: "id" },
    )
    .select("id, opens_at, closes_at");
  if (error) throw new Error(`could not create the clinic: ${error.message}`);
  // READ IT BACK. A PostgREST write whose filter matches nothing returns no error
  // and no rows, and the symptom would be "the grid still ends at 20:00" - an
  // afternoon spent in the component for a write that never happened.
  if (!data || data.length !== 1) {
    throw new Error(`the clinic write matched ${data?.length ?? 0} rows, expected 1`);
  }
  if (data[0]?.closes_at?.slice(0, 5) !== "21:00") {
    throw new Error(`the clinic reads ${data[0]?.closes_at}, expected 21:00`);
  }
}

async function dropClinic() {
  const db = serviceClient();
  await db.from("locations").delete().eq("id", CLINIC.id).eq("tenant_id", TENANT_A);
}

/**
 * THE AGENDA'S CLINIC LIST IS CACHED FOR 60 SECONDS
 * (`fetchAgendaReferenceData`, and nothing invalidates its tag when hours change
 * because there is no hours editor - SQL is the only writer). So this reloads
 * until the page has caught up, exactly as agenda-clinic-closure.spec.ts does,
 * rather than asserting once and calling a cache a bug.
 */
async function reloadUntilClosingLabel(page: Page, url: string, label: string) {
  await expect
    .poll(
      async () => {
        await page.goto(url);
        return page.getByTestId("agenda-closing-label").textContent();
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000, 10_000] },
    )
    .toBe(label);
}

test.beforeAll(async () => {
  await createClinic();
});

test.afterAll(async () => {
  await dropClinic();
});

for (const [name, day] of [
  ["a weekday", WEEKDAY],
  ["a Saturday", SATURDAY],
] as const) {
  test(`AGENDA-2100: on ${name}, the agenda runs to 21:00 and the 20:00 row is bookable`, async ({
    page,
  }, testInfo) => {
    // Generous, because of the 60s reference-data cache described above.
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 800 });

    const url = `/agenda?view=day&date=${day}&location=${CLINIC.id}`;
    await reloadUntilClosingLabel(page, url, "21:00");

    // (1) THE REPORTED SYMPTOM, from the other side: the gutter used to end at
    //     20:00 and the last row was 19:00-20:00.
    await expect(page.getByTestId("agenda-closing-label")).toHaveText("21:00");

    // (2) The first and last hour rows the new hours ask for.
    await expect(page.getByText("09:00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("20:00", { exact: true }).first()).toBeVisible();

    // (3) BOOKABLE, not merely visible. The slot is a real <button>, enabled, and
    //     it opens Nova marcação - the distinction agenda-clinic-closure.spec.ts
    //     draws when it asserts a CLOSED slot is disabled.
    //
    //     THE NAME ENDS WITH THE TIME, it does not equal it: the slot's
    //     aria-label is `${formatDayHeader(d, locale)} ${slotLabel(m)}`, so an
    //     anchored /^20:00$/ matches nothing. That spec's own /09:30$/ is the
    //     same shape.
    const slot = page.getByRole("button", { name: /20:00$/ }).first();
    await expect(slot).toBeEnabled();

    const shot = testInfo.outputPath(`agenda-2100-${day}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    await testInfo.attach(`agenda-2100-${day}.png`, { path: shot, contentType: "image/png" });

    await slot.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(/Nova marca/i);
  });
}

test("AGENDA-2100: 20:30 is the last slot, and 21:00 is a label rather than a bookable start", async ({
  page,
}) => {
  /**
   * The closing time ends the gutter; it is never a slot. A 21:00 slot would be
   * a booking that starts after the clinic shuts, which is the other half of the
   * rule this card adds on the write paths.
   */
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await reloadUntilClosingLabel(
    page,
    `/agenda?view=day&date=${WEEKDAY}&location=${CLINIC.id}`,
    "21:00",
  );
  await expect(page.getByRole("button", { name: /20:30$/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /21:00$/ })).toHaveCount(0);
});
