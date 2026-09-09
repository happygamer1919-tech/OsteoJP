/**
 * inspector-therapist-selection.spec.ts — LE-inspector-and-editor-select-
 * different-therapists.
 *
 * ==========================================================================
 * THE REPORT, AND THE HALF OF IT THAT WAS REFUTED
 * ==========================================================================
 * The owner raised this on 2026-09-08 as the likely cause of that morning's
 * outage: the Inspetor and the Definir dia a dia modal were on Bernardo Calmeiro
 * while the bookings were being attempted for JP.
 *
 * ONE HALF OF THE PREMISE WAS REFUTED and it is worth being exact: the MODAL has
 * named its therapist since SCHED-04 - both range panels pass
 * `title={... + therapistName}` and Dialog renders that as the h3 it labels
 * itself by. A person who opens it is not unlabelled.
 *
 * THE OTHER HALF WAS REAL AND STRUCTURAL. /horarios renders ONE inspector for
 * the page, whose therapist came from `?t=` and DEFAULTED TO `therapists[0]` -
 * the first of the roster, not the card you scrolled to - while the editors are
 * one card per therapist. Nothing tied the two selections together.
 *
 * The owner's ruling: the two selections must be one, or each must state whose
 * week it is showing at the moment of the action. This is the browser proof of
 * both halves of that, which is what the render tests cannot reach: they can
 * assert the panel's markup, not that a link on a card two screens down actually
 * moves the panel at the top.
 *
 * Runs as RECEPTION, the role the surface is for (schedule:read; PL-09 Phase 5).
 * The seeded reception has no `staff_locations`, so the roster is the whole
 * tenant - several therapists, which is the condition the defect needs.
 */
import { test, expect } from "@playwright/test";
import { STORAGE, THERAPIST_NAME } from "./fixtures";

test.describe("Horários — the inspector and the cards are one selection", () => {
  test.use({ storageState: STORAGE.reception });

  test("arriving with no ?t=: the inspector shows nobody, and says so", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Inspetor de horários" })).toBeVisible({
      timeout: 15_000,
    });

    // PREMISE: more than one therapist on this roster. With exactly one the page
    // deliberately auto-selects (there is no second candidate to confuse), so a
    // single-card roster would make every assertion below vacuously true.
    const cards = page.getByTestId("schedule-card");
    await expect(
      cards,
      "this spec needs a roster with a choice in it; with one therapist the page " +
        "auto-selects on purpose and the defect cannot occur",
    ).not.toHaveCount(1);

    // THE DEFECT, DIRECTLY: no week is shown, and no therapist is named as the
    // subject of one. Before this card, the panel rendered the FIRST therapist
    // in the roster - a real week, about a real person, that nobody asked for.
    await expect(page.getByTestId("inspector-none-chosen")).toBeVisible();
    await expect(page.getByTestId("inspector-table")).toHaveCount(0);
    await expect(page.getByTestId("inspector-showing")).toHaveCount(0);

    // And the control admits it: the selected option is the placeholder, not the
    // first name in the list.
    await expect(page.getByTestId("inspector-therapist")).toHaveValue("");
  });

  test("pressing 'Ver no inspetor' on a card makes the two selections one", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Inspetor de horários" })).toBeVisible({
      timeout: 15_000,
    });

    // The card for a NAMED therapist, reached the way reception reaches it: by
    // finding the person, not by index. Its id is what the link must carry.
    const card = page.getByTestId("schedule-card").filter({
      has: page.getByRole("heading", { name: THERAPIST_NAME, exact: true }),
    });
    await expect(card).toHaveCount(1);
    const therapistId = await card.getAttribute("data-therapist-id");
    expect(therapistId, "the schedule card does not carry its therapist id").toBeTruthy();

    // Before: this card offers the link and carries no chip.
    await expect(page.getByTestId(`card-inspect-${therapistId}`)).toBeVisible();
    await expect(page.getByTestId(`card-in-inspector-${therapistId}`)).toHaveCount(0);

    await page.getByTestId(`card-inspect-${therapistId}`).click();

    // THE URL IS THE SELECTION. Asserted because it is what makes the view
    // linkable and what the server re-renders from - a client-only highlight
    // would look identical here and would be a second source of truth.
    await expect(page).toHaveURL(new RegExp(`t=${therapistId}`));

    // The panel now names this therapist, in prose, beside the rows.
    const showing = page.getByTestId("inspector-showing");
    await expect(showing).toBeVisible();
    await expect(showing).toContainText(THERAPIST_NAME);
    await expect(page.getByTestId("inspector-table")).toBeVisible();
    await expect(page.getByTestId("inspector-none-chosen")).toHaveCount(0);

    // And the two selections are visibly the same object: the card says it is
    // the one in the inspector, and stops offering to become it.
    await expect(page.getByTestId(`card-in-inspector-${therapistId}`)).toBeVisible();
    await expect(page.getByTestId(`card-inspect-${therapistId}`)).toHaveCount(0);

    // THE NEGATIVE ARM, and it is the one that matters: EVERY OTHER CARD still
    // offers the link and none of them claims the chip. Exactly one card can be
    // the selected one, or "which person is the inspector showing" has two
    // answers on screen at once - which is the defect with a new coat of paint.
    await expect(page.locator('[data-testid^="card-in-inspector-"]')).toHaveCount(1);
    const others = await page.locator('[data-testid^="card-inspect-"]').count();
    expect(others).toBeGreaterThan(0);
  });

  test("the inspector's own dropdown and the cards agree, in both directions", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { name: "Inspetor de horários" })).toBeVisible({
      timeout: 15_000,
    });

    // Driving the PANEL must move the CARD, not only the other way round. A fix
    // that only worked from the card would leave the original shape intact for
    // anybody who used the dropdown - which is how the panel is used today.
    await page.getByTestId("inspector-therapist").selectOption({ label: THERAPIST_NAME });
    await expect(page).toHaveURL(/t=/);

    const showing = page.getByTestId("inspector-showing");
    await expect(showing).toContainText(THERAPIST_NAME);

    const chipped = page.locator('[data-testid^="card-in-inspector-"]');
    await expect(chipped).toHaveCount(1);
    const card = page.getByTestId("schedule-card").filter({ has: chipped });
    await expect(card.getByRole("heading", { name: THERAPIST_NAME, exact: true })).toBeVisible();
  });
});
