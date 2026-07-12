/**
 * location-delete.spec.ts — Location hard-delete vs archive (W3-07). Runs as
 * admin. A location is deletable ONLY when no appointment references it; a
 * referenced one offers Archive only, with Delete disabled + a tooltip.
 *
 * Non-destructive to the shared seed: books at Linda-a-Velha to make it
 * referenced, and creates + deletes its OWN throwaway location.
 * (Archived-hidden-from-dropdown is covered by scheduling.spec.ts W2-02.)
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment, fillAppointment } from "./helpers";
import { PATIENTS, LOCATION, THERAPIST_NAME, futureDate, RUN_DAY_BASE } from "./fixtures";

const SAVE = "Guardar";

function rowByName(page: import("@playwright/test").Page, name: string) {
  return page
    .locator("tbody tr")
    .filter({ has: page.locator(`input[name="name"][value="${name}"]`) });
}

test("location delete is enabled only when unreferenced; archive-only otherwise (W3-07)", async ({
  page,
}) => {
  // Make Linda-a-Velha referenced by booking an appointment there.
  const date = futureDate(RUN_DAY_BASE + 19);
  const dialog = await openNewAppointment(page, date);
  await fillAppointment(dialog, {
    patient: PATIENTS.maria.name,
    therapist: THERAPIST_NAME,
    location: LOCATION.name,
    date,
    time: "15:00",
  });
  await dialog.getByRole("button", { name: SAVE }).click();
  await expect(dialog).toBeHidden({ timeout: 12_000 });

  // A successful booking triggers the app's OWN client navigation back to the
  // agenda. On Firefox/WebKit that in-flight navigation aborts an immediate
  // manual goto (Firefox: NS_BINDING_ABORTED; WebKit: "interrupted by another
  // navigation"). Retry once — the second goto cleanly supersedes the redirect,
  // mirroring the same race handled in helpers' openNewAppointment.
  try {
    await page.goto("/admin/locations");
  } catch (e) {
    if (/interrupted by another navigation|NS_BINDING_ABORTED/i.test(String(e))) {
      await page.goto("/admin/locations");
    } else {
      throw e;
    }
  }

  // Referenced location → Delete DISABLED + tooltip; Archive still offered.
  const refRow = rowByName(page, LOCATION.name);
  await expect(refRow.getByRole("button", { name: "Eliminar", exact: true })).toBeDisabled();
  await expect(refRow.locator("span[title]")).toHaveAttribute("title", /Não é possível eliminar/i);
  await expect(refRow.getByRole("button", { name: "Arquivar" })).toBeVisible();

  // A fresh, unreferenced location → Delete ENABLED → deletes cleanly.
  const name = "ZZ Del W3-07";
  const createForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar local" }) });
  await createForm.locator('input[name="name"]').fill(name);
  await createForm.getByRole("button", { name: "Adicionar local" }).click();
  await page.waitForURL(/admin\/locations/);

  const newRow = rowByName(page, name);
  const del = newRow.getByRole("button", { name: "Eliminar", exact: true });
  await expect(del).toBeEnabled();
  await del.click();
  await page.waitForURL(/admin\/locations/);
  await expect(rowByName(page, name)).toHaveCount(0);
});
