/**
 * date-picker-calendar-open.spec.ts - SR-62 U1. The calendar in the appointment
 * drawer can be OPENED and then USED, on Nova marcacao and on Marcar novamente.
 *
 * ==========================================================================
 * THE DEFECT, AS THE CLINIC MET IT (video, 2026-09-11 12:41 Lisbon, Safari)
 * ==========================================================================
 * Press the calendar icon: the month opens. Press "Mes seguinte", or a day: the
 * month VANISHES and nothing is picked. Eight times in thirty seconds, across
 * Marcar novamente and Bloquear horario. There is no error text on screen and
 * no Sentry issue, because nothing throws - the popover simply unmounts.
 *
 * THE MECHANISM, MEASURED WITH A FOCUS-EVENT TRACE. Opening the calendar moves
 * focus onto a day cell. Pressing "Mes seguinte" in real WebKit: the day cell's
 * focusout carries relatedTarget = the drawer's modal <dialog>, focus lands on
 * that dialog, and no click event fires. In Chromium the same press reports the
 * button, which is inside the picker. The picker closed on every blur whose
 * relatedTarget was not inside itself, so in WebKit it unmounted between
 * mousedown and click.
 *
 * ==========================================================================
 * WHY EVERY CASE RUNS TWICE, ONCE WITH WEBKIT'S RULE EMULATED IN CHROMIUM
 * ==========================================================================
 * CI runs `--project=chromium` only, and plain Chromium was green over this
 * defect for the eight days it was reachable. So each case also runs under
 * `emulateWebKitButtonFocus`, which reproduces the measured behaviour and
 * nothing else: mousedown on a button does not focus it, and focus falls back
 * to the <dialog> around it. The webkit project runs the plain mode in the real
 * engine, and skips the emulated one, which would only stack a copy of the rule
 * on top of itself.
 *
 * THE EMULATION HAD TO MATCH THE MEASUREMENT, AND THE FIRST ONE DID NOT. It
 * sent focus to the body (relatedTarget null). The fix written against it went
 * green in Chromium and stayed red in real WebKit, and the trace above is what
 * showed the difference. An emulation is only a guard for the case it copies.
 *
 * THE OUTSIDE-CLICK ARM IS NOT DECORATION. The fix stops a fallback-to-container
 * blur from closing the popover, and that blur was ALSO how a click on empty
 * space in the drawer closed it. A fix that kept the calendar open inside and
 * could no longer be dismissed outside would pass the first arm and ship a
 * different defect, so both are asserted, in both modes.
 *
 * READ-ONLY. Nova marcacao is opened and never saved; Marcar novamente is
 * opened on the seeded 2022 appointment (seed-e2e ensureDeclaracaoAppointment)
 * and never confirmed. Nothing is written, so the cross-browser projects,
 * which share one non-reset database, can run it safely.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

import { dateField } from "./helpers";
import { futureDate, RUN_DAY_BASE } from "./fixtures";

/** Seeded by seed-e2e `ensureDeclaracaoAppointment`: Maria, Linda-a-Velha, completed. */
const SEEDED_PAST_APPOINTMENT = { id: "00000000-0000-0000-0000-0000000ad001", day: "2022-03-15" } as const;

const MODES = [
  { label: "as the browser focuses", emulate: false },
  { label: "as WebKit focuses", emulate: true },
] as const;

/**
 * WebKit's rule, in Chromium, as the trace measured it: a mouse press on a
 * button does not move focus to the button; focus falls back to the <dialog>
 * around it, or leaves to the body when there is none. Registered before any
 * page script runs, in the capture phase, so it precedes every app handler.
 */
async function emulateWebKitButtonFocus(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener(
      "mousedown",
      (e) => {
        const button = e.target instanceof Element ? e.target.closest("button") : null;
        if (!button) return;
        e.preventDefault();
        const dialog = button.closest("dialog");
        if (dialog) {
          // A <dialog> is not programmatically focusable in Chromium without
          // a tabindex; WebKit focuses it natively.
          if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
          dialog.focus();
        } else {
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body) active.blur();
        }
      },
      true,
    );
  });
}

