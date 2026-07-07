/**
 * agenda-header.spec.ts — Agenda toolbar, W4-17: the structured range chip
 * carries the live appointment count for the visible range, and it renders in
 * both Dia and Semana views and under a location filter. Runs as admin. The
 * count reuses the grid's exact visibility logic (viewDates + Lisbon day), so it
 * always matches what the grid shows. The W3-08 6-day/24h grid is untouched.
 */
import { test, expect } from "@playwright/test";
import { LOCATION, futureDate, RUN_DAY_BASE } from "./fixtures";

test("Agenda: range chip shows a live appointment count in Dia + Semana and under a filter (W4-17)", async ({
  page,
}) => {
  // Desktop viewport so the toolbar chip (sm+) renders.
  await page.setViewportSize({ width: 1440, height: 900 });
  const anchor = futureDate(RUN_DAY_BASE + 30);

  // Dia view: the chip is present and shows "<n> marcação/marcações".
  await page.goto(`/agenda?view=day&date=${anchor}`);
  const chip = page.getByTestId("agenda-range-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/\d+ marca[çc]/);

  // Semana view: the chip updates to the week range + week count.
  await page.goto(`/agenda?view=week&date=${anchor}`);
  await expect(page.getByTestId("agenda-range-chip")).toContainText(/\d+ marca[çc]/);

  // Under a location filter the chip still reports a count for the visible range.
  await page.goto(`/agenda?view=week&date=${anchor}&location=${LOCATION.id}`);
  await expect(page.getByTestId("agenda-range-chip")).toContainText(/\d+ marca[çc]/);

  // W3-08 untouched: the 6-day week still shows Saturday, never Sunday.
  await expect(page.getByText(/^sáb/i).first()).toBeVisible();
  await expect(page.getByText(/^dom/i)).toHaveCount(0);
});
