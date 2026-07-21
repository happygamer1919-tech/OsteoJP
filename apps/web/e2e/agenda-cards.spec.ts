/**
 * agenda-cards.spec.ts - W9-05 (CB QA items 5 + 7) + W11-00 (W10-05b) face-only.
 *
 * Runs as ADMIN. Proves end to end, on real booked data, the card contract that
 * needs integration coverage (geometry + colour + tick-suppression logic is
 * unit-tested in agenda-grid.test.tsx and therapist-color.test.ts):
 *   - (7) a per-therapist colour dot/spine is on the card, the therapist NAME is
 *     NOT (it left the face for the hover in #618).
 *   - (5) cancelling a card strikes the patient name through AND suppresses the
 *     confirmation tick, so a cancelled-and-confirmed card never shows both.
 *   - (W11-00) the card FACE is the patient name ONLY - readable at 3-overlap in
 *     BOTH Dia and Semana at 1/3 width - and carries NO time / service /
 *     therapist-name / confirmation text (that detail lives in the hover popup).
 *
 * The face is the <button> carrying the patient name; the hover panel is a
 * SIBLING of that button, so a locator scoped to the card button asserts the
 * face alone and never trips on the hover's (legitimate) detail.
 *
 * Books its own appointments on dedicated future days and cancels in place, so it
 * accrues no shared state. Reference therapist is the E2E therapist.
 */
import { test, expect, type Locator } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import {
  PATIENTS,
  LOCATION,
  SERVICE,
  THERAPIST_NAME,
  futureDate,
  RUN_DAY_BASE,
} from "./fixtures";

const SAVE = "Guardar";
const DAY = futureDate(RUN_DAY_BASE + 28); // no other spec books this day
const BOOK_TIME = "14:00";

/**
 * Assert a card FACE (the button locator) is the patient name ONLY: the name is
 * present and readable, and NONE of the detail that W10-05 crowded onto the face
 * (time / service / therapist name / confirmation tick) is on it. The therapist
 * colour dot is kept.
 */
async function expectNameOnlyFace(card: Locator, patientName: string) {
  await expect(card).toBeVisible({ timeout: 8_000 });
  // the patient full name is on the face (present, not clipped to a few chars).
  await expect(card.getByTestId("agenda-card-patient")).toContainText(patientName);
  // KEPT: the per-therapist colour dot.
  await expect(card.getByTestId("agenda-card-therapist-dot")).toHaveCount(1);
  // ABSENCE of every detail row on the face (all of it is in the hover popup).
  await expect(card.getByText(THERAPIST_NAME)).toHaveCount(0); // therapist name
  await expect(card.getByText(SERVICE.name)).toHaveCount(0); // service text
  await expect(card.getByText(BOOK_TIME)).toHaveCount(0); // time row
  await expect(card.getByText(/Confirmação/)).toHaveCount(0); // confirmation tick
}

test("W9-05: the card face is name-only (dot kept, therapist/service/time off it), and cancelling strikes it through and drops the tick", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // Book a 1h appointment (tall enough that a detail row WOULD have fit).
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

  // The card is the button carrying the patient name.
  const card = page.getByRole("button", { name: new RegExp(PATIENTS.maria.name) });

  // W11-00: the face is the patient NAME ONLY - dot kept, therapist/service/time off.
  await expectNameOnlyFace(card, PATIENTS.maria.name);

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

test("W11-00: three overlapping cards stay name-only and readable at 1/3 width in BOTH Dia and Semana", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const date = futureDate(RUN_DAY_BASE + 33); // dedicated day, no other spec books it
  const names = [PATIENTS.maria.name, PATIENTS.joao.name, PATIENTS.ana.name];

  // Book three appointments at the SAME 14:00 slot (same therapist) so the agenda
  // splits them into three overlapping columns at 1/3 width each. The 2nd + 3rd
  // overlap the 1st -> conflict; save anyway ("Guardar mesmo assim").
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

  // BOTH views at 1/3 width: each face is the patient name only, readable, no
  // time/service/therapist/tick text leaking back onto the crowded face.
  for (const view of ["day", "week"] as const) {
    await page.goto(`/agenda?view=${view}&date=${date}`);
    for (const name of names) {
      const card = page.getByRole("button", { name: new RegExp(name) });
      await expectNameOnlyFace(card, name);
    }
    // Proof screenshot of the 3-overlap at 1/3 width, per view (owner visual gate).
    await page.screenshot({ path: `test-results/w11-00-3-overlap-${view}.png` });
  }
});
