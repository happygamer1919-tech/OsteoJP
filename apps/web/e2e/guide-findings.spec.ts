/**
 * guide-findings.spec.ts: T5, the platform guide's findings (docs/guide, #1462),
 * asserted in a browser.
 *
 *   F1  Recuperação rendered with no side menu and no top bar, because
 *       app/recuperacao had no layout.tsx. The guide told staff to leave it with
 *       the browser's back button.
 *   F4  Reception may use the SMS reply review queue (/reminders/review) and
 *       nothing linked to it. It is now the Comunicações tab "Respostas SMS",
 *       whole on screen at phone widths too (390 and 360).
 *   F5  A therapist read "Horários da equipa" above their own single card, and a
 *       Marcações subtitle promising all their patients' bookings.
 *
 * F2 and F3 have no browser check here, and neither needs one. F2 (no "Nova
 * fatura" button) is guarded by app/invoicing/invoicing-view.test.tsx: the view
 * takes no issue prop, renders no button with or without rows, and the i18n key
 * is gone from both locales. A browser check could not show F2: the e2e stack
 * never sets InvoiceXpress credentials, so the button was already absent there
 * before the fix (invoicing.spec.ts says so where it asserts the absence). F3
 * (the refusal message matches the transition table) is
 * lib/scheduling/estado-transitions-message.test.ts, which is where the table is.
 *
 * THE SHELL IS ASSERTED BY ITS OWN LANDMARKS, not by a page heading: the
 * heading rendered before F1 too. The sidebar is the "Navegação principal"
 * navigation, and the top bar carries the Notificações bell, both from
 * components/app-shell.tsx. Desktop Chrome, so the sidebar is the desktop rail;
 * the two phone-width F4 tests check the tab bar only, never the shell.
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
    // Through the /comunicacoes redirect: on a cold dev server that is two route
    // compiles before the URL settles, which outran the 5s default on a loaded
    // machine. The wait is longer; the assertion is the same.
    await expect(page).toHaveURL(/\/recuperacao/, { timeout: 20_000 });

    const tabs = page.getByRole("navigation", { name: TABS });
    await tabs.getByRole("link", { name: "Respostas SMS" }).click();
    await expect(page).toHaveURL(/\/reminders\/review$/, { timeout: 20_000 });

    // The page itself, not a refusal: reception holds sms_replies:read. EXACT and
    // level 1: with inbound replies off, as on the local stack,
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

  /**
   * F4 ON A PHONE. The two tests above run at the desktop size, where the tab
   * bar has room. At 390px the three tabs did not fit: the bar scrolled
   * sideways, the new tab showed as "Resp", and nothing said it scrolled
   * (review round 3, the guide's own phone captures). The bar wraps now, so
   * every tab is whole on screen. What is asserted is that, and not a class
   * name: each tab's box lies inside the bar's box, and the bar has nothing
   * hidden to scroll to (scrollWidth <= clientWidth). The bar that scrolled
   * fails both.
   */
  for (const [name, viewport] of [
    ["390", { width: 390, height: 844 }],
    ["360", { width: 360, height: 780 }],
  ] as const) {
    test(`F4 at ${name}px: every Comunicações tab, Respostas SMS included, is whole on screen`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/recuperacao");
      await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();

      const tabs = page.getByRole("navigation", { name: TABS });
      await expect(tabs).toBeVisible();
      const bar = await tabs.boundingBox();
      expect(bar, "the tab bar has a box").not.toBeNull();

      for (const label of ["Recuperação", "Lembretes SMS", "Respostas SMS"]) {
        const link = tabs.getByRole("link", { name: label, exact: true });
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box, `${label} has a box`).not.toBeNull();
        if (!bar || !box) continue;
        expect(box.x, `${label} starts inside the bar`).toBeGreaterThanOrEqual(bar.x - 0.5);
        expect(box.x + box.width, `${label} ends inside the bar`).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
        expect(box.x + box.width, `${label} ends inside the viewport`).toBeLessThanOrEqual(viewport.width + 0.5);
      }

      const fit = await tabs.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(fit.scroll, `the tab bar hides nothing sideways (${fit.scroll} vs ${fit.client})`).toBeLessThanOrEqual(
        fit.client,
      );
      const doc = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(doc.scroll, `the page does not scroll sideways (${doc.scroll} vs ${doc.client})`).toBeLessThanOrEqual(
        doc.client,
      );
    });
  }
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
