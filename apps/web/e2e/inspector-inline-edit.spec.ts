/**
 * inspector-inline-edit.spec.ts - SCHED-10.
 *
 * ==========================================================================
 * THE ROUND TRIP IS THE POINT, AND IT IS THE ONLY THING A UNIT TEST CANNOT DO.
 * ==========================================================================
 * `lib/scheduling/inspector-edit.test.ts` proves the PLAN: a one-day window, one
 * entry, and the weekly row carved to end the day before and resume the day
 * after. What it cannot prove is that the write reaches the database and that
 * the inspector - which renders from the agenda's own resolver, server-side -
 * gives the new day back. That needs the real editor, the real action and a
 * reload, which is this.
 *
 * IT USES ITS OWN THERAPIST. The inspector edit WRITES, and two location specs
 * assert the rest of the roster's availability set exactly; borrowing one of
 * theirs would fail a spec that never changed. Same reasoning as SCHED-12's
 * therapist, and the same lesson: a shared fixture two specs both write is a
 * race with a calendar in it.
 */
import { test, expect } from "@playwright/test";
import { LOCATION, THERAPIST_INSPECTOR } from "./fixtures";
import { fillTime } from "./helpers";

test("SCHED-10: editing a day in the inspector writes it, and the inspector reads it back", async ({
  page,
}) => {
  await page.goto("/horarios");
  await expect(page.getByRole("heading", { name: "Inspetor de horários" })).toBeVisible({
    timeout: 15_000,
  });

  // The inspector's own therapist filter, not a schedule card: this spec is
  // about the inspector.
  await page.getByTestId("inspector-therapist").selectOption({ label: THERAPIST_INSPECTOR });
  await expect(page).toHaveURL(/t=/);

  // The first day the period shows. The inspector renders a row per DAY, and a
  // day the therapist does not work is a row saying so - which is the day most
  // worth editing, and the state this therapist is seeded in.
  const firstRow = page.locator('[data-testid^="inspector-row-"]').first();
  await expect(firstRow).toBeVisible();
  const date = (await firstRow.getAttribute("data-testid"))!.replace("inspector-row-", "");
  expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // BEFORE: not working. Stated rather than assumed, so a failure below cannot
  // be read as "the edit did nothing" when the day was already filled.
  await expect(firstRow).toContainText("Não trabalha");

  await page.getByTestId(`inspector-edit-${date}`).click();
  const editor = page.getByTestId("inspector-editor");
  await expect(editor).toBeVisible();

  await editor.getByTestId("inspector-edit-location").selectOption({ label: LOCATION.name });
  await fillTime(editor.locator("label").filter({ hasText: "Início" }), "10:00");
  await fillTime(editor.locator("label").filter({ hasText: "Fim" }), "14:00");
  await editor.getByTestId("inspector-edit-save").click();

  // AFTER: the SAME row, re-rendered from the resolver rather than patched in
  // the browser. The label is the dated one, because a day-bounded row is what
  // the write produced.
  const savedRow = page.locator(`[data-testid="inspector-row-${date}"]`).first();
  await expect(savedRow).toContainText("10:00", { timeout: 15_000 });
  await expect(savedRow).toContainText("14:00");
  await expect(savedRow).toContainText(LOCATION.name);
  await expect(savedRow).toContainText("Dia definido");

  // A RELOAD, because router.refresh() could in principle serve a cached render.
  // This asks the database again through a fresh request.
  await page.reload();
  const reloaded = page.locator(`[data-testid="inspector-row-${date}"]`).first();
  await expect(reloaded).toContainText("10:00");
  await expect(reloaded).toContainText("14:00");

  // AND THE DAYS AROUND IT ARE UNTOUCHED, which is the invariant the card names:
  // a single-day edit must not blank the days it did not name.
  const rows = page.locator('[data-testid^="inspector-row-"]');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(rows.nth(1)).not.toContainText("10:00");

  // THE SECOND EDIT OF THE SAME DAY IS REFUSED AND NAMES THE DATE, because the
  // day now carries dated work somebody entered. Replacing it is the second,
  // explicit action - the same shape the alternadas and dia a dia panels use,
  // and the reason this path never silently rewrites a dated schedule.
  await page.getByTestId(`inspector-edit-${date}`).click();
  const editor2 = page.getByTestId("inspector-editor");
  await fillTime(editor2.locator("label").filter({ hasText: "Início" }), "11:00");
  await fillTime(editor2.locator("label").filter({ hasText: "Fim" }), "15:00");
  await editor2.getByTestId("inspector-edit-save").click();

  const collision = page.getByTestId("inspector-edit-collision");
  await expect(collision).toBeVisible({ timeout: 10_000 });
  await expect(collision).toContainText(date);
  // The row still reads the ORIGINAL hours: a refusal wrote nothing.
  await expect(page.locator(`[data-testid="inspector-row-${date}"]`).first()).toContainText("10:00");

  await page.getByTestId("inspector-edit-replace").click();
  const replaced = page.locator(`[data-testid="inspector-row-${date}"]`).first();
  await expect(replaced).toContainText("11:00", { timeout: 15_000 });
  await expect(replaced).toContainText("15:00");
});
