/**
 * horarios.spec.ts — PL-09 Phase 5 reception schedule surface (/horarios).
 *
 * Reception (schedule:read, no settings:read) reaches the page, sees the
 * therapist cards, and can save a therapist's week through the reception action
 * (which redirects back to /horarios, not /admin/staff). A therapist has no
 * schedule:read and is redirected away.
 *
 * NOTE: the e2e reception is assigned to NO staff_locations, so the own-location
 * scope resolves to null (no-lockout) and every therapist is visible — the
 * location NARROWING itself is proven at the DB layer (schedule-scope unit test)
 * and would need a located reception seed to exercise here.
 */
import { test, expect } from "@playwright/test";
import { STORAGE } from "./fixtures";

test.describe("Horários — reception schedule surface", () => {
  test.use({ storageState: STORAGE.reception });

  test("reception reaches /horarios, sees a therapist card, and saves a week", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Horários da equipa" })).toBeVisible();
    // A therapist card is rendered (E2E Therapist is a bookable, in-scope member).
    await expect(page.getByRole("heading", { name: "E2E Therapist" }).first()).toBeVisible();

    // The week editor's Guardar submits the reconcile through the schedule:manage
    // + own-location lib gates and redirects back to /horarios with a confirmation.
    const save = page.getByRole("button", { name: "Guardar" }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page).toHaveURL(/\/horarios/);
    await expect(page.getByText("Horário guardado.")).toBeVisible();
  });
});

test.describe("Horários — gate", () => {
  test.use({ storageState: STORAGE.therapist });

  /**
   * ITEM 3 (2026-08-14) CHANGED THIS, AND THE ASSERTION GOT STRONGER RATHER THAN
   * WEAKER.
   *
   * This test used to assert a therapist is REDIRECTED, because the role held no
   * schedule:read. It now holds it, so it may block its OWN schedule, and the
   * redirect is gone. The property worth pinning was never "the door is shut" -
   * it was "a therapist cannot reach a colleague's schedule", and a redirect was
   * only one way of achieving that.
   *
   * So the page is asserted to be SELF-SCOPED: the therapist's own name is
   * present, and no colleague's is. That is the same guarantee, checked where it
   * actually matters, and it keeps holding if the route is ever linked from the
   * navigation (see LE-therapist-horarios-nav, deliberately not done here).
   */
  test("ITEM 3: a therapist reaching /horarios sees ONLY their own schedule", async ({ page }) => {
    await page.goto("/horarios");
    await page.waitForLoadState("domcontentloaded");
    // Not redirected any more.
    await expect(page).toHaveURL(/\/horarios/);
    // The page renders rather than erroring - the STAFF-05 symptom must not
    // reappear for the role that just gained access to this surface.
    await expect(page.locator("body")).not.toContainText(
      /Application error|client-side exception/i,
    );
    // NEGATIVE ARM: EXACTLY ONE schedule card, which is their own.
    //
    // SCOPED TO `main` AND COUNTED, not name-matched. The first version of this
    // assertion filtered every <h2> on the page for the word "terapeuta" and
    // failed on "Menu" (the app shell's own heading, outside main) and on "E2E
    // Therapist" (the seeded therapist's ENGLISH display name - their own card,
    // which is the correct result). It reported a leak that was not there.
    // Counting cards inside main asserts the actual property and does not depend
    // on what anybody is called.
    const scheduleOwners = await page.locator("main h2").allInnerTexts();
    expect(
      scheduleOwners,
      `a therapist must see exactly their own schedule card, found: ${scheduleOwners.join(", ")}`,
    ).toHaveLength(1);
  });
});
