/**
 * services-delete.spec.ts — Serviços admin, W4-15: reference-guarded per-service
 * delete (NO password) + restyle. Runs as admin (default storageState). A
 * zero-reference service hard-deletes; a referenced service (the seeded
 * Osteopatia, mapped to the therapist + carrying appointments) is archive-only:
 * the delete control is disabled with a tooltip.
 */
import { test, expect } from "@playwright/test";
import { SERVICE } from "./fixtures";

test("Serviços: zero-reference service deletes; referenced service is archive-only (W4-15)", async ({
  page,
}) => {
  await page.goto("/admin/services");

  // Create a throwaway ZERO-reference service (no appointments / mappings / prices).
  const name = `E2E Servico Temp ${Date.now()}`;
  // Tipos de Marcacao (2026-11-02): a new type is added from the row under the
  // table ("Inserir Novo Tipo de Marcação"), and each type's name is an INPUT in
  // its row, so a row is found by that input's value, not by its text.
  const addForm = page.getByTestId("service-types-new-row");
  await addForm.locator('input[name="name"]').fill(name);
  await addForm.locator('input[name="durationMin"]').fill("30");
  await Promise.all([
    page.waitForURL(/m=ok/),
    addForm.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);

  const typeRow = (n: string) =>
    page.locator("tbody tr").filter({ has: page.locator(`input[name^="name__"][value="${n}"]`) });
  const row = typeRow(name).first();
  await expect(row).toBeVisible();
  await row.locator("summary").first().click();
  const del = row.getByRole("button", { name: "Eliminar", exact: true });
  await expect(del).toBeEnabled();
  await del.click();
  await page.waitForURL(/admin\/services/);
  await expect(typeRow(name)).toHaveCount(0);

  // The seeded, REFERENCED service is archive-only: delete disabled + tooltip.
  const refRow = typeRow(SERVICE.name).first();
  await refRow.locator("summary").first().click();
  const refDel = refRow.getByRole("button", { name: "Eliminar", exact: true });
  await expect(refDel).toBeDisabled();
  await expect(refRow.locator('[title*="Não é possível eliminar"]')).toBeVisible();
});
