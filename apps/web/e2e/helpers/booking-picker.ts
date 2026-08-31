import type { Page } from "@playwright/test";

import { becameVisible } from "./index";

/**
 * ACC-e2e-booking-traversal-duplicated — ONE COPY OF THE DATE-PICKER TRAVERSAL.
 *
 * ==========================================================================
 * WHY THIS FILE EXISTS, AND THE BILL THE DUPLICATION ALREADY RAN UP.
 * ==========================================================================
 * `sync-portal-agenda.spec.ts` drove the portal booking flow first and took FIVE
 * SESSIONS to stabilise this traversal. When
 * `portal-booking-request-mode.spec.ts` needed the same thing, it grew its own
 * copy and INVENTED ITS OWN LOCATORS. Both were wrong:
 *
 *   `getByRole("gridcell").filter({ hasNot: locator("[aria-disabled='true']") })`
 *     `hasNot` filters by DESCENDANT, not by the element's own attribute, so it
 *     matched every gridcell INCLUDING the disabled ones. The click then hung on
 *     a disabled button for the full 120s budget, three times, at 2.1 minutes
 *     each. One 12m33s shard.
 *   `getByRole("radio")` unnamed
 *     matches any radio on the step rather than a time.
 *
 * The second copy was then corrected by pasting the proven forms across, which
 * fixed that instance and left the duplication - so the next change to the
 * booking flow would have to be found in two places, and the second one would be
 * missed the way it was missed the first time.
 *
 * ==========================================================================
 * EXTRACTING IT FOUND A THIRD DEFECT IN THE COPY, STILL LIVE ON main.
 * ==========================================================================
 * THE POPOVER CLOSES ON SELECT. The proven version reopens it before every
 * attempt after the first; the copy in `portal-booking-request-mode.spec.ts`
 * did NOT. So its day walk could only ever succeed on the FIRST day it tried:
 * every later `days.nth(i).click()` was acting on a dialog that was no longer
 * open, and the loop would fall through to "no slot" and return the LEGITIMATE
 * SKIP. A flow defect degrading into the one outcome that skips instead of
 * failing - which is exactly the collapse the discriminated result below exists
 * to prevent, in the very helper that was written to respect it.
 *
 * It never fired because the seed's first enabled day happens to carry slots.
 * That is luck, not a property.
 *
 * ==========================================================================
 * WHAT IS SHARED AND WHAT IS DELIBERATELY NOT.
 * ==========================================================================
 * SHARED: the picker trigger, the dialog, the two hard-won locators, the day
 * walk with its reopen, and the pt-PT label parsing.
 *
 * NOT SHARED: each spec's own way of reaching the date step. They legitimately
 * differ - one waits on the clinic BUTTON by seeded name, the other on the
 * clinic HEADING after a URL assertion - and each is right for what its file is
 * about. Collapsing those into one "flexible" opener is how a shared helper
 * turns into a second thing to debug.
 *
 * NOT SHARED EITHER: the submit. Both specs click Continuar then Confirmar, but
 * what they do NEXT differs completely (one reads the appointment id off the
 * pending URL, the other only needs a boolean), and a helper that owned the
 * submit would have to own the assertions after it too.
 */

/**
 * THE DISCRIMINATED RESULT IS THE POINT AND MUST SURVIVE ANY REFACTOR OF THIS
 * FILE. `empty-calendar` is a LEGITIMATE SKIP - a developer's database need not
 * be seeded. `flow-broken` is a DEFECT and must be red. Collapsing them into a
 * boolean or a null is LOOP 7's most expensive lesson, and it has already been
 * re-learned twice in this traversal alone.
 */
export type PickOutcome =
  | { ok: true; slot: string; isoDate: string }
  | { ok: false; why: "empty-calendar"; detail: string }
  | { ok: false; why: "flow-broken"; detail: string };

/**
 * The DatePicker's day cells carry `aria-label` as a pt-PT long date —
 * "segunda-feira, 17 de agosto de 2026". Converted to ISO so a test can assert
 * against THE DAY IT BOOKED rather than searching a window.
 *
 * THE LOCALE IS FIXED, so this is deterministic rather than a guess: the portal
 * renders pt-PT only, and `DatePicker` formats with that locale unconditionally.
 * A month name it does not recognise returns null, and the caller treats that as
 * a flow defect, never as an empty calendar.
 */
