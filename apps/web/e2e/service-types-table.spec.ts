/**
 * service-types-table.spec.ts - Admin > Serviços, the Tipos de Marcacao table
 * copied from Fisiozero (2026-11-02): one row per type with Preço, IVA, Motivo
 * IVA, the active switch beside its Estado badge, the colour with its "Sem
 * cor" box, the SMS and AGENDA tags, one "Guardar alterações" button for the
 * whole table, and the new-type row. Strategy's answers of 2026-11-04: no
 * FollowUP (Q9), IVA 0% needs a Motivo (Q5), OsteoJP's own two notes in place
 * of Fisiozero's (Q8). Runs as admin (default storageState).
 *
 * NEEDS THE PENDING MIGRATION (NEXT-AFTER-0109_services_booking_type_fields):
 * on a database without the five columns the page itself cannot load.
 */
import { test, expect, type Page } from "@playwright/test";

const SAVE = "Guardar alterações - Tipos de Marcação / Preços / IVA";

const typeRow = (page: Page, name: string) =>
  page
    .getByTestId("service-types-table")
    .locator("tbody > tr")
    .filter({ has: page.locator(`input[name^="name__"][value="${name}"]`) })
    .first();

test("Tipos de Marcação: a new type, every column edited, one save, read back after reload", async ({ page }) => {
  await page.goto("/admin/services");

  const table = page.getByTestId("service-types-table");
  for (const header of ["Tipo de Marcação", "Preço", "IVA", "Motivo IVA"]) {
    await expect(table.locator("thead").getByText(header, { exact: true })).toBeVisible();
  }
  // Q9: FollowUP is not on the screen.
  await expect(table.locator("thead").getByText("FollowUP", { exact: true })).toHaveCount(0);
  await expect(page.locator('select[name^="followUp"]')).toHaveCount(0);
  // Q8: OsteoJP's own notes, not Fisiozero's.
  await expect(
    page.getByText("Nota 1: As marcações não guardam preço: o valor cobrado é o que consta da fatura emitida.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Nota 2: As estatísticas contam apenas as faturas emitidas, não as marcações.", { exact: true }),
  ).toBeVisible();

  // The new-type row: name, price, IVA (unset until chosen), Motivo, and
  // OsteoJP's duration, which is not prefilled.
  const name = `E2E Tipo ${Date.now()}`;
  const newRow = page.getByTestId("service-types-new-row");
  await expect(newRow.locator('input[name="durationMin"]')).toHaveValue("");
  await expect(newRow.locator('select[name="vat"]')).toHaveValue("");
  await newRow.locator('input[name="name"]').fill(name);
  await newRow.locator('input[name="price"]').fill("75.00");
  await newRow.locator('select[name="vat"]').selectOption("0");
  await newRow.locator('select[name="vatReason"]').selectOption("M07");
  await newRow.locator('input[name="durationMin"]').fill("45");
  await Promise.all([
    page.waitForURL(/mn=ok/),
    newRow.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);
  await expect(page.getByText("Novo Tipo de Marcação inserido.", { exact: true })).toBeVisible();

  const row = typeRow(page, name);
  await expect(row).toBeVisible();
  // As inserted: IVA 0%, Motivo M07, SMS on (today's behaviour), AGENDA off
  // (never silently self-bookable), active, no colour.
  await expect(row.locator('select[name^="vat__"]')).toHaveValue("0");
  await expect(row.locator('select[name^="vatReason__"]')).toHaveValue("M07");
  await expect(row.getByRole("checkbox", { name: `SMS (${name})` })).toBeChecked();
  await expect(row.getByRole("checkbox", { name: `AGENDA (${name})` })).not.toBeChecked();
  await expect(row.getByRole("checkbox", { name: `Sem cor (${name})` })).toBeChecked();
  const activeSwitch = row.getByRole("switch", { name: `Tipo de Marcação ativo (${name})` });
  await expect(activeSwitch).toBeChecked();
  await expect(activeSwitch).toHaveAccessibleDescription("Desactiva Tipo de Marcação");
  await expect(row.getByText("Ativo", { exact: true })).toBeVisible();

  // Edit every column of the row, then the ONE save button. Picking a colour
  // unticks "Sem cor".
  await row.locator('input[name^="price__"]').fill("70,50");
  await row.locator('select[name^="vat__"]').selectOption({ label: "23%" });
  await row.locator('select[name^="vatReason__"]').selectOption({ label: "-- Selecionar motivo --" });
  await row.locator('input[type="color"]').fill("#fee93d");
  await expect(row.getByRole("checkbox", { name: `Sem cor (${name})` })).not.toBeChecked();
  await row.getByRole("checkbox", { name: `SMS (${name})` }).uncheck();
  await row.getByRole("checkbox", { name: `AGENDA (${name})` }).check();
  await row.locator('input[name^="duration__"]').fill("50");
  await Promise.all([page.waitForURL(/mt=ok/), page.getByRole("button", { name: SAVE }).click()]);
  await expect(page.getByText("Tipos de Marcação guardados.", { exact: true })).toBeVisible();

  await page.goto("/admin/services");
  const after = typeRow(page, name);
  await expect(after.locator('input[name^="price__"]')).toHaveValue("70.50");
  await expect(after.locator('select[name^="vat__"]')).toHaveValue("23");
  await expect(after.locator('select[name^="vatReason__"]')).toHaveValue("");
  await expect(after.locator('input[type="color"]')).toHaveValue("#fee93d");
  await expect(after.getByRole("checkbox", { name: `Sem cor (${name})` })).not.toBeChecked();
  await expect(after.getByRole("checkbox", { name: `SMS (${name})` })).not.toBeChecked();
  await expect(after.getByRole("checkbox", { name: `AGENDA (${name})` })).toBeChecked();
  await expect(after.locator('input[name^="duration__"]')).toHaveValue("50");

  // "Sem cor" clears the colour; the switch off reads off (and Inativo) after a reload.
  await after.getByRole("checkbox", { name: `Sem cor (${name})` }).check();
  await after.getByRole("switch").uncheck();
  await Promise.all([page.waitForURL(/mt=ok/), page.getByRole("button", { name: SAVE }).click()]);
  await page.goto("/admin/services");
  const last = typeRow(page, name);
  await expect(last.getByRole("switch")).not.toBeChecked();
  await expect(last.getByText("Inativo", { exact: true })).toBeVisible();
  await expect(last.getByRole("checkbox", { name: `Sem cor (${name})` })).toBeChecked();
});

test("Tipos de Marcação: a value the table cannot hold saves nothing and says so", async ({ page }) => {
  await page.goto("/admin/services");
  const row = page.getByTestId("service-types-table").locator("tbody > tr").first();
  const priceInput = row.locator('input[name^="price__"]');
  const before = await priceInput.inputValue();
  await priceInput.fill("abc");
  await Promise.all([page.waitForURL(/mt=err:invalid/), page.getByRole("button", { name: SAVE }).click()]);
  await expect(page.getByText("Há um valor inválido na tabela. Nada foi guardado.", { exact: true })).toBeVisible();
  await page.goto("/admin/services");
  await expect(
    page.getByTestId("service-types-table").locator("tbody > tr").first().locator('input[name^="price__"]'),
  ).toHaveValue(before);
});

test("Tipos de Marcação: IVA 0% with no Motivo saves nothing and says so (Q5)", async ({ page }) => {
  await page.goto("/admin/services");
  const name = `E2E Tipo iva ${Date.now()}`;
  const newRow = page.getByTestId("service-types-new-row");
  await newRow.locator('input[name="name"]').fill(name);
  await newRow.locator('select[name="vat"]').selectOption("0");
  await newRow.locator('input[name="durationMin"]').fill("30");
  await Promise.all([
    page.waitForURL(/mn=err:vat_reason/),
    newRow.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);
  await expect(
    page.getByText("O novo Tipo de Marcação tem IVA 0% e precisa de um Motivo IVA. Nada foi inserido.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(`input[name^="name__"][value="${name}"]`)).toHaveCount(0);

  // The same in the table: a row set to 0% with its Motivo cleared.
  await newRow.locator('input[name="name"]').fill(name);
  await newRow.locator('input[name="durationMin"]').fill("30");
  await Promise.all([
    page.waitForURL(/mn=ok/),
    newRow.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);
  const row = typeRow(page, name);
  await row.locator('select[name^="vat__"]').selectOption("0");
  await row.locator('select[name^="vatReason__"]').selectOption("");
  await Promise.all([page.waitForURL(/mt=err:vat_reason/), page.getByRole("button", { name: SAVE }).click()]);
  await expect(
    page.getByText("Com IVA 0% é obrigatório escolher o Motivo IVA. Nada foi guardado.", { exact: true }),
  ).toBeVisible();
  await page.goto("/admin/services");
  await expect(typeRow(page, name).locator('select[name^="vat__"]')).toHaveValue("");
});

test("Tipos de Marcação: a page drawn before somebody else's save is refused and does not revert it", async ({
  page,
  context,
}) => {
  // Two admin tabs on the same table.
  const first = page;
  const second = await context.newPage();
  await first.goto("/admin/services");
  const name = `E2E Tipo stale ${Date.now()}`;
  const newRow = first.getByTestId("service-types-new-row");
  await newRow.locator('input[name="name"]').fill(name);
  await newRow.locator('input[name="price"]').fill("40.00");
  await newRow.locator('input[name="durationMin"]').fill("30");
  await Promise.all([
    first.waitForURL(/mn=ok/),
    newRow.getByRole("button", { name: "Inserir Novo Tipo de Marcação" }).click(),
  ]);
  await second.goto("/admin/services");

  // The second tab saves a new price first.
  await typeRow(second, name).locator('input[name^="price__"]').fill("45.00");
  await Promise.all([second.waitForURL(/mt=ok/), second.getByRole("button", { name: SAVE }).click()]);

  // The first tab still shows 40.00; it changes something else and saves.
  await typeRow(first, name).getByRole("checkbox", { name: `SMS (${name})` }).uncheck();
  await Promise.all([first.waitForURL(/mt=err:stale/), first.getByRole("button", { name: SAVE }).click()]);
  await expect(first.getByText(/A tabela mudou desde que a página foi aberta/)).toBeVisible();

  await first.goto("/admin/services");
  await expect(typeRow(first, name).locator('input[name^="price__"]')).toHaveValue("45.00");
  await expect(typeRow(first, name).getByRole("checkbox", { name: `SMS (${name})` })).toBeChecked();
  await second.close();
});
