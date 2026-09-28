/**
 * guide-findings.spec.ts: T5, the platform guide's findings (docs/guide, #1462),
 * asserted in a browser.
 *
 *   F1  Recuperação rendered with no side menu and no top bar, because
 *       app/recuperacao had no layout.tsx. The guide told staff to leave it with
 *       the browser's back button.
 *   F4  Reception may use the SMS reply review queue (/reminders/review) and
 *       nothing linked to it. It is now the Comunicações tab "Respostas SMS".
 *   F5  A therapist read "Horários da equipa" above their own single card, and a
 *       Marcações subtitle promising all their patients' bookings.
 *
 * F2 (no "Nova fatura" button) is asserted in invoicing.spec.ts, and F3 (the
 * refusal message matches the transition table) in
 * lib/scheduling/estado-transitions-message.test.ts, which is where the table is.
 *
 * THE SHELL IS ASSERTED BY ITS OWN LANDMARKS, not by a page heading: the
 * heading rendered before F1 too. The sidebar is the "Navegação principal"
 * navigation, and the top bar carries the Notificações bell, both from
 * components/app-shell.tsx. Desktop Chrome, so the sidebar is the desktop rail.
 */
import { test, expect, type Page } from "@playwright/test";
import { STORAGE } from "./fixtures";

const SIDEBAR = "Navegação principal";
const TABS = "Secções de Comunicações";

async function expectShell(page: Page) {
  const sidebar = page.getByRole("navigation", { name: SIDEBAR });
  await expect(sidebar).toBeVisible();
  // The group entry is lit for every section URL (activePrefixes).
  await expect(sidebar.getByRole("link", { name: "Comunicações" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /^Notificações/ })).toBeVisible();
}

test.describe("reception", () => {
  test.use({ storageState: STORAGE.reception });

  test("F1: Recuperação renders inside the app shell, with the Comunicações tabs", async ({ page }) => {
    await page.goto("/recuperacao");
    await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();
    await expectShell(page);

    const tabs = page.getByRole("navigation", { name: TABS });
    await expect(tabs.getByRole("link", { name: "Recuperação" })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("link", { name: "Lembretes SMS" })).toBeVisible();
  });

  test("F4: reception reaches Respostas SMS from the sidebar and the Comunicações tabs", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("navigation", { name: SIDEBAR }).getByRole("link", { name: "Comunicações" }).click();
    await expect(page).toHaveURL(/\/recuperacao/);

    const tabs = page.getByRole("navigation", { name: TABS });
    await tabs.getByRole("link", { name: "Respostas SMS" }).click();
    await expect(page).toHaveURL(/\/reminders\/review$/);

    // The page itself, not a refusal: reception holds sms_replies:read. EXACT and
    // level 1: with inbound replies off (the local stack, and production today)
    // the page also renders the heading "Respostas por rever indisponível".
    await expect(
      page.getByRole("heading", { level: 1, name: "Respostas por rever", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Não tem permissão para esta ação.")).toHaveCount(0);

    // It is a Comunicações section in every sense: the shell, the lit sidebar
    // entry, and its own tab marked current.
    await expectShell(page);
    await expect(
      page.getByRole("navigation", { name: TABS }).getByRole("link", { name: "Respostas SMS" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

test.describe("therapist", () => {
  test.use({ storageState: STORAGE.therapist });

  test("F1: Recuperação renders inside the app shell for a therapist too", async ({ page }) => {
    await page.goto("/recuperacao");
    await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();
    await expectShell(page);
  });

  test("F4: a therapist, who may not read the reply queue, gets no Respostas SMS tab", async ({ page }) => {
    await page.goto("/recuperacao");
    await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Respostas SMS" })).toHaveCount(0);
  });

  test("F5: Horários is titled as the therapist's own schedule, not the team's", async ({ page }) => {
    await page.goto("/horarios");
    await expect(page.getByRole("heading", { level: 1, name: "O meu horário" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Horários da equipa" })).toHaveCount(0);
  });

  test("F5: the Marcações subtitle names the rows the list holds", async ({ page }) => {
    await page.goto("/marcacoes");
    await expect(page.getByRole("heading", { level: 1, name: "Marcações" })).toBeVisible();
    await expect(page.getByText("Consulte as marcações em que é o terapeuta principal.")).toBeVisible();
    await expect(page.getByText("Consulte as marcações dos seus pacientes.")).toHaveCount(0);
  });
});
