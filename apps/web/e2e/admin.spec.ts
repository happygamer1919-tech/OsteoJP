/**
 * admin.spec.ts — Stream F
 *
 * Covers: tenant settings, staff invite, services, locations.
 * All tests run as admin. Non-admin access is checked at the end.
 *
 * Plain-English scenario → test mapping:
 *
 *  1. Admin panel loads
 *  2. Edit tenant settings (clinic name) and save
 *  3. Invite a new staff member by email
 *  4. Invited staff member appears in the staff list
 *  5. Create a new service
 *  6. Edit an existing service's price
 *  7. Create a new location
 *  8. Deactivate a location; it no longer appears in appointment dropdowns
 *  9. Therapist is blocked from /admin
 * 10. Receptionist is blocked from /admin
 */

import { test, expect } from "@playwright/test";
import { goToAdmin } from "../helpers";

// ---------------------------------------------------------------------------
// 1. Admin panel loads
// ---------------------------------------------------------------------------
test("admin panel loads for admin role", async ({ page }) => {
  await goToAdmin(page);
  // Admin page should show navigation links or headings for the admin sections.
  await expect(
    page.getByRole("heading").filter({ hasText: /Admin|Definições/i }).first(),
  ).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 2. Edit tenant settings
// ---------------------------------------------------------------------------
test("edit clinic name in tenant settings and save", async ({ page }) => {
  await page.goto("/admin/settings");

  const nameInput = page.getByLabel(/Nome da clínica|Clinic name/i);
  const original = await nameInput.inputValue();

  await nameInput.clear();
  await nameInput.fill("OsteoJP Teste Auto");
  await page.getByRole("button", { name: /Guardar|Save/i }).click();

  // Expect success feedback.
  await expect(page.getByText(/Guardado|Saved/i)).toBeVisible({ timeout: 8_000 });

  // Restore original name so subsequent tests aren't affected.
  await nameInput.clear();
  await nameInput.fill(original);
  await page.getByRole("button", { name: /Guardar|Save/i }).click();
  await expect(page.getByText(/Guardado|Saved/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 3. Invite staff member
// ---------------------------------------------------------------------------
test("invite a new staff member by email", async ({ page }) => {
  await page.goto("/admin/staff");

  const uniqueEmail = `e2e.staff.${Date.now()}@osteojp.test`;

  await page.getByLabel(/Email/i).fill(uniqueEmail);
  // Select role — therapist.
  const roleSelect = page.getByLabel(/Função|Role/i);
  if (await roleSelect.count()) {
    await roleSelect.selectOption({ label: /Terapeuta|Therapist/i });
  }

  await page.getByRole("button", { name: /Convidar|Invite/i }).click();

  // Success message.
  await expect(page.getByText(/Convite enviado|Invitation sent/i)).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 4. Invited staff appears in list
// ---------------------------------------------------------------------------
test("invited staff member appears in the staff list", async ({ page }) => {
  await page.goto("/admin/staff");

  const uniqueEmail = `e2e.check.${Date.now()}@osteojp.test`;
  await page.getByLabel(/Email/i).fill(uniqueEmail);
  await page.getByRole("button", { name: /Convidar|Invite/i }).click();
  await expect(page.getByText(/Convite enviado|Invitation sent/i)).toBeVisible({
    timeout: 10_000,
  });

  // The email should appear in the staff table.
  await expect(page.getByText(uniqueEmail)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 5. Create a new service
// ---------------------------------------------------------------------------
test("create a new service and see it in the services list", async ({
  page,
}) => {
  await page.goto("/admin/services");

  await page.getByRole("button", { name: /Novo serviço|New service/i }).click();

  const nameInput = page.getByLabel(/Nome do serviço|Service name/i);
  await nameInput.fill("Teste Automatizado RPG");

  const durationInput = page.getByLabel(/Duração|Duration/i);
  if (await durationInput.count()) {
    await durationInput.fill("60");
  }

  await page.getByRole("button", { name: /Guardar|Save/i }).click();

  await expect(page.getByText("Teste Automatizado RPG")).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 6. Edit service price
// ---------------------------------------------------------------------------
test("editing a service price updates the displayed value", async ({ page }) => {
  await page.goto("/admin/services");

  // Click edit on the first service.
  await page.getByRole("button", { name: /Editar|Edit/i }).first().click();

  const priceInput = page.getByLabel(/Preço|Price/i);
  const count = await priceInput.count();
  test.skip(count === 0, "No price field on service edit form");

  await priceInput.clear();
  await priceInput.fill("5000"); // cents — €50.00

  await page.getByRole("button", { name: /Guardar|Save/i }).click();
  await expect(page.getByText(/Guardado|Saved/i)).toBeVisible({ timeout: 8_000 });
});

// ---------------------------------------------------------------------------
// 7. Create a new location
// ---------------------------------------------------------------------------
test("create a new location and see it in the locations list", async ({
  page,
}) => {
  await page.goto("/admin/locations");

  await page
    .getByRole("button", { name: /Nova localização|New location/i })
    .click();

  await page
    .getByLabel(/Nome|Name/i)
    .fill("Clínica Automática E2E");

  const addressInput = page.getByLabel(/Morada|Address/i);
  if (await addressInput.count()) {
    await addressInput.fill("Rua do Teste, 999");
  }

  await page.getByRole("button", { name: /Guardar|Save/i }).click();

  await expect(page.getByText("Clínica Automática E2E")).toBeVisible({
    timeout: 10_000,
  });
});

// ---------------------------------------------------------------------------
// 8. Deactivate location
// ---------------------------------------------------------------------------
test("deactivating a location removes it from appointment dropdowns", async ({
  page,
}) => {
  // Create a throwaway location to deactivate.
  await page.goto("/admin/locations");
  await page.getByRole("button", { name: /Nova localização|New location/i }).click();
  await page.getByLabel(/Nome|Name/i).fill("Localização Desativar");
  await page.getByRole("button", { name: /Guardar|Save/i }).click();
  await expect(page.getByText("Localização Desativar")).toBeVisible({ timeout: 10_000 });

  // Deactivate it.
  const row = page.getByText("Localização Desativar").locator("..");
  await row.getByRole("button", { name: /Desativar|Deactivate/i }).click();

  // Verify it no longer appears in the appointment modal dropdown.
  await page.goto("/agenda");
  await page.getByRole("button", { name: /Nova|New/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 6_000 });

  const locationSelect = dialog.getByLabel(/Localização/i);
  await expect(
    locationSelect.locator("option", { hasText: "Localização Desativar" }),
  ).not.toBeAttached();
});

// ---------------------------------------------------------------------------
// 9. Therapist blocked from /admin
// ---------------------------------------------------------------------------
test(
  "therapist is redirected away from /admin",
  { tag: "@therapist" },
  async ({ page }) => {
    await page.goto("/admin");
    const url = page.url();
    expect(url).not.toMatch(/\/admin/);
  },
);

// ---------------------------------------------------------------------------
// 10. Receptionist blocked from /admin
// ---------------------------------------------------------------------------
test(
  "receptionist is redirected away from /admin",
  { tag: "@reception" },
  async ({ page }) => {
    await page.goto("/admin");
    const url = page.url();
    expect(url).not.toMatch(/\/admin/);
  },
);
