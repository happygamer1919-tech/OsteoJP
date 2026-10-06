/**
 * guest-booking-email.spec.ts - the public form's OPTIONAL email (migration
 * 0101, strategy ruling R40), from the visitor's browser to reception's queue.
 *
 * WHAT ONLY A BROWSER CAN SHOW. The rule, the route, the action, the convert and
 * the queue component each have their own suite. None of them loads the page and
 * reads what a visitor reads: that step 4 carries ONE more field, labelled
 * "Email (opcional)" with the hint "Para receber a confirmação da marcação" (the
 * ruling's own words), that leaving it empty changes nothing, that an address
 * the rule refuses keeps the visitor on step 4 with what they typed, that an
 * address with an ACCENT in it (which a browser's own `type="email"` would have
 * refused) books, and that reception then SEES the address on the request's row,
 * labelled as given on the form and not verified.
 *
 * IT NEEDS 0101 on the stack it runs against, as the application change does:
 * the migration is on main and applied, so a stack built from the migrations
 * has the column. Anonymous on the portal for the form; the default staff session for the
 * queue. Every address is unique per run and under example.invalid.
 *
 * FOUR STEPS OR FIVE, AND THE PAGE DECIDES (INTAKE-01), exactly as
 * guest-booking-flow.spec.ts walks it.
 */
import { test, expect, type Page } from "@playwright/test";
import { LOCATION, PORTAL_BASE_URL } from "./fixtures";

const RUN = Date.now();
// A non-ASCII local part on purpose (see the first test).
const ADDRESS = `e2e-ação-${RUN}@example.invalid`;
const NAME = `E2E Convidado Email ${RUN}`;

/** Walk steps 1 to 3 and stop on step 4. Returns the step total the page showed. */
async function toStepFour(page: Page): Promise<number> {
  await page.goto("/marcacao");
  await expect(page.getByRole("heading", { name: "Pedido de marcação" })).toBeVisible({ timeout: 15_000 });
  const counter = page.getByText(/^Passo 1 de [45]$/);
  await expect(counter).toBeVisible();
  const total = Number((await counter.textContent())?.trim().slice(-1));
  await page.getByRole("group").getByText(LOCATION.name, { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(`Passo 2 de ${total}`)).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="serviceId"]').first().check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(`Passo 3 de ${total}`)).toBeVisible({ timeout: 10_000 });
  const date = page.locator('input[type="date"][name="preferredDate"]');
  await date.fill((await date.getAttribute("min")) ?? "");
  await page.locator('input[name="preferredPeriod"][value="manha"]').check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(`Passo 4 de ${total}`)).toBeVisible({ timeout: 10_000 });
  return total;
}

/**
 * Press step 4's forward button and expect NOTHING: "Continuar" on the five-step
 * flow, the consent and "Enviar pedido" on the four-step one. For the press that
 * must NOT advance. `finish` below demands the next step, so it cannot be used
 * for a value the form refuses: that was this spec's own defect on its first CI
 * run (it asked for "Passo 5 de 5" after typing `a@b`, which the form rightly
 * never showed).
 */
async function pressForward(page: Page, total: number): Promise<void> {
  if (total === 5) {
    await page.getByRole("button", { name: "Continuar" }).click();
    return;
  }
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
}

/** Leave step 4 and send: through step 5 when the page has one. */
async function finish(page: Page, total: number): Promise<void> {
  if (total === 5) {
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Passo 5 de 5")).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="date"][name="dateOfBirth"]').fill("1985-03-02");
    await page.getByLabel("Motivo da consulta").fill("E2E motivo");
    await page.getByRole("group", { name: "É portador de pacemaker?" }).getByText("Não", { exact: true }).click();
    await page.getByRole("group", { name: "Está grávida?" }).getByText("Não", { exact: true }).click();
  }
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido" }).click();
}

