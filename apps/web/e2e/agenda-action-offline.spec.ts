/**
 * agenda-action-offline.spec.ts - SKEW-01 S9. Runs as admin.
 *
 * With the network OFF, a server action on /agenda fails with the browser's
 * TypeError. Before SKEW-01 that rejection escaped from 27 of the 28 call sites
 * (an unhandled rejection, a spinner that never stopped, or the agenda error
 * boundary). This proves, in the browser, what lib/actions/run-action-core.test.ts
 * proves in node:
 *
 *   1. the failure is CAUGHT and shown: the "Sem ligação ao servidor" toast, with
 *      its "Tentar novamente" action, appears on /agenda;
 *   2. the toast is usable OVER THE OPEN DRAWER. The drawer is a modal <dialog>,
 *      which makes everything outside it inert; the toast region now lives inside
 *      the topmost modal (packages/ui Toast.tsx). Playwright's click refuses an
 *      element that does not receive pointer events, so pressing the button is
 *      the proof, and the press re-runs the read once the network is back;
 *   3. NOTHING ESCAPED: no unhandled rejection (recorded in the page from the
 *      first script, and kept in sessionStorage so a reload cannot erase it), no
 *      page error, and the agenda's error boundary never rendered.
 *
 * The trigger is the patient search in the NEW-appointment drawer (a READ: the
 * wrapper retries it once after ~800 ms, then shows the toast). Nothing is saved,
 * so this spec derives no RUN_DAY_BASE day and cannot collide with another
 * spec's diary (scripts/e2e-spec-days-do-not-collide).
 */
import { expect, test, type Page } from "@playwright/test";

import { futureDate } from "./fixtures";
import { openNewAppointment } from "./helpers";

const REJECTIONS_KEY = "__skew01_unhandled_rejections";

/** Records every unhandled rejection and page error, from the first script on. */
async function recordEscapes(page: Page) {
  await page.addInitScript((key) => {
    window.addEventListener("unhandledrejection", (event) => {
      const list = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[];
      list.push(String(event.reason));
      window.sessionStorage.setItem(key, JSON.stringify(list));
    });
  }, REJECTIONS_KEY);
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  return {
    pageErrors,
    rejections: () =>
      page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[], REJECTIONS_KEY),
  };
}

test("offline: a failed server action on /agenda shows the retry toast over the drawer, and nothing escapes", async ({
  page,
  context,
}) => {
  const escapes = await recordEscapes(page);
  const dialog = await openNewAppointment(page, futureDate(3));
  const patient = dialog.getByRole("combobox", { name: /Paciente/i });
  await patient.click();

  await context.setOffline(true);
  const failedActionPosts: string[] = [];
  page.on("requestfailed", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) failedActionPosts.push(req.url());
  });
  await patient.fill("Sem rede SKEW");

  const toast = page.getByRole("alert").filter({ hasText: "Sem ligação ao servidor" });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(toast).toHaveCount(1);
  // A READ is retried ONCE before the toast: the search went out exactly twice.
  // Exactly, not at least: a wrapper that retried twice would also pass ">= 2".
  expect(failedActionPosts.length, "the read was not retried exactly once before the toast").toBe(2);
  const retry = toast.getByRole("button", { name: "Tentar novamente" });
  await expect(retry).toBeVisible();

  // The drawer is still open and the error boundary never replaced the agenda.
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Não foi possível carregar o painel")).toHaveCount(0);

  // Back online, the toast's own button re-runs the search. The click itself
  // proves the toast is not inert behind the modal drawer.
  await context.setOffline(false);
  const rerun = page.waitForResponse(
    (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"],
    { timeout: 15_000 },
  );
  await retry.click();
  expect((await rerun).ok()).toBe(true);
  await expect(toast).toHaveCount(0);
  await expect(dialog).toBeVisible();

  expect(escapes.pageErrors, "an uncaught error reached the page").toEqual([]);
  expect(await escapes.rejections(), "an unhandled promise rejection escaped").toEqual([]);
});
