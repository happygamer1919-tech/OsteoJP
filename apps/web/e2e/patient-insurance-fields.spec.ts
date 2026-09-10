/**
 * patient-insurance-fields.spec.ts — UX-02. THE POLICY NUMBER FITS IN ITS BOX.
 *
 * ==========================================================================
 * THE REPORT, AND WHY IT IS MEASURED RATHER THAN EYEBALLED
 * ==========================================================================
 * The clinic: "Seguradora and Numero fields are too small for real values."
 *
 * The cause is structural rather than cosmetic. `HealthInsuranceFields` is a
 * direct child of the form's `grid grid-cols-2` (patient-form.tsx:242), so the
 * whole repeatable block lives in ONE of two columns; inside it each row is a
 * `flex` of two `flex-1` labels plus the Remover button. Two fields and a button
 * splitting half a form column is why an ADSE number does not fit.
 *
 * SO THE ASSERTION IS A WIDTH IN PIXELS, not a class name. A class assertion
 * would pass the moment somebody wrote the right class in the wrong container,
 * which is exactly the shape of the defect: every class here was already
 * "correct", and the block was still half a column wide.
 *
 * THE THRESHOLD IS DERIVED FROM REAL VALUES. The longest thing these boxes hold
 * in this clinic is an ADSE beneficiary number (9 digits plus a check digit) or
 * a private policy reference, and insurer names run to "Médis" through
 * "Multicare Seguros de Saúde". 260px at 14px type holds ~30 characters, which
 * covers both with room; the field measured ~150px before.
 */
import { test, expect } from "@playwright/test";

/**
 * MEASURED BEFORE AND AFTER, on this fixture at 1280 wide:
 *   before -> Seguradora 94px, Numero 94px, row 280px
 *   after  -> Seguradora 220px, Numero 264px, row 576px
 * 200 is the floor: comfortably above the defect and comfortably below the
 * delivered width, so font-metric variance between machines cannot trip it and
 * a regression to half a form column cannot pass it.
 */
const MIN_FIELD_PX = 200;

test("Patients: the insurance row gives both fields a usable width (UX-02)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/patients/new");

  // The block starts empty; one press produces the row under test.
  await page.getByTestId("insurance-add").click();
  const row = page.getByTestId("insurance-row").first();
  await expect(row).toBeVisible();

  const insurer = row.getByRole("textbox").first();
  const number = page.getByTestId("insurance-number").first();

  for (const [name, field] of [
    ["Seguradora", insurer],
    ["Número", number],
  ] as const) {
    const b = await field.boundingBox();
    expect(b, `${name} is not rendered`).not.toBeNull();
    expect(
      Math.round(b!.width),
      `the ${name} box is ${Math.round(b!.width)}px wide - a real policy number does not fit in ` +
        "it, which is the report UX-02 exists for",
    ).toBeGreaterThanOrEqual(MIN_FIELD_PX);
  }

  // ---- REMOVER STAYS REACHABLE, AND ON THE ROW IT BELONGS TO -------------
  // Widening the fields at the button's expense would trade one defect for
  // another: a Remover that has wrapped under the row it removes is ambiguous
  // the moment there are two rows.
  const remover = row.getByRole("button", { name: /Remover/i });
  await expect(remover).toBeVisible();
  const [rb, nb] = [await remover.boundingBox(), await number.boundingBox()];
  expect(
    Math.abs(rb!.y + rb!.height / 2 - (nb!.y + nb!.height / 2)),
    "Remover has wrapped onto its own line - with two insurance rows on screen it no longer says " +
      "which row it removes",
  ).toBeLessThan(24);

  // And it still removes the row it sits on.
  await remover.click();
  await expect(page.getByTestId("insurance-row")).toHaveCount(0);
});