const PT_MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function isoFromPtLabel(label: string): string | null {
  const m = /(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i.exec(label.toLowerCase());
  if (!m) return null;
  const month = PT_MONTHS.indexOf(m[2]!);
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/**
 * "ENABLED" IS AN INTERVAL, NOT THE SET OF DAYS WITH SLOTS, and this bound is
 * why the walk exists at all. `inRange` is a CLOSED interval
 * (`DatePicker.tsx:119`), so every day between the first and last available date
 * is enabled - including the six weekdays that carry nothing, because the seed's
 * availability is MONDAY ONLY. An earlier version clicked the first enabled day
 * and asserted it must have slots; CI said otherwise.
 */
const MAX_DAYS_TRIED = 14;

/**
 * Open the date picker on step 4, walk enabled days until one yields slots, and
 * select the first slot. Leaves the flow ON step 4 with a slot chosen; the
 * caller advances and submits.
 *
 * `log` is optional and prefixed by the caller, so the gate-bearing spec keeps
 * its `[W13-07]` trace lines and the other spec stays quiet.
 */
export async function pickFirstDayWithSlots(
  page: Page,
  log?: (message: string) => void,
): Promise<PickOutcome> {
  // THE PICKER MUST BE PROVEN TO OPEN. An earlier draft clicked the trigger
  // under `.catch(() => {})`: a missing or mis-located trigger therefore did
  // nothing, no gridcells existed, and the helper returned `empty-calendar` - a
  // BROKEN FLOW degrading silently into the outcome that SKIPS instead of
  // failing.
  const trigger = page.getByRole("button", { name: /escolh|data/i });
  if ((await trigger.count()) === 0) {
    return { ok: false, why: "flow-broken", detail: "date/time step has no date-picker trigger" };
  }
  await trigger.first().click();

  // The popover is `role="dialog"` (DatePicker.tsx). If it did not open, the
  // trigger is not what we think it is — a flow defect, never an empty calendar.
  if (!(await becameVisible(page.getByRole("dialog").first(), 10_000))) {
    return { ok: false, why: "flow-broken", detail: "date picker did not open when clicked" };
  }

  // `.and()` intersects on the ELEMENT, which is what `hasNot` did not do.
  // Enabled cells carry NO `aria-disabled` attribute at all, which is why
  // `:not([aria-disabled])` is right and `[aria-disabled='false']` finds nothing.
  const day = page.getByRole("gridcell").and(page.locator(":not([aria-disabled])"));
  await day.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  let dayCount = await day.count();

  /**
   * THE CALENDAR OPENS ON THE CURRENT MONTH, AND AVAILABILITY IS SEEDED ON ONE
   * WEEKDAY. Those two facts collide on a predictable day.
   *
   * seed-e2e.mjs seeds `therapistLocOne` at LOCATION_A for weekday 1 ONLY -
   * Monday, 09:00-13:00. Run the suite on a Monday afternoon and the only
   * Monday left in the current month is today, whose slots are already past, so
   * the month view offers nothing and the helper reported `empty-calendar`. In
   * CI that is a hard failure by design, and on 2026-08-31 - a Monday - it took
   * shard 3 red on every PR open at the time, including two whose diffs touched
   * neither booking nor the portal.
   *
   * THE CALENDAR WAS NEVER EMPTY. The next selectable Monday was one month
   * click away. So the helper now pages forward before concluding anything: an
   * absence of days in ONE month view is a statement about that view, not about
   * availability.
   *
   * Bounded, and deliberately small. Two clicks reach ~8 weeks ahead, which is
   * far enough for any weekly-recurring seed and short enough that a genuinely
   * empty calendar still fails fast instead of walking the calendar forever.
   */
  const MAX_MONTHS_FORWARD = 2;
  for (let m = 0; dayCount === 0 && m < MAX_MONTHS_FORWARD; m++) {
    const nextMonth = page.getByRole("button", { name: /mês seguinte/i });
    if ((await nextMonth.count()) === 0) break;
    await nextMonth.first().click();
    await day
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {});
    dayCount = await day.count();
  }

  // ONLY NOW is an absence of selectable days a statement about the calendar.
  if (dayCount === 0) {
    return {
      ok: false,
      why: "empty-calendar",
      detail: `date picker offered no selectable day in this month or the next ${MAX_MONTHS_FORWARD}`,
    };
  }

  // ROLE `radio`, NOT `button`. SlotPicker renders each slot as
  // `<button type="button" role="radio">` inside a `role="radiogroup"`, and an
  // explicit role OVERRIDES the implicit one - so `getByRole("button")` never
  // matched a slot and a walk using it could not have succeeded on any run.
  const slot = page.getByRole("radio", { name: /^\d{2}:\d{2}$/ });

  let bookedIso: string | null = null;
  let tried = 0;
  for (let i = 0; i < Math.min(dayCount, MAX_DAYS_TRIED); i++) {
    // THE POPOVER CLOSES ON SELECT, so it is reopened for every attempt after
    // the first. Omitting this is the third defect this traversal has carried
    // and it is invisible whenever the first day happens to have slots.
    if (i > 0) {
      await trigger.first().click();
      await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 10_000 });
    }
    const label = (await day.nth(i).getAttribute("aria-label")) ?? "?";
    await day.nth(i).click();
    tried++;
    // The day's slots come from `byDate`, ALREADY IN MEMORY — selecting a date
    // re-renders, it does not re-fetch. 5s per empty day was dead time and a
    // 35s swing inside one test is how a race gets in.
    await slot.first().waitFor({ state: "visible", timeout: 1_500 }).catch(() => {});
    if ((await slot.count()) > 0) {
      bookedIso = isoFromPtLabel(label);
      log?.(`booking day = ${label} -> ${bookedIso} (day ${i + 1} of ${dayCount} enabled)`);
      break;
    }
  }

  if ((await slot.count()) === 0) {
    return {
      ok: false,
      why: "empty-calendar",
      detail: `no slot on any of the first ${tried} selectable day(s)`,
    };
  }

  const slotLabel = (await slot.first().textContent())?.trim() ?? "";
  await slot.first().click();

  if (!bookedIso) {
    // A day was selected and slots appeared, so the flow WORKED — this is a
    // parsing failure, not an empty calendar, and it must not skip.
    return {
      ok: false,
      why: "flow-broken",
      detail: "could not derive an ISO date from the picker's aria-label",
    };
  }
  return { ok: true, slot: slotLabel, isoDate: bookedIso };
}
