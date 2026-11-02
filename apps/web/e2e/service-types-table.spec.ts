/**
 * service-types-table.spec.ts - Admin > Serviços, the Tipos de Marcacao table
 * copied from Fisiozero (2026-11-02): one row per type with FollowUP, Preço,
 * IVA, Motivo IVA, the active switch, the colour, the SMS and AGENDA tags, one
 * "Guardar alterações" button for the whole table, the new-type row and the two
 * notes. Runs as admin (default storageState).
 *
 * NEEDS THE PENDING MIGRATION (NEXT-AFTER-0109_services_booking_type_fields):
 * on a database without the five columns the page itself cannot load.
 */
import { test, expect } from "@playwright/test";

test("Tipos de Marcação: a new type, every column edited, one save, read back after reload", async ({ page }) => {
  await page.goto("/admin/services");

  const table = page.getByTestId("service-types-table");
  for (const header of ["Tipo de Marcação", "FollowUP", "Preço", "IVA", "Motivo IVA"]) {
    await expect(table.locator("thead").getByText(header, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByText(
      "Nota 1: Os preços depois de alterados nesta tabela, não alteram os preços das marcações já efetuadas em Calendário.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Nota 2: Os preços só são contabilizados após a marcação de Pagamento do Utente."),
  ).toBeVisible();

  // The new-type row: Fisiozero's five fields plus OsteoJP's duration.
  const name = `E2E Tipo ${Date.now()}`;
  const newRow = page.getByTestId("service-types-new-row");
  await newRow.locator('input[name="name"]').fill(name);
  await newRow.locator('input[name="price"]').fill("75.00");
  await newRow.locator('select[name="vatReason"]').selectOption("M07");
  await newRow.locator('input[name="durationMin"]').fill("45");
  await Promise.all([
    page.waitForURL(/m=ok/),
    newRow.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);

  const row = table
    .locator("tbody > tr")
    .filter({ has: page.locator(`input[name^="name__"][value="${name}"]`) })
    .first();
  await expect(row).toBeVisible();
  // As inserted: IVA 0% (the new row's default, as in Fisiozero), Motivo M07,
  // FollowUP nenhum, SMS on (today's behaviour), AGENDA off (never silently
  // self-bookable), active.
  await expect(row.locator('select[name^="vat__"]')).toHaveValue("0");
  await expect(row.locator('select[name^="vatReason__"]')).toHaveValue("M07");
  await expect(row.locator('select[name^="followUp__"]')).toHaveValue("");
  await expect(row.getByRole("checkbox", { name: "SMS" })).toBeChecked();
  await expect(row.getByRole("checkbox", { name: "AGENDA" })).not.toBeChecked();
  await expect(row.getByRole("switch")).toBeChecked();
  await expect(row.locator("[title='Desactiva Tipo de Marcação']")).toBeVisible();

  // Edit every column of the row, then the ONE save button.
  await row.locator('select[name^="followUp__"]').selectOption({ label: "FollowUp 2 dias" });
  await row.locator('input[name^="price__"]').fill("70,50");
  await row.locator('select[name^="vat__"]').selectOption({ label: "23%" });
  await row.locator('select[name^="vatReason__"]').selectOption({ label: "-- Selecionar motivo --" });
  await row.locator('input[type="color"]').fill("#fee93d");
  await row.getByRole("checkbox", { name: "SMS" }).uncheck();
  await row.getByRole("checkbox", { name: "AGENDA" }).check();
  await row.locator('input[name^="duration__"]').fill("50");
  await Promise.all([
    page.waitForURL(/m=ok/),
    page.getByRole("button", { name: "Guardar alterações - Tipos de Marcação / Preços / IVA" }).click(),
  ]);

  await page.goto("/admin/services");
  const after = page
    .getByTestId("service-types-table")
    .locator("tbody > tr")
    .filter({ has: page.locator(`input[name^="name__"][value="${name}"]`) })
    .first();
  await expect(after.locator('select[name^="followUp__"]')).toHaveValue("2");
  await expect(after.locator('input[name^="price__"]')).toHaveValue("70.50");
  await expect(after.locator('select[name^="vat__"]')).toHaveValue("23");
  await expect(after.locator('select[name^="vatReason__"]')).toHaveValue("");
  await expect(after.locator('input[type="color"]')).toHaveValue("#fee93d");
  await expect(after.getByRole("checkbox", { name: "SMS" })).not.toBeChecked();
  await expect(after.getByRole("checkbox", { name: "AGENDA" })).toBeChecked();
  await expect(after.locator('input[name^="duration__"]')).toHaveValue("50");

  // The switch off, saved, reads off after a reload.
  await after.getByRole("switch").uncheck();
  await Promise.all([
    page.waitForURL(/m=ok/),
    page.getByRole("button", { name: "Guardar alterações - Tipos de Marcação / Preços / IVA" }).click(),
  ]);
  await page.goto("/admin/services");
  await expect(
    page
      .getByTestId("service-types-table")
      .locator("tbody > tr")
      .filter({ has: page.locator(`input[name^="name__"][value="${name}"]`) })
      .first()
      .getByRole("switch"),
  ).not.toBeChecked();
});

test("Tipos de Marcação: a value the table cannot hold saves nothing and says so", async ({ page }) => {
  await page.goto("/admin/services");
  const row = page.getByTestId("service-types-table").locator("tbody > tr").first();
  const priceInput = row.locator('input[name^="price__"]');
  const before = await priceInput.inputValue();
  await priceInput.fill("abc");
  await Promise.all([
    page.waitForURL(/m=err:invalid/),
    page.getByRole("button", { name: "Guardar alterações - Tipos de Marcação / Preços / IVA" }).click(),
  ]);
  await expect(page.getByText("Há um valor inválido na tabela. Nada foi guardado.", { exact: true })).toBeVisible();
  await page.goto("/admin/services");
  await expect(
    page.getByTestId("service-types-table").locator("tbody > tr").first().locator('input[name^="price__"]'),
  ).toHaveValue(before);
});
