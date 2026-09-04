/**
 * agenda-cards.spec.ts - W11-00 v3 (owner ruling 2026-07-21 evening) + W9-05 item 5.
 *
 * Runs as ADMIN. Proves end to end, on real booked data, the Fisiozero list model:
 *   - an appointment is one LINE = the patient full name, coloured in the
 *     therapist hue; NO card / stripe / dot / tint / icon / time / service /
 *     therapist text on the grid face.
 *   - same-slot appointments STACK VERTICALLY: equal left x, strictly different y
 *     (never side by side).
 *   - W12-11 R10: cancelling shows the distinct RED "Cancelada" estado glyph and
 *     does NOT strike the name (the strikethrough now belongs to Falta/no_show);
 *     the confirmation tick is dropped. A freshly booked name is never struck.
 * (The colour hashing + grouping logic is unit-tested in agenda-grid.test.tsx and
 * therapist-color.test.ts.)
 *
 * The name line is a <button> carrying the patient name; the hover panel is a
 * SIBLING of that button, so a locator scoped to the button asserts the face
 * alone. Books its own appointments on dedicated future days and cancels in
 * place, so it accrues no shared state. Reference therapist is the E2E therapist.
 */
import { test, expect, type Locator } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import {
  PATIENTS,
  LOCATION,
  SERVICE,
  THERAPIST_NAME,
  futureWeekdayDate,
  RUN_DAY_BASE,
} from "./fixtures";

const SAVE = "Guardar";
// Sunday-safe on purpose: this file asserts against the agenda GRID, and the
// week view is Mon-Sat, so a Sunday day is not rendered there at all.
//
// LE-e2e-appointment-fixture-drift: THIS TEST RUNS IN THE DAY VIEW
// (openNewAppointment navigates to view=day), so only this date's cards are on
// the page and a page-wide locator is safe HERE. The test below runs in the
// WEEK view and that is a different situation entirely - see its own note. The
// comment this line used to carry, "no other spec books this day", was TRUE and
// said nothing about the WEEK, which is the axis that actually bit.
const DAY = futureWeekdayDate(RUN_DAY_BASE + 28);
const BOOK_TIME = "14:00";
// The 7 therapist -700 hues (therapist-color.ts). The name line must carry one.
const THERAPIST_TEXT_COLOR = /text-(accent-[12]|v2-(blue|burgundy|green|gold|lavender))-700/;

/**
 * Assert one appointment LINE (the button locator) is the therapist-coloured
 * patient NAME and nothing else: name present + a therapist colour class, and
 * NONE of the removed chrome (dot / therapist / service / time / tick) on it.
 */
async function expectNameLine(card: Locator, patientName: string) {
  await expect(card).toBeVisible({ timeout: 8_000 });
  await expect(card.getByTestId("agenda-card-patient")).toContainText(patientName);
  // (9c) the name line carries a per-therapist colour class.
  await expect(card).toHaveClass(THERAPIST_TEXT_COLOR);
  // (2/9a) removed chrome: no therapist dot, no therapist/service/time/tick text.
  await expect(card.getByTestId("agenda-card-therapist-dot")).toHaveCount(0);
  await expect(card.getByText(THERAPIST_NAME)).toHaveCount(0);
  await expect(card.getByText(SERVICE.name)).toHaveCount(0);
  await expect(card.getByText(BOOK_TIME)).toHaveCount(0);
  await expect(card.getByText(/Confirmação/)).toHaveCount(0);
}

test("W11-00 v3 + W12-11 R10: an appointment is a therapist-coloured name line; cancelling shows the Cancelada glyph (no strikethrough) and drops the tick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const dialog = await openNewAppointment(page, DAY);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: DAY,
    time: BOOK_TIME,
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });
  await expectNameLine(card, PATIENTS.maria.name);

  // (9d) baseline: a freshly booked, non-cancelled name is NOT struck through.
  await expect(card.getByTestId("agenda-card-patient")).toHaveCSS(
    "text-decoration-line",
    "none",
  );

  // Cancel it: open the line -> edit drawer -> Estado = Cancelada.
  await card.click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await edit.getByLabel(/^Estado/i).selectOption({ label: "Cancelada" });
  const saveBtn = edit.getByRole("button", { name: /Guardar|Aplicar|Atualizar/i }).first();
  if (await saveBtn.count()) await saveBtn.click();
  await expect(edit).toBeHidden({ timeout: 12_000 });

  // (W12-11 R10) the cancelled line shows the distinct Cancelada estado glyph...
  const cancelledCard = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });
  await expect(cancelledCard.locator('[data-estado="cancelada"]')).toBeVisible({
    timeout: 8_000,
  });
  // ...and is NOT struck through (the strikethrough belongs to Falta/no_show).
  await expect(cancelledCard.getByTestId("agenda-card-patient")).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  // ...and the confirmation tick is suppressed (it lives in the hover, never the face).
  await expect(cancelledCard.getByText(/Confirmação/)).toHaveCount(0);
});