/**
 * The Nova marcacao drawer. In WebKit the press on the toolbar button was lost
 * in two of three runs (the drawer never opened), on a page that also logs a
 * hydration mismatch there. The cause is not established and it is not this
 * spec's subject, so the press is repeated until the drawer is open - never
 * pressed again once it is.
 */
async function openNovaMarcacao(page: Page): Promise<Locator> {
  await page.goto(`/agenda?view=day&date=${futureDate(RUN_DAY_BASE + 36)}`);
  const drawer = page.getByRole("dialog");
  await expect(async () => {
    if (!(await drawer.isVisible())) {
      await page.getByRole("button", { name: /Nova Marcação/i }).click({ timeout: 3_000 });
    }
    await expect(drawer).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  return drawer;
}

/**
 * The month popover. It is `role="dialog"` named by the field's label; the
 * drawer around it is a dialog too, named by its title, so `exact` matters.
 */
function calendarIn(drawer: Locator): Locator {
  return drawer.getByRole("dialog", { name: "Data", exact: true });
}

/** The Data field's calendar toggle - the first one in the drawer. */
function toggleIn(drawer: Locator): Locator {
  return drawer.getByRole("button", { name: "Abrir calendário" }).first();
}

/** Open the month, move it, pick a day - the three things the clinic could not do. */
async function driveCalendar(drawer: Locator): Promise<void> {
  const calendar = calendarIn(drawer);
  const field = dateField(drawer);
  const valueBefore = await field.inputValue();

  await toggleIn(drawer).click();
  await expect(calendar).toBeVisible();
  const header = calendar.locator('[aria-live="polite"]');
  const monthBefore = (await header.textContent()) ?? "";
  expect(monthBefore).not.toBe("");

  // THE PRESS THE CLINIC FILMED: a button INSIDE the open month.
  await calendar.getByRole("button", { name: "Mês seguinte" }).click();
  await expect(calendar).toBeVisible();
  await expect(header).not.toHaveText(monthBefore);

  // And a day, which is the reason anybody opens the calendar.
  await calendar.getByRole("gridcell").filter({ hasText: /^15$/ }).click();
  await expect(calendar).toBeHidden();
  await expect(field).toHaveValue(/^15\/\d{2}\/\d{4}$/);
  await expect(field).not.toHaveValue(valueBefore);
}

/** A press on empty space in the drawer, outside the picker, still dismisses it. */
async function expectOutsideClickCloses(drawer: Locator): Promise<void> {
  const calendar = calendarIn(drawer);
  await toggleIn(drawer).click();
  await expect(calendar).toBeVisible();
  await drawer.locator("header h2").first().click();
  await expect(calendar).toBeHidden();
}

for (const mode of MODES) {
  test.describe(`SR-62 U1 - the drawer calendar opens and stays usable (${mode.label})`, () => {
    test.beforeEach(async ({ page, browserName }) => {
      test.skip(
        mode.emulate && browserName === "webkit",
        "WebKit applies this focus rule natively; the plain mode covers it",
      );
      if (mode.emulate) await emulateWebKitButtonFocus(page);
    });

    test("Nova marcação", async ({ page }) => {
      const drawer = await openNovaMarcacao(page);
      await driveCalendar(drawer);
      await expectOutsideClickCloses(drawer);
    });

    test("Marcar novamente", async ({ page }) => {
      await page.goto(`/agenda?view=day&date=${SEEDED_PAST_APPOINTMENT.day}`);
      const card = page.locator(`[data-appointment-id="${SEEDED_PAST_APPOINTMENT.id}"]`);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.click();
      await page.getByRole("dialog").getByRole("button", { name: "Marcar novamente" }).click();

      const drawer = page.getByRole("dialog", { name: "Marcar novamente", exact: true });
      await expect(drawer).toBeVisible();
      await driveCalendar(drawer);
      await expectOutsideClickCloses(drawer);
    });
  });
}
