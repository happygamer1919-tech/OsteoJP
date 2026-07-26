/**
 * equipa-primary-service.spec.ts — Equipa tab (W12-40 consolidated cards + Gerir
 * modal). A zero-mapping therapist gets a primary service, and everything about a
 * member (contact, role, service, working hours) is managed from ONE Gerir modal.
 * Runs as admin.
 *
 * "E2E Terapeuta Sem Servicos" is seeded with NO therapist_services (the
 * Catarina-Vieira case): the Serviço principal section lists all active services
 * so a first primary can be assigned, and Nova marcação then auto-fills it.
 */
import { test, expect, type Page } from "@playwright/test";
import { openNewAppointment } from "./helpers";
import { futureDate, RUN_DAY_BASE, THERAPIST_ONE_LOCATION } from "./fixtures";

const THER = "E2E Terapeuta Sem Servicos";

/** The member card for `name`. */
function card(page: Page, name: string) {
  return page.locator('[data-testid="equipa-card"]').filter({ hasText: name });
}
/** The (single open) Gerir management modal. */
function manageModal(page: Page) {
  return page.getByRole("dialog", { name: /Gerir/i });
}
/** Open the Gerir modal for `name` and switch to a named section. */
async function openSection(page: Page, name: string, section: string) {
  const modal = manageModal(page);
  if (!(await modal.isVisible())) {
    await card(page, name).getByRole("button", { name: "Gerir", exact: true }).click();
    await expect(modal).toBeVisible();
  }
  await modal.getByRole("radio", { name: section, exact: true }).click();
  return modal;
}

test("Equipa: assign a primary to a zero-mapping therapist from the Gerir modal + Nova marcação auto-fill (W4-01/W12-40)", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // Working hours are managed from the SAME modal (Horários section exists) —
  // the consolidation guarantee.
  const modal = await openSection(page, THER, "Serviço principal");
  await expect(modal.getByRole("radio", { name: "Horários", exact: true })).toBeVisible();

  // The Serviço principal dropdown lists ALL active services (not "Sem serviços").
  const select = modal.locator('select[name="serviceId"]');
  await expect(select).toBeVisible();
  await expect(select.locator("option", { hasText: "Osteopatia" })).toHaveCount(1);

  // Assign a first/primary service → it persists and shows on the card.
  await select.selectOption({ label: "Osteopatia" });
  await modal.getByRole("button", { name: "Definir" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(card(page, THER)).toContainText("Osteopatia");

  // Nova marcação now auto-fills that primary when the therapist is chosen.
  const date = futureDate(RUN_DAY_BASE + 23);
  const dialog = await openNewAppointment(page, date);
  await dialog.getByLabel(/Terapeuta/i).selectOption({ label: THER });
  await expect(dialog.getByLabel(/Serviço/i).locator("option:checked")).toHaveText("Osteopatia");
});

test("Equipa: name/role search filters the member cards and clearing restores them (W5-02)", async ({
  page,
}) => {
  await page.goto("/admin/staff");

  // Baseline: the grid lists several seeded members, including the reception
  // account, which the query below must exclude.
  await expect(card(page, "E2E Reception")).toHaveCount(1);

  // Type a name query → the grid narrows to the matching therapist. Same
  // SearchBox as Pacientes (URL ?q= + server-side filter of the same read).
  const box = page.getByPlaceholder(/Pesquisar por nome ou função/i);
  await box.pressSequentially("Sem Servicos");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/admin\/staff\?q=/, { timeout: 8_000 });

  await expect(card(page, THER)).toHaveCount(1);
  await expect(card(page, "E2E Reception")).toHaveCount(0);

  // Clearing the query restores the full grid (reception is back).
  await box.fill("");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/admin\/staff$/, { timeout: 8_000 });
  await expect(card(page, "E2E Reception")).toHaveCount(1);
});

test("Equipa: the Gerir modal opens centered, switches sections, traps focus, deactivate/reactivate fire, Escape closes (W5-06/W12-40)", async ({
  page,
}) => {
  await page.goto("/admin/staff");
  const target = card(page, THERAPIST_ONE_LOCATION);
  await expect(target).toHaveCount(1);
  const modal = manageModal(page);

  // The card's Gerir trigger opens a centered modal <dialog>; Contacto is the
  // default section with its Guardar submit.
  await target.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  // Native <dialog> modal: focus moves inside on open (focus trap / :modal).
  await expect(modal.locator(":focus")).toHaveCount(1);
  await expect(modal.getByRole("button", { name: "Guardar" })).toBeVisible();

  // Switch to Função e acesso → the role select + activate control live here.
  await modal.getByRole("radio", { name: "Função e acesso", exact: true }).click();
  await expect(modal.locator('select[name="role"]')).toBeVisible();

  // Deactivate fires its SAME server-action handler → the card badge flips to Inativo.
  await modal.getByRole("button", { name: "Desativar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(target.getByText("Inativo", { exact: true })).toBeVisible();

  // Reactivate through the modal restores the seeded state (Ativo again).
  await target.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  await modal.getByRole("radio", { name: "Função e acesso", exact: true }).click();
  await modal.getByRole("button", { name: "Reativar" }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(target.getByText("Ativo", { exact: true })).toBeVisible();

  // Escape closes the modal (native <dialog> onCancel).
  await target.getByRole("button", { name: "Gerir", exact: true }).click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
});

test("Equipa: password-gated therapist delete — wrong password refused, correct deletes an activity-free therapist (W4-01)", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/staff");
  // This delete is DESTRUCTIVE and the cross-browser CI job runs firefox + webkit
  // against ONE shared, non-reset seed DB. So each project deletes its OWN seeded
  // zero-service, activity-free disposable therapist (see e2e/seed/seed-e2e.mjs).
  const disposable = `E2E Terapeuta Descartavel ${testInfo.project.name}`;
  const target = () => card(page, disposable);
  await expect(target()).toHaveCount(1);

  // W12-40: the password-gated delete lives in the Gerir modal's Função e acesso
  // section (danger zone). The scrypt gate itself is unchanged (server-enforced).
  const modal = manageModal(page);
  const openDelete = async () => {
    if (!(await modal.isVisible())) {
      await target().getByRole("button", { name: "Gerir", exact: true }).click();
      await expect(modal).toBeVisible();
    }
    await modal.getByRole("radio", { name: "Função e acesso", exact: true }).click();
  };

  // Wrong password → refused; the therapist is still there.
  await openDelete();
  await modal.locator('input[name="password"]').fill("0000");
  await modal.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(page.getByText(/Palavra-passe incorreta/i)).toBeVisible();
  await expect(target()).toHaveCount(1);

  // Correct password (tenant default 1234) → the activity-free therapist is deleted.
  await openDelete();
  await modal.locator('input[name="password"]').fill("1234");
  await modal.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(/admin\/staff/);
  await expect(target()).toHaveCount(0);
});
