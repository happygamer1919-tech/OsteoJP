/**
 * admin-packs.spec.ts — Serviços admin, W8-01b. Covers the two net-new surfaces:
 *   1. the offered-only-where-priced affordance on the per-location price editor
 *      (adding a price at a location flips "Não oferecido aqui" → "Oferecido aqui");
 *   2. pack-definition CRUD + the W6-01b filter split (filters INCLUDE inactive;
 *      the base-service creation dropdown shows ACTIVE services only) + the
 *      reference-guarded delete affordance (a zero-instance pack is deletable).
 * Runs as admin (default storageState).
 */
import { test, expect } from "@playwright/test";
import { SERVICE, LOCATION } from "./fixtures";

test("Serviços: per-location price toggles the offered-here affordance (W8-01b)", async ({
  page,
}) => {
  await page.goto("/admin/services");

  // Scope every lookup to the SERVICES table (the first table): an active service
  // name also appears as an <option> in every pack row's base-service dropdown,
  // so an unscoped name filter would also match pack-table rows.
  const servicesTable = page.locator("table").first();
  const name = `E2E Pack Svc ${Date.now()}`;
  const addForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar serviço" }) });
  await addForm.locator('input[name="name"]').fill(name);
  await addForm.locator('input[name="durationMin"]').fill("30");
  // Wait for the actual ?m=ok redirect to complete (a bare /admin/services wait
  // returns immediately and races the summary click against the redirect).
  await Promise.all([
    page.waitForURL(/m=ok/),
    addForm.getByRole("button", { name: "Adicionar serviço" }).click(),
  ]);

  // Opens the per-location price editor (the sibling row below the service row)
  // on the freshly-loaded page and returns its Linda-a-Velha field.
  const openPriceField = async () => {
    const svcRow = servicesTable.locator("tbody > tr").filter({ hasText: name }).first();
    await expect(svcRow).toBeVisible();
    const priceRow = svcRow.locator("xpath=following-sibling::tr[1]");
    await priceRow.getByText("Preços por local").click();
    const priceInput = priceRow.locator(`input[name="price__${LOCATION.id}"]`);
    await expect(priceInput).toBeVisible();
    const locField = priceRow.locator("label").filter({ hasText: LOCATION.name }).first();
    return { priceInput, locField, priceRow };
  };

  // No price row yet → not offered here.
  const before = await openPriceField();
  await expect(before.locField.getByText("Não oferecido aqui", { exact: true })).toBeVisible();

  await before.priceInput.fill("25.00");
  await Promise.all([
    page.waitForURL(/m=ok/),
    before.priceRow.getByRole("button", { name: "Guardar preços" }).click(),
  ]);

  // Fresh reload → deterministically-closed details; reopen and assert the
  // active price row now marks the service as offered at that location.
  await page.goto("/admin/services");
  const after = await openPriceField();
  await expect(after.locField.getByText("Oferecido aqui", { exact: true })).toBeVisible();
});

test("Serviços: pack CRUD + filter split (W8-01b)", async ({ page }) => {
  await page.goto("/admin/services");

  const packName = `E2E Pacote ${Date.now()}`;
  const addPack = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Adicionar pacote" }) });
  await addPack.locator('input[name="name"]').fill(packName);
  // Base-service creation dropdown lists ACTIVE services only; the seeded
  // Osteopatia is active.
  await addPack.locator('select[name="baseServiceId"]').selectOption({ label: SERVICE.name });
  await addPack.locator('input[name="sessionCount"]').fill("10");
  await addPack.locator('input[name="price"]').fill("390.00");
  await Promise.all([
    page.waitForURL(/mp=ok/),
    addPack.getByRole("button", { name: "Adicionar pacote" }).click(),
  ]);

  // Renders in the packs table (active, 10 sessions).
  const packRow = page.locator("tbody tr").filter({ hasText: packName }).first();
  await expect(packRow).toBeVisible();
  await expect(packRow).toContainText("10");
  await expect(packRow.getByText("Ativo", { exact: true })).toBeVisible();

  // A zero-instance pack is hard-deletable: the delete control is ENABLED.
  await packRow.locator("summary").first().click();
  await expect(packRow.getByRole("button", { name: "Eliminar", exact: true })).toBeEnabled();

  // Archive it → still present under "Inativos" (filter INCLUDES inactive).
  await Promise.all([
    page.waitForURL(/mp=ok/),
    packRow.getByRole("button", { name: "Arquivar" }).click(),
  ]);
  await page.getByRole("link", { name: "Inativos", exact: true }).click();
  await page.waitForURL(/pf=inactive/);
  const archivedRow = page.locator("tbody tr").filter({ hasText: packName }).first();
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow.getByText("Inativo", { exact: true })).toBeVisible();

  // Under "Ativos" the archived pack is hidden.
  await page.getByRole("link", { name: "Ativos", exact: true }).click();
  await page.waitForURL(/pf=active/);
  await expect(page.locator("tbody tr").filter({ hasText: packName })).toHaveCount(0);
});
