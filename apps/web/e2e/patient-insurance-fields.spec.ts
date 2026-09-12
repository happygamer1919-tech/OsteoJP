/**
 * patient-insurance-fields.spec.ts — UX-02 and UX-03. THE VALUE FITS IN ITS BOX.
 *
 * ==========================================================================
 * THE REPORT, AND WHY IT IS MEASURED RATHER THAN EYEBALLED
 * ==========================================================================
 * The clinic: "Seguradora and Numero fields are too small for real values."
 *
 * IT WAS REPORTED TWICE, AND THE BINDING CONSTRAINT WAS DIFFERENT EACH TIME.
 *
 * UX-02 (2026-09-10): `HealthInsuranceFields` was a direct child of the form's
 * `grid grid-cols-2`, so the whole repeatable block lived in ONE of two columns
 * and each row split that half three ways. 94px per field. Fixed by spanning
 * both columns and replacing the wrapping flex with a grid.
 *
 * UX-03 (2026-09-12): the clinic reported it AGAIN, and the re-measurement said
 * why. The row had become 576px - which is the whole of `max-w-xl`, so the FORM
 * was now the ceiling. It measured 576px at 1280, 1440 AND 1728 viewport widths
 * while the page around it (`max-w-4xl px-6`) allowed 848. Fixed by taking the
 * form to `max-w-3xl` and flipping the column ratio, which had been giving the
 * wider box to the SHORTER value.
 *
 * SO THE ASSERTIONS ARE A WIDTH IN PIXELS AND AN OVERFLOW CHECK, never a class
 * name. A class assertion would pass the moment somebody wrote the right class
 * in the wrong container, which is exactly the shape of the first defect: every
 * class on these inputs was already "correct".
 */
import { test, expect } from "@playwright/test";

/**
 * MEASURED, on this fixture, at 1280 wide:
 *   UX-02 before -> Seguradora  94px, Numero  94px, row 280px
 *   UX-02 after  -> Seguradora 220px, Numero 264px, row 576px
 *   UX-03 after  -> Seguradora 369px, Numero 308px, row 768px
 * 260 is the floor: comfortably above UX-02's delivered width (so a revert to
 * it is caught) and comfortably below UX-03's, so font-metric variance between
 * machines cannot trip it.
 */
const MIN_FIELD_PX = 260;

/**
 * ==========================================================================
 * UX-03 - A WIDTH FLOOR IS A PROXY. THIS IS THE COMPLAINT ITSELF.
 * ==========================================================================
 * UX-02 shipped 220px and a 200px floor, and the clinic reported the same
 * defect two days later. The floor was green the whole time, because a floor
 * asks "is the box big" and the complaint is "does the value fit". Those come
 * apart exactly where it matters: 220px holds "Multicare Seguros de Saude" with
 * ZERO pixels of slack, so the box passed a 200px floor while the next real
 * insurer name along clipped.
 *
 * So the assertion below is `scrollWidth <= clientWidth` on a REAL value: the
 * browser's own statement that nothing is cut off. The floor stays as a
 * structural guard (it catches a return to half a form column even if somebody
 * shrinks the font), but the overflow check is the one that speaks for the
 * clinic.
 *
 * THE VALUES ARE THE LONGEST REAL ONES THIS CLINIC HOLDS, not stress strings.
 */
const LONGEST_REAL_INSURER = "Advancecare - Gestão de Serviços de Saúde";
const LONGEST_REAL_NUMBER = "MUL-2026-000123456789";

test("Patients: the insurance row gives both fields a usable width (UX-02, UX-03)", async ({
  page,
}) => {
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

  // ---- UX-03: THE LONGEST REAL VALUE IS NOT CUT OFF ----------------------
  // Typed into the boxes, then the browser is asked whether it had to scroll to
  // show it. `scrollWidth > clientWidth` IS the clipping the clinic reported,
  // and before UX-03 the insurer box overflowed by 104px on this exact string.
  await insurer.fill(LONGEST_REAL_INSURER);
  await number.fill(LONGEST_REAL_NUMBER);
  for (const [name, field, value] of [
    ["Seguradora", insurer, LONGEST_REAL_INSURER],
    ["Número", number, LONGEST_REAL_NUMBER],
  ] as const) {
    const overflow = await field.evaluate((n: HTMLInputElement) => n.scrollWidth - n.clientWidth);
    expect(
      overflow,
      `"${value}" is cut off in the ${name} box by ${overflow}px - the operator cannot read back ` +
        "what they typed, which is the report UX-02 and UX-03 both exist for",
    ).toBeLessThanOrEqual(0);
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
