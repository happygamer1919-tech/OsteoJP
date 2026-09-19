/**
 * isolation-therapist.spec.ts — W10-04 per-person isolation (SPEC-isolation.md,
 * owner-approved matrix 2026-07-21). MANDATORY negative-isolation coverage.
 *
 * Proves the therapist role is scoped to their own patients + own calendar, and
 * that owner/admin keep cross-visibility (positive control). All on local
 * synthetic data (cloud is real-data-only after W10-02).
 *
 * Seed ground truth (seed-e2e.mjs):
 *  - Maria/João/Ana are created_by the E2E therapist  -> therapist SEES them.
 *  - PATIENT_OTHER_THERAPIST (a304) is created_by therapist2, no appointment with
 *    the E2E therapist -> therapist must NOT see it; admin MUST.
 */
import { test, expect } from "@playwright/test";
import { goToPatients, searchPatients } from "./helpers";
import { PATIENTS, PATIENT_OTHER_THERAPIST, STORAGE } from "./fixtures";

test.describe("therapist isolation — own patients only (negative)", () => {
  test.use({ storageState: STORAGE.therapist });

  test("therapist SEES their own patient (created_by them)", async ({ page }) => {
    await goToPatients(page);
    await expect(
      page.getByRole("link", { name: new RegExp(PATIENTS.maria.name) }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("therapist does NOT see another therapist's patient in the list", async ({ page }) => {
    await goToPatients(page);
    await expect(page.getByRole("heading", { name: "Pacientes" })).toBeVisible();
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
  });

  test("therapist search cannot surface another therapist's patient", async ({ page }) => {
    await searchPatients(page, PATIENT_OTHER_THERAPIST.name);
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
    await expect(page.getByText("Sem resultados para esta pesquisa")).toBeVisible();
  });

  test("therapist cannot open another therapist's patient by direct URL (not found)", async ({
    page,
  }) => {
    const resp = await page.goto(`/patients/${PATIENT_OTHER_THERAPIST.id}`);
    expect(resp?.status()).toBe(404);
    await expect(page.getByText(PATIENT_OTHER_THERAPIST.name)).toHaveCount(0);
  });

  /**
   * THE SAME ROUTE, THE SAME SESSION, A PATIENT THIS THERAPIST DOES OWN.
   *
   * The 404 above is evidence of a boundary only while `/patients/<id>` is known
   * to work for this actor. A dynamic route that failed to build, a dev server
   * that had not compiled it, or a session that had quietly lost its tenant
   * would all 404 here too — and the test above would pass on every one of them,
   * most comfortably when the app is at its most broken.
   *
   * Holding the ACTOR fixed and varying only the id is what separates "you may
   * not open THAT patient" from "you may not open any patient".
   */
  test("therapist DOES open their own patient by direct URL (200) — the route works for them", async ({
    page,
  }) => {
    const resp = await page.goto(`/patients/${PATIENTS.maria.id}`);
    expect(resp?.status()).toBe(200);
    // By name, off the profile's own <h1>: a 200 that rendered an error shell
    // would otherwise count as the control passing.
    await expect(page.getByRole("heading", { name: PATIENTS.maria.name })).toBeVisible({
      timeout: 8_000,
    });
  });

  test("therapist sees NEITHER the therapist selector NOR the location selector on the agenda", async ({
    page,
  }) => {
    await page.goto("/agenda?view=day");
    await expect(page).toHaveURL(/\/agenda/);
    // Both switchers are gated for the therapist role (W10-04): the therapist
    // selector was already gated (lockTherapist), the location selector is the
    // new gate. Neither combobox renders.
    await expect(page.getByRole("combobox", { name: "Terapeutas" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Localização" })).toHaveCount(0);
  });
});

test.describe("admin cross-visibility — positive control", () => {
  test.use({ storageState: STORAGE.admin });

  test("admin DOES see the other-therapist patient (tenant-wide)", async ({ page }) => {
    await searchPatients(page, PATIENT_OTHER_THERAPIST.name);
    await expect(
      page.getByRole("link", { name: new RegExp(PATIENT_OTHER_THERAPIST.name) }),
    ).toBeVisible({ timeout: 8_000 });
  });

  /**
   * THE COUNTERWEIGHT TO THE DIRECT-URL ARM ABOVE, AND IT IS NOT OPTIONAL.
   *
   * "a therapist cannot open another therapist's patient by direct URL" asserts
   * a 404 on `/patients/<id>`. A 404 is also what that URL returns when the
   * route is broken, unbuilt, or 404s for every person in the clinic — so on its
   * own that test passes most enthusiastically when the app is at its most
   * broken. It is the scoped query it means to be watching, and a universal
   * failure satisfies it perfectly.
   *
   * This runs the SAME URL as an actor who IS entitled to it and requires 200
   * plus the patient's name on the page. The therapist arm now only stays green
   * while the page works for somebody, which is what makes its 404 evidence of a
   * boundary rather than evidence of a wreck.
   *
   * recuperacao.spec.ts states the same rule one file over ("A page that showed
   * a therapist NOTHING would satisfy 'does not see another therapist's patient'
   * perfectly"), where it is enforced by name rather than by count.
   */
  test("admin opens that SAME url and gets the patient — the 404 above is a boundary, not a broken page", async ({
    page,
  }) => {
    const resp = await page.goto(`/patients/${PATIENT_OTHER_THERAPIST.id}`);
    expect(resp?.status()).toBe(200);
    // BY NAME, from the profile's own <h1>: a 200 that rendered an error shell
    // or an empty profile would otherwise count as the control passing.
    await expect(
      page.getByRole("heading", { name: PATIENT_OTHER_THERAPIST.name }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("admin keeps BOTH agenda selectors (therapist + location)", async ({ page }) => {
    await page.goto("/agenda?view=day");
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByRole("combobox", { name: "Terapeutas" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Localização" })).toBeVisible();
  });
});
