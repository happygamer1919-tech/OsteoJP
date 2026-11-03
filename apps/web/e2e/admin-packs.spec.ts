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
  // Tipos de Marcacao (2026-11-02): the new-type row under the table.
  const addForm = page.getByTestId("service-types-new-row");
  await addForm.locator('input[name="name"]').fill(name);
  await addForm.locator('input[name="durationMin"]').fill("30");
  // Wait for the actual ?mn=ok redirect to complete (a bare /admin/services wait
  // returns immediately and races the summary click against the redirect).
  await Promise.all([
    page.waitForURL(/mn=ok/),
    addForm.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);

  // Opens the per-location price editor (the sibling row below the service row)
  // on the freshly-loaded page and returns its Linda-a-Velha field. The type's
  // name is an input in its row, so the row is found by that input's value.
  const openPriceField = async () => {
    const svcRow = servicesTable
      .locator("tbody > tr")
      .filter({ has: page.locator(`input[name^="name__"][value="${name}"]`) })
      .first();
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
  // The "Novo PACK" inline form (Fisiozero layout, 2026-11-02).
  const addPack = page.locator('[data-testid="new-pack-form"]');
  await addPack.locator('input[name="name"]').fill(packName);
  // Base-service creation dropdown lists ACTIVE services only; the seeded
  // Osteopatia is active.
  await addPack.locator('select[name="baseServiceId"]').selectOption({ label: SERVICE.name });
  await addPack.locator('input[name="sessionCount"]').fill("10");
  await addPack.locator('input[name="price"]').fill("390.00");
  await Promise.all([
    page.waitForURL(/mp=ok/),
    addPack.getByRole("button", { name: "Inserir" }).click(),
  ]);

  // Renders in "LISTA DE PACKS" (10 sessões, price inline, no inactive badge).
  const rows = page.locator('[data-testid="pack-list-row"]');
  const packRow = rows.filter({ hasText: packName }).first();
  await expect(packRow).toBeVisible();
  await expect(packRow).toContainText("10 sessões");
  await expect(packRow.locator('input[name="price"]').first()).toHaveValue("390.00");
  await expect(packRow.getByText("Inativo", { exact: true })).toHaveCount(0);

  // A zero-instance pack is hard-deletable: the red cross is ENABLED.
  await expect(packRow.getByRole("button", { name: "Apagar Pack", exact: true })).toBeEnabled();

  // The inline price box saves the price alone.
  await packRow.locator('input[name="price"]').first().fill("395.00");
  await Promise.all([
    page.waitForURL(/mp=ok/),
    packRow.getByRole("button", { name: "Guardar preço", exact: true }).click(),
  ]);
  await expect(rows.filter({ hasText: packName }).first().locator('input[name="price"]').first()).toHaveValue(
    "395.00",
  );

  // Archive it (under "Gerir") → still present under "Inativos" (filter
  // INCLUDES inactive).
  const again = rows.filter({ hasText: packName }).first();
  await again.locator("summary").first().click();
  await Promise.all([
    page.waitForURL(/mp=ok/),
    again.getByRole("button", { name: "Arquivar" }).click(),
  ]);
  await page.getByRole("link", { name: "Inativos", exact: true }).click();
  await page.waitForURL(/pf=inactive/);
  const archivedRow = rows.filter({ hasText: packName }).first();
  await expect(archivedRow).toBeVisible();
  await expect(archivedRow.getByText("Inativo", { exact: true })).toBeVisible();

  // Under "Ativos" the archived pack is hidden.
  await page.getByRole("link", { name: "Ativos", exact: true }).click();
  await page.waitForURL(/pf=active/);
  await expect(rows.filter({ hasText: packName })).toHaveCount(0);
});

test("Pacotes: per-location price toggles the offered-here affordance (W12-20)", async ({
  page,
}) => {
  await page.goto("/admin/services");

  // Create a fresh pack to price, with the "Novo PACK" inline form.
  const packName = `E2E Pack Price ${Date.now()}`;
  const addPack = page.locator('[data-testid="new-pack-form"]');
  await addPack.locator('input[name="name"]').fill(packName);
  await addPack.locator('select[name="baseServiceId"]').selectOption({ label: SERVICE.name });
  await addPack.locator('input[name="sessionCount"]').fill("5");
  await addPack.locator('input[name="price"]').fill("325.00");
  await Promise.all([
    page.waitForURL(/mp=ok/),
    addPack.getByRole("button", { name: "Inserir" }).click(),
  ]);

  // Opens the per-location pack price editor, now under the row's "Gerir", and
  // returns its Linda-a-Velha field (mirror of the services editor).
  const openPriceField = async () => {
    const packRow = page.locator('[data-testid="pack-list-row"]').filter({ hasText: packName }).first();
    await expect(packRow).toBeVisible();
    await packRow.locator("summary").first().click();
    const priceRow = packRow;
    // exact: the row also carries the "preço base (há preços por local)" hint once
    // a per-location price exists, and a substring match would hit both.
    await priceRow.getByText("Preços por local", { exact: true }).click();
    const priceInput = priceRow.locator(`input[name="price__${LOCATION.id}"]`);
    await expect(priceInput).toBeVisible();
    const locField = priceRow.locator("label").filter({ hasText: LOCATION.name }).first();
    return { priceInput, locField, priceRow };
  };

  // No override row yet -> not offered here (the base price is a fallback amount,
  // never an "offered everywhere" signal).
  const before = await openPriceField();
  await expect(before.locField.getByText("Não oferecido aqui", { exact: true })).toBeVisible();

  await before.priceInput.fill("300.00");
  await Promise.all([
    page.waitForURL(/mp=ok/),
    before.priceRow.getByRole("button", { name: "Guardar preços" }).click(),
  ]);

  // Fresh reload -> deterministically-closed details; reopen and assert the active
  // override row now marks the pack as offered at that location.
  await page.goto("/admin/services");
  const after = await openPriceField();
  await expect(after.locField.getByText("Oferecido aqui", { exact: true })).toBeVisible();
  // The saved override (3.00 EUR less than base) round-trips into the input.
  await expect(after.priceInput).toHaveValue("300.00");
});
