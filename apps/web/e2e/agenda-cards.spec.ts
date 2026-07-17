/**
 * agenda-cards.spec.ts - W9-05, CB QA items 5 + 7.
 *
 * Runs as ADMIN. Proves end to end, on real booked data, the two card changes
 * that need integration coverage (the geometry + colour + tick-suppression
 * logic is unit-tested in agenda-grid.test.tsx and therapist-color.test.ts):
 *   - (7) the therapist NAME renders on the card, with a per-therapist colour
 *     dot/spine beside it.
 *   - (5) cancelling a card strikes the patient name through AND suppresses the
 *     confirmation tick, so a cancelled-and-confirmed card never shows both.
 *
 * Books its own appointment on a dedicated future day and cancels it in place,
 * so it accrues no shared state. Reference therapist is the E2E therapist.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";
const DAY = futureDate(RUN_DAY_BASE + 28); // no other spec books this day

test("W9-05: the card shows the therapist name + a per-therapist colour, and cancelling strikes it through and drops the tick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Book a 1h appointment (tall enough for the therapist line to render).
  const dialog = await openNewAppointment(page, DAY);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date: DAY,
    time: "14:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // The card is the button carrying the patient name.
  const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });
  await expect(card).toBeVisible({ timeout: 8_000 });

  // ITEM 7: the therapist name is on the card (it was absent before W9-05).
  await expect(card.getByTestId("agenda-card-therapist")).toContainText(THERAPIST_NAME);

  // The per-therapist colour dot is present next to the name (a filled span; the
  // exact hue is asserted deterministically in the unit test).
  await expect(
    card.getByTestId("agenda-card-therapist").locator("span.rounded-full"),
  ).toHaveCount(1);

  // Baseline: a freshly booked card is NOT struck through.
  await expect(card.getByTestId("agenda-card-patient")).toHaveCSS(
    "text-decoration-line",
    "none",
  );

  // Cancel it: open the card -> edit drawer -> Estado = Cancelada.
  await card.click();
  const edit = page.getByRole("dialog");
  await expect(edit).toBeVisible({ timeout: 8_000 });
  await edit.getByLabel(/^Estado/i).selectOption({ label: "Cancelada" });
  const saveBtn = edit.getByRole("button", { name: /Guardar|Aplicar|Atualizar/i }).first();
  if (await saveBtn.count()) await saveBtn.click();
  await expect(edit).toBeHidden({ timeout: 12_000 });

  // ITEM 5: the cancelled card's patient name is struck through...
  const cancelledCard = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });
  await expect(cancelledCard.getByTestId("agenda-card-patient")).toHaveCSS(
    "text-decoration-line",
    "line-through",
    { timeout: 8_000 },
  );

  // ...and the confirmation tick is suppressed: the ConfirmationIndicator emits
  // an sr-only label ("Confirmação ...") on a live card; a cancelled card emits
  // none, so no confirmation label remains on it.
  await expect(cancelledCard.getByText(/Confirmação/)).toHaveCount(0);
});