test.describe("the public form's optional email (R40, 0101)", () => {
  test.describe("the visitor", () => {
    test.use({ storageState: { cookies: [], origins: [] }, baseURL: PORTAL_BASE_URL });

    test("step 4 shows ONE optional email field with the ruling's label and hint, and a bad address is told there", async ({ page }) => {
      const total = await toStepFour(page);

      const email = page.locator('input[name="email"]');
      await expect(email).toHaveCount(1);
      // NOT the browser's own email check: a text field with the email keyboard,
      // and the form's shared rule deciding (email-field.ts).
      await expect(email).toHaveAttribute("type", "text");
      await expect(email).toHaveAttribute("inputmode", "email");
      await expect(email).toHaveAttribute("autocomplete", "email");
      // OPTIONAL: the name and the phone are required, this is not.
      await expect(email).not.toHaveAttribute("required", /.*/);
      await expect(page.locator('input[name="fullName"]')).toHaveAttribute("required", /.*/);
      await expect(page.getByLabel("Email (opcional)")).toHaveCount(1);
      await expect(page.getByText("Para receber a confirmação da marcação")).toBeVisible();
      // The owner-approved sentence about what the contacts are used for, under the two contact fields.
      await expect(page.getByTestId("guest-contact-use")).toHaveText(
        "Os contactos que indicar (telemóvel e, se o fornecer, email) são usados para confirmar e gerir a sua marcação.",
      );

      await page.getByLabel("Nome completo").fill(NAME);
      await page.getByLabel("Telemóvel").fill("+351 916 000 124");

      // `a@b` FAILS THE SHARED RULE. Once the page has hydrated the field itself
      // stops the post, with the form's own message as its validity; before
      // that, or with no JavaScript, the server action answers the same thing.
      // Either way the visitor is still on step 4, nothing was booked, and the
      // message is the form's: asserted on what both paths have in common.
      await email.fill("a@b");
      await pressForward(page, total);
      await expect(page.getByText(`Passo 4 de ${total}`)).toBeVisible({ timeout: 10_000 });
      if (total === 5) await expect(page.getByText("Passo 5 de 5")).toHaveCount(0);
      await expect
        .poll(async () => {
          const onField = await page.locator('input[name="email"]').evaluate((el) => (el as HTMLInputElement).validationMessage);
          const banner = await page.getByText("Verifique os dados introduzidos.").count();
          return onField === "Verifique os dados introduzidos." || banner > 0;
        })
        .toBe(true);
      await expect(page.getByTestId("guest-confirmation")).toHaveCount(0);
      // What was typed is kept, so the person corrects it rather than starting over.
      await expect(page.locator('input[name="email"]')).toHaveValue("a@b");
      await expect(page.getByLabel("Nome completo")).toHaveValue(NAME);

      // AN ACCENT IN THE LOCAL PART IS AN ADDRESS. `type="email"` would have
      // refused this in the browser, and the visitor could not have sent the form.
      await page.locator('input[name="email"]').fill(ADDRESS);
      await finish(page, total);
      await expect(page.getByTestId("guest-confirmation")).toBeVisible({ timeout: 15_000 });
      // The confirmation does not echo the address: it is a state, not a receipt.
      await expect(page.getByTestId("guest-confirmation")).not.toContainText(ADDRESS);
    });

    test("leaving the email EMPTY books exactly as before", async ({ page }) => {
      const total = await toStepFour(page);
      await page.getByLabel("Nome completo").fill(`${NAME} sem email`);
      await page.getByLabel("Telemóvel").fill("+351 916 000 125");
      await expect(page.locator('input[name="email"]')).toHaveValue("");
      await finish(page, total);
      await expect(page.getByTestId("guest-confirmation")).toBeVisible({ timeout: 15_000 });
    });
  });

  test("RECEPTION sees the address on that request's row, and no email row on the request that gave none", async ({ page }) => {
    // The default project's staff session. Serial after the two visitor tests in
    // this file, which created the two rows.
    await page.goto("/notificacoes");
    // `guest-request-row` is the <li> of one request (the testid is on the <li>, see the queue component).
    const withEmail = page.getByTestId("guest-request-row").filter({ hasText: ADDRESS });
    await expect(withEmail).toHaveCount(1, { timeout: 15_000 });
    await expect(withEmail).toContainText(NAME);
    await expect(withEmail.getByTestId("guest-email")).toContainText(ADDRESS);
    // LABELLED AS WHAT IT IS, never as a bare "Email".
    await expect(withEmail.getByTestId("guest-email")).toContainText("Email indicado no formulário (não verificado)");
    const without = page.getByTestId("guest-request-row").filter({ hasText: `${NAME} sem email` });
    await expect(without).toHaveCount(1);
    await expect(without.getByTestId("guest-email")).toHaveCount(0);
  });
});
