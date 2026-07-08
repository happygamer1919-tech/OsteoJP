/**
 * equipa-primary-service.spec.ts — Equipa tab: zero-mapping therapist gets a
 * primary service + a per-therapist Horários entry point (W4-01). Runs as admin.
 *
 * "E2E Terapeuta Sem Servicos" is seeded with NO therapist_services (the
 * Catarina-Vieira case): before W4-01 the row showed "Sem serviços" with no
 * control; now the dropdown lists all active services so a first primary can be
 * assigned, and Nova marcação then auto-fills it.
 */
import { test, expect } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import { futureDate, RUN_DAY_BASE, THERAPIST_ONE_LOCATION } from "./fixtures";

const THER = "E2E Terapeuta Sem Servicos";

test("Equipa: assign a primary to a zero-mapping therapist + Horários link + Nova marcação auto-fill (W4-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const row = page.locator("tbody tr").filter({ hasText: THER });
  const select = row.locator('select[name="serviceId"]');

  // The primary dropdown lists ALL active services (not "Sem serviços").
  await expect(select).toBeVisible();
  await expect(select.locator("option", { hasText: "Osteopatia" })).toHaveCount(1);

  // A per-therapist Horários entry point deep-links into the working-hours view.
  await expect(row.getByRole("link", { name: "Horários" })).toHaveAttribute(
    "href",
    /\/admin\/working-hours\?t=/,
  );

  // Assign a first/primary service → it persists.
  await select.selectOption({ label: "Osteopatia" });
  await row.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: THER })
      .locator('select[name="serviceId"] option:checked'),
  ).toHaveText("Osteopatia");

  // Nova marcação now auto-fills that primary when the therapist is chosen.
  const date = futureDate(RUN_DAY_BASE + 23);
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THER });
  await expect(dialog.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("Osteopatia");
});

test("Equipa: name/role search filters the staff table and clearing restores it (W5-02)", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // Baseline: the table lists several seeded members, including the reception
  // account, which the query below must exclude.
  await expect(page.locator("tbody tr").filter({ hasText: "E2E Reception" })).toHaveCount(1);

  // Type a name query → the table narrows to the matching therapist. Same
  // SearchBox as Pacientes (URL ?q= + server-side filter of the same read).
  const box = page.getByPlaceholder(/Pesquisar por nome ou função/i);
  await box.pressSequentially("Sem Servicos");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/admin\/staff\?q=/, { timeout: 8_000 });

  await expect(page.locator("tbody tr").filter({ hasText: THER })).toHaveCount(1);
  await expect(page.locator("tbody tr").filter({ hasText: "E2E Reception" })).toHaveCount(0);

  // Clearing the query restores the full table (reception is back).
  await box.fill("");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/admin\/staff$/, { timeout: 8_000 });
  await expect(page.locator("tbody tr").filter({ hasText: "E2E Reception" })).toHaveCount(1);
});

test("Equipa: the Gerir management panel opens as a centered modal, traps focus, deactivate/reactivate fire, Escape closes (W5-06)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const row = page.locator("tbody tr").filter({ hasText: THERAPIST_ONE_LOCATION });
  await expect(row).toHaveCount(1);

  const modal = page.getByRole("dialog", { name: /Gerir/i });

  // The row's Gerir trigger is a button (not a <summary>); clicking it opens a
  // centered modal <dialog> holding the same management controls.
  await row.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  // Native <dialog> modal: focus moves inside on open (focus trap / :modal).
  await expect(modal.locator(":focus")).toHaveCount(1);
  // Same controls as before, now inside the modal.
  await expect(modal.getByRole("button", { name: "Guardar" })).toBeVisible();
  await expect(modal.locator('select[name="role"]')).toBeVisible();

  // Deactivate fires its SAME server-action handler → badge flips to Inativo.
  await modal.getByRole("button", { name: "Desativar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(row.getByText("Inativo", { exact: true })).toBeVisible();

  // Reactivate through the modal restores the seeded state (Ativo again).
  await row.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Reativar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(row.getByText("Ativo", { exact: true })).toBeVisible();

  // Escape closes the modal (native <dialog> onCancel).
  await row.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("Equipa: password-gated therapist delete — wrong password refused, correct deletes an activity-free therapist (W4-01)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const row = () => page.locator("tbody tr").filter({ hasText: THER });
  await expect(row()).toHaveCount(1);
  // W5-06: the management actions (incl. the password-gated delete) live in a
  // per-row CENTERED modal — click the row's "Gerir" button to open it, then
  // interact with the controls inside the dialog. The gate itself is unchanged
  // (restyle only). The modal traps focus; Escape/overlay close it.
  const modal = () => page.getByRole("dialog", { name: /Gerir/i });
  const openManage = async () => {
    if (!(await modal().isVisible())) {
      await row().getByRole("button", { name: "Gerir", exact: true }).click();
      await expect(modal()).toBeVisible();
    }
  };

  // Wrong password → refused; the therapist is still there.
  await openManage();
  await modal().locator('input[name="password"]').fill("0000");
  await modal().getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText(/Palavra-passe incorreta/i)).toBeVisible();
  await expect(row()).toHaveCount(1);

  // Correct password (tenant default 1234) → the activity-free therapist is deleted.
  await openManage();
  await modal().locator('input[name="password"]').fill("1234");
  await modal().getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(row()).toHaveCount(0);
});
