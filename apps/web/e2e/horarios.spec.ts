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

    // SCHED-09: the seven-day editor is COLLAPSED by default now, so the
    // inspector has room and reception does not scroll past every colleague to
    // reach one. Open the first therapist's disclosure before reaching for its
    // Guardar - the button is real, it is simply not on screen until asked for.
    // Targeted as a SUMMARY, not by role: Playwright does not reliably map
    // <summary> to role=button across engines, and a role locator that finds
    // nothing spends the whole 120s budget before saying so.
    await page.locator("summary").filter({ hasText: "Editar horários" }).first().click();

    // The week editor's Guardar submits the reconcile through the schedule:manage
    // + own-location lib gates and redirects back to /horarios with a confirmation.
    const save = page.getByRole("button", { name: "Guardar" }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page).toHaveURL(/\/horarios/);
    await expect(page.getByText("Horário guardado.")).toBeVisible();
  });
});

/**
 * NAV-01 (Ivan, 2026-08-18). THE ADMIN ARM IS THE ONE THAT MOVED.
 *
 * The single /horarios nav entry carried `hideIfCapability: "settings:read"`, so
 * it was hidden from exactly the two roles holding every other capability -
 * owner and admin. The owner could not reach the COMPLEX scheduling page
 * (SCHED-03 search, SCHED-04 day-by-day, SCHED-05 the overwrite refusal) from
 * his own sidebar at all; Equipa's horários layer is the simple one and is
 * untouched.
 *
 * ADMIN RATHER THAN OWNER because the seeded storage states are admin,
 * therapist and reception - there is no owner fixture. Admin is the right proxy
 * anyway: it holds `settings:read`, so it was excluded by the same line for the
 * same reason, and it is the role whose sidebar actually changes here.
 *
 * ASSERTED FROM THE SIDEBAR, not by visiting the URL. /horarios was always
 * reachable by URL for anyone with `schedule:read` - what NAV-01 changed is
 * that these roles can FIND it. Navigating directly would pass before and after
 * and prove nothing, the same trap the RULING A test below names.
 */
test.describe("Horários — NAV-01 owner/admin sidebar entry", () => {
  test.use({ storageState: STORAGE.admin });

  test("NAV-01: an admin reaches Horários from the sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    const link = page.getByRole("link", { name: /hor[\u00e1a]rios/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/horarios/);
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
  test("RULING A: a therapist REACHES Horários from the sidebar", async ({ page }) => {
    // The nav entry is the whole of RULING A. Asserted from the sidebar rather
    // than by navigating to the URL, because the URL was already reachable
    // before the ruling - what changed is that a therapist can FIND it.
    await page.goto("/dashboard");
    const link = page.getByRole("link", { name: /hor[\u00e1a]rios/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/horarios/);
  });

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
    // SCHED-09: COUNT THE CARDS, NOT THE HEADINGS. `main h2` was a proxy for
    // "one schedule card" and the inspector's own heading is an h2 inside main,
    // so the proxy would now report a leak that does not exist - the same
    // false-positive shape this assertion's own history records. The card
    // marker asserts the property directly and survives future page furniture.
    const scheduleOwners = await page
      .locator('[data-testid="schedule-card"] h2')
      .allInnerTexts();
    expect(
      scheduleOwners,
      `a therapist must see exactly their own schedule card, found: ${scheduleOwners.join(", ")}`,
    ).toHaveLength(1);
  });
});
