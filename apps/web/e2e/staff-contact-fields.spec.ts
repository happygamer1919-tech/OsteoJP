/**
 * staff-contact-fields.spec.ts — Administração > Equipa: staff phone + job title
 * (W8-02).
 *
 * Proves the two new profile fields end to end: an admin edits a DISPOSABLE
 * staff member's phone + professional job title in the Gerir modal, and both
 * persist across a full page reload — surfaced in the row (Telefone column +
 * the job title beneath the role) and prefilled back into the edit form.
 *
 * Also pins the decoupling: a job title set on a member does NOT change the
 * permission role shown for that row (job_title is a display field, never the
 * auth role).
 *
 * Runs as admin (default storage state). SYNTHETIC DATA ONLY: a unique
 * @osteojp.test member invited per run; no fixture user is mutated.
 */
import { test, expect } from "@playwright/test";

function unique(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

test("Equipa: edit a disposable member's phone + job title; both persist across reload (W8-02)", async ({
  page,
}) => {
  const token = unique();
  const fullName = `E2E W8-02 Contacto ${token}`;
  const email = `e2e-w802-${token}@osteojp.test`;
  const jobTitle = "Osteopata";
  const phone = `+351 900 ${token.slice(0, 3)} ${token.slice(3, 6)}`;

  // 1. Invite a disposable member (reuses the W7-01 temp-password hand-off path).
  await page.goto("/admin/staff");
  const invite = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Convidar", exact: true }) });
  await invite.locator('input[name="fullName"]').fill(fullName);
  await invite.locator('input[name="email"]').fill(email);
  await invite.locator('select[name="role"]').selectOption({ value: "therapist" });
  await invite.getByRole("button", { name: "Convidar" }).click();
  await expect(invite.getByRole("status")).toContainText("Membro convidado.");

  // 2. Find the new member's row and open its Gerir modal.
  await page.goto("/admin/staff");
  const row = page.locator("tr").filter({ hasText: fullName });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Gerir" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // 3. The edit form starts EMPTY for phone + job title (ships null).
  await expect(dialog.locator('input[name="phone"]')).toHaveValue("");
  await expect(dialog.locator('input[name="jobTitle"]')).toHaveValue("");

  // 4. Fill both and save (same "Guardar" submit as name/email).
  await dialog.locator('input[name="jobTitle"]').fill(jobTitle);
  await dialog.locator('input[name="phone"]').fill(phone);
  await dialog.getByRole("button", { name: "Guardar" }).click();

  // 5. Full reload: the row shows the phone + the job title beneath the role,
  //    and the role itself is UNCHANGED (job title is decoupled from the role).
  await page.goto("/admin/staff");
  const savedRow = page.locator("tr").filter({ hasText: fullName });
  await expect(savedRow).toContainText(phone);
  await expect(savedRow).toContainText(jobTitle);
  await expect(savedRow).toContainText("Terapeuta"); // permission role, unchanged

  // 6. Reopen the modal: both fields are prefilled from the persisted values.
  await savedRow.getByRole("button", { name: "Gerir" }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.locator('input[name="phone"]')).toHaveValue(phone);
  await expect(reopened.locator('input[name="jobTitle"]')).toHaveValue(jobTitle);
});
