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
  // "Adicionar serviço" (not bare "Adicionar") — the Packs section (W8-01b)
  // adds an "Adicionar pacote" button on the same page.
  const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Adicionar serviço" }) });
  await addForm.locator('input[name="name"]').fill(name);
  await addForm.locator('input[name="durationMin"]').fill("30");
  await addForm.getByRole("button", { name: "Adicionar serviço" }).click();
  await page.waitForURL(/admin\/services/);

  const row = page.locator("tbody tr").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.locator("summary").first().click();
  const del = row.getByRole("button", { name: "Eliminar", exact: true });
  await expect(del).toBeEnabled();
  await del.click();
  await page.waitForURL(/admin\/services/);
  await expect(page.locator("tbody tr").filter({ hasText: name })).toHaveCount(0);

  // The seeded, REFERENCED service is archive-only: delete disabled + tooltip.
  const refRow = page.locator("tbody tr").filter({ hasText: SERVICE.name }).first();
  await refRow.locator("summary").first().click();
  const refDel = refRow.getByRole("button", { name: "Eliminar", exact: true });
  await expect(refDel).toBeDisabled();
  await expect(refRow.locator('[title*="Não é possível eliminar"]')).toBeVisible();
});
