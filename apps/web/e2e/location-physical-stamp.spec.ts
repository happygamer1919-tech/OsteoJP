/**
 * location-physical-stamp.spec.ts - S-1012-A1 ruling 4 (2026-10-12). Runs as
 * admin. Administração > Locais marks a location with no carimbo image as one
 * that stamps the Declaração by hand, with the place its declaration prints.
 *
 * What this proves is the SCREEN: the control is on the row, the place is
 * suggested from the address, Guardar stores the mark and a reload shows it,
 * a mark with no place is refused, and a clinic that has a carimbo image is
 * not offered the choice. What a stored mark does to the document is proven
 * in lib/clinical/declaracao/physical-stamp.test.ts and, against Postgres, in
 * lib/admin/locations.physical-stamp.db.test.ts.
 *
 * Non-destructive to the shared seed: it creates and deletes its OWN location.
 */
import { test, expect } from "@playwright/test";
import { LOCATION } from "./fixtures";

const NAME = "ZZ MN-01 carimbo";
const ADDRESS = "Rua de Exemplo 4, 7050-356 Montemor-o-Novo";
const STAMP = "Carimbo físico na Declaração";
const PLACE = "Localidade na Declaração";

function rowByName(page: import("@playwright/test").Page, name: string) {
  return page
    .locator("tbody tr")
    .filter({ has: page.locator(`input[name="name"][value="${name}"]`) });
}

test("a location with no carimbo image can be marked physical stamp, with its place (S-1012-A1 ruling 4)", async ({
  page,
}) => {
  await page.goto("/admin/locations");

  // A leftover from an interrupted run would make the row ambiguous.
  while ((await rowByName(page, NAME).count()) > 0) {
    await rowByName(page, NAME).first().getByRole("button", { name: "Eliminar", exact: true }).click();
    await page.waitForURL(/admin\/locations\?m=/);
    await page.goto("/admin/locations");
  }

  const createForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar local" }) });
  await createForm.locator('input[name="name"]').fill(NAME);
  await createForm.locator('input[name="address"]').fill(ADDRESS);
  await createForm.getByRole("button", { name: "Adicionar local" }).click();
  await page.waitForURL(/admin\/locations\?m=ok/);

  // Not marked yet, and the place is SUGGESTED from what follows the postal code.
  let row = rowByName(page, NAME);
  await expect(row.getByLabel(STAMP)).not.toBeChecked();
  await expect(row.getByLabel(PLACE)).toHaveValue("Montemor-o-Novo");

  // A clinic with a carimbo image is not offered the choice.
  const clinic = rowByName(page, LOCATION.name);
  await expect(clinic).toHaveCount(1);
  await expect(clinic.getByLabel(STAMP)).toHaveCount(0);
  await expect(clinic.getByLabel(PLACE)).toHaveCount(0);

  // Ticked with NO place: refused, and nothing is stored.
  await row.getByLabel(STAMP).check();
  await row.getByLabel(PLACE).fill("");
  await row.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/locations\?m=err/);
  await expect(page.getByRole("status")).toHaveText("Não foi possível guardar o local.");
  await page.goto("/admin/locations");
  row = rowByName(page, NAME);
  await expect(row.getByLabel(STAMP)).not.toBeChecked();

  // Ticked with a place: saved, and a fresh load shows the stored mark.
  await row.getByLabel(STAMP).check();
  await row.getByLabel(PLACE).fill("Montemor");
  await row.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/locations\?m=ok/);
  await page.goto("/admin/locations");
  row = rowByName(page, NAME);
  await expect(row.getByLabel(STAMP)).toBeChecked();
  // The STORED place, not the suggestion from the address.
  await expect(row.getByLabel(PLACE)).toHaveValue("Montemor");

  // Unticked: cleared, and the field falls back to the suggestion.
  await row.getByLabel(STAMP).uncheck();
  await row.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/admin\/locations\?m=ok/);
  await page.goto("/admin/locations");
  row = rowByName(page, NAME);
  await expect(row.getByLabel(STAMP)).not.toBeChecked();
  await expect(row.getByLabel(PLACE)).toHaveValue("Montemor-o-Novo");

  // Remove the throwaway location.
  await row.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/locations\?m=ok/);
  await expect(rowByName(page, NAME)).toHaveCount(0);
});
