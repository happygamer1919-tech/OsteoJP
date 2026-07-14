/**
 * profile-reachability.spec.ts - W7-02.
 *
 * The profile page (/perfil) shipped in W6-02 and worked, but its only entry
 * point was the avatar/name chip, whose sole affordance was an aria-label. A
 * sighted user had no way to know it was clickable, so the owner could not find
 * the page at all. This spec proves the VISIBLE "O meu perfil" entry exists for
 * EVERY role, leads to that role's OWN profile, and that the profile edits only
 * the actor's own account.
 *
 * Own-account-only is structural, not a check that could be bypassed: the server
 * actions (app/perfil/actions.ts) take no user id at all - they write
 * eq(users.id, ctx.userId) from the verified request context, and the password
 * change goes through the actor's own Supabase session. There is no route param
 * and no request field naming another user, so there is nothing to tamper with.
 * What this spec proves is the observable half: each role sees only its own data.
 *
 * The password change is round-tripped back to the seeded password so the shared
 * fixture is left as found (and `ensureAuthUser` in the seed resets it anyway).
 * Chromium-only, like other state-mutating new-feature specs: three browsers
 * changing the same account's password concurrently would race.
 *
 * SYNTHETIC DATA ONLY (@osteojp.test fixtures).
 */
import { test, expect, type Page } from "@playwright/test";
import { E2E_PASSWORD, STORAGE, USERS } from "./fixtures";

const ENTRY = "O meu perfil";
const TEMP_PASSWORD = "W7temp0rariaX9";

/** The visible entry leads to this role's own profile. */
async function reachProfileViaEntry(page: Page, ownEmail: string) {
  await page.goto("/dashboard");

  const entry = page.getByRole("link", { name: ENTRY, exact: true });
  await expect(entry).toBeVisible();
  await entry.click();

  await page.waitForURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: "Perfil", exact: true })).toBeVisible();

  // Own account, not somebody else's: the profile shows THIS actor's email.
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(ownEmail);
  // Email is the login identity: read-only here.
  await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
}

/** Edit own name, then restore it, so the shared fixture ends unchanged. */
async function editOwnNameRoundTrip(page: Page, marker: string) {
  const nameField = page.getByLabel("Nome", { exact: true });
  const original = await nameField.inputValue();

  await nameField.fill(marker);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Nome atualizado.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue(marker);

  await page.getByLabel("Nome", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Nome atualizado.")).toBeVisible();
}

/** Change own password, then change it back to the seeded one. */
async function changeOwnPasswordRoundTrip(page: Page) {
  const submit = page.getByRole("button", { name: "Alterar palavra-passe", exact: true });

  await page.getByLabel("Nova palavra-passe", { exact: true }).fill(TEMP_PASSWORD);
  await page.getByLabel("Confirmar palavra-passe", { exact: true }).fill(TEMP_PASSWORD);
  await submit.click();
  await expect(page.getByText("Palavra-passe alterada.")).toBeVisible();

  // Restore the seeded password (leave the fixture as found).
  await page.getByLabel("Nova palavra-passe", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Confirmar palavra-passe", { exact: true }).fill(E2E_PASSWORD);
  await submit.click();
  await expect(page.getByText("Palavra-passe alterada.")).toBeVisible();
}

const ROLES = [
  { role: "admin", storage: STORAGE.admin, email: USERS.admin },
  { role: "therapist", storage: STORAGE.therapist, email: USERS.therapist },
  { role: "reception", storage: STORAGE.reception, email: USERS.reception },
] as const;

for (const { role, storage, email } of ROLES) {
  test.describe(`profile reachability - ${role}`, () => {
    test.use({ storageState: storage });

    test(`${role}: sees "O meu perfil", opens OWN profile, edits own name, changes own password (W7-02)`, async ({
      page,
    }) => {
      await reachProfileViaEntry(page, email);
      await editOwnNameRoundTrip(page, `Perfil W7-02 ${role}`);
      await changeOwnPasswordRoundTrip(page);
    });
  });
}

/**
 * The owner has no stored session (fixtures: "log in fresh with E2E_PASSWORD"),
 * so sign in first. Owner is the role the reporting owner actually uses.
 */
test.describe("profile reachability - owner", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('owner: sees "O meu perfil" and opens OWN profile (W7-02)', async ({ page }) => {
    // Same login flow as e2e/auth.setup.ts.
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(USERS.owner);
    await page.locator('input[name="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /Iniciar sessão/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await reachProfileViaEntry(page, USERS.owner);
    await editOwnNameRoundTrip(page, "Perfil W7-02 owner");
  });
});