test("W11-00 v3: three same-slot appointments stack VERTICALLY (equal x, different y) in BOTH Dia and Semana", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Sunday-safe: this test asserts the three cards in BOTH Dia and Semana, and
  // the week grid is Mon-Sat. A Sunday date rendered the PRECEDING week, so the
  // cards were genuinely absent and this failed about one run in seven.
  //
  // LE-e2e-appointment-fixture-drift, MEASURED 2026-09-03 AND FIXED HERE.
  // This line used to say "dedicated day, no other spec books it". That was
  // TRUE about the DAY and irrelevant to the assertion, which is made in the
  // WEEK view - and the Mon-Sat week grid renders SIX days. RUN_DAY_BASE + 28
  // (the test above, which deliberately leaves a CANCELLED Maria Silva behind
  // as its own assertion) and RUN_DAY_BASE + 33 are five days apart, so they
  // share a Mon-Sat window for 85 of the 300 values RUN_DAY_BASE can take -
  // 28% of runs. On those runs the page held TWO Maria Silva lines and a strict
  // page-wide locator resolved to 2.
  //
  // THE FIX IS THE LOCATOR'S SCOPE, NOT THE CALENDAR. Moving the offsets apart
  // would fix this pair by arithmetic that has to be redone every time an
  // offset moves, and would do nothing about a third spec booking the same
  // patient in the same week. The assertion is about ONE day's column; it now
  // says so, in both views, through `dayColumn()`.
  const date = futureWeekdayDate(RUN_DAY_BASE + 33);
  const names = [PATIENTS.maria.name, PATIENTS.joao.name, PATIENTS.ana.name];

  // Book three appointments at the SAME 14:00 slot (same therapist). In v3 they
  // stack vertically as three name lines; the 2nd + 3rd conflict -> save anyway.
  for (let i = 0; i < names.length; i++) {
    const dialog = await openNewAppointment(page, date);
    await fillAppointment(dialog, {
      patient: names[i]!,
      therapist: THERAPIST_NAME,
      location: LOCATION.name,
      date,
      time: BOOK_TIME,
    });
    await dialog.getByRole("button", { name: SAVE }).click();
    if (i > 0) {
      await dialog.getByRole("button", { name: /Guardar mesmo assim/i }).click();
    }
    await expect(dialog).toBeHidden({ timeout: 12_000 });
  }

  for (const view of ["day", "week"] as const) {
    await page.goto(`/agenda?view=${view}&date=${date}`);

    // EVERY LOCATOR BELOW IS SCOPED TO THIS DAY'S COLUMN. In `day` that is the
    // only column and the scope is a no-op; in `week` it is one of six, and it
    // is the difference between asserting about this test's fixtures and
    // asserting about whatever else the week happens to hold.
    const column = page.locator(`[data-day="${date}"]`);
    await expect(
      column,
      `the week grid has no column for ${date} - the view did not land on the ` +
        "expected week, so every assertion below would be about the wrong days",
    ).toHaveCount(1);

    // Each line is a name-only, therapist-coloured line (no chrome).
    for (const name of names) {
      await expectNameLine(column.getByRole("button", { name: new RegExp(name) }), name);
    }

    // (9b) vertical-stack proof: same start slot -> equal left x, strictly
    // increasing y. Two overlapping appointments never share a row.
    const boxes: { name: string; x: number; y: number }[] = [];
    for (const name of names) {
      const line = column.getByRole("button", { name: new RegExp(name) });
      // ONE line per name IN THIS COLUMN. Asserted rather than assumed: an x/y
      // comparison over a locator that silently matched two elements would
      // compare the wrong boxes and could still pass.
      await expect(line, `exactly one ${name} line in ${view} on ${date}`).toHaveCount(1);
      const box = await line.boundingBox();
      expect(box, `bounding box for ${name} in ${view}`).not.toBeNull();
      boxes.push({ name, x: box!.x, y: box!.y });
    }
    boxes.sort((a, b) => a.y - b.y);
    const x0 = boxes[0]!.x;
    for (const b of boxes) {
      expect(Math.abs(b.x - x0), `${b.name} left x aligned in ${view}`).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.y, `${boxes[i]!.name} below ${boxes[i - 1]!.name} in ${view}`).toBeGreaterThan(
        boxes[i - 1]!.y,
      );
    }

    // Per-view proof screenshot (owner visual gate artifact).
    await page.screenshot({ path: `test-results/w11-00-3-overlap-${view}.png` });
  }
});
