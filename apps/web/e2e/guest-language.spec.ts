/**
 * guest-language.spec.ts — LANG-01, IN A BROWSER, INCLUDING ONE WITH NO
 * JAVASCRIPT.
 *
 * ==========================================================================
 * THE PROPERTY THIS FILE EXISTS TO EXECUTE RATHER THAN DESCRIBE
 * ==========================================================================
 * The guest flow's whole claim is that its four steps are ONE form posting to
 * ONE server action, so it behaves identically with and without JavaScript.
 * That claim has been in `GuestBookingForm.tsx`'s header since GUEST-04 and
 * NOTHING HAS EVER RUN IT: there is no `javaScriptEnabled: false` anywhere in
 * this directory, and `guest-booking-flow.spec.ts` pins the CONTROL (the native
 * date input) rather than the behaviour.
 *
 * The language half depends on that claim completely. `?lang=` survives four
 * steps because the form renders `action=""` and an empty action posts to the
 * CURRENT URL, query string and all. If the no-JS path did not work, the
 * language would silently reset to Portuguese on step 2 for exactly the
 * visitors least able to report it.
 *
 * SO THE FIRST TEST BELOW TURNS JAVASCRIPT OFF AND WALKS THE STEPS. It is the
 * run the design report said should exist and could not claim.
 *
 * ==========================================================================
 * FOUR STEPS OR FIVE, AND THE PAGE DECIDES WHICH (INTAKE-01)
 * ==========================================================================
 * Once migration 0087's table exists, the catalog reports `intakeEnabled` and
 * the form grows a FIFTH step: the clinical intake, with the RGPD tick beneath
 * it. Until then it is the four steps above. This file does not choose: it
 * reads the step counter on step 1 and walks whatever the page shows, so it
 * passes on a database with 0087 and on one without it. On five steps the
 * no-JavaScript walk also goes THROUGH step 5 and back, which is the proof the
 * design report asked for (SPEC section 11.3 item 6): the native date input,
 * the textareas and both radio pairs post from a browser with no JavaScript,
 * because their answers come back after a round trip. Nothing is submitted, so
 * the walk writes no request and no intake.
 *
 * ==========================================================================
 * IT RUNS AGAINST THE PORTAL, ANONYMOUSLY
 * ==========================================================================
 * No storageState: the default project ships an admin session, and inheriting
 * it would prove the page works for staff, which is not the question.
 */
import { test, expect, type Page } from "@playwright/test";
import { LOCATION, PORTAL_BASE_URL } from "./fixtures";

/** The step counter, in either language, for four OR five steps. */
const stepText = (n: number, lang: "en" | "pt"): RegExp =>
  lang === "en" ? new RegExp(`^Step ${n} of [45]$`) : new RegExp(`^Passo ${n} de [45]$`);

/** How many steps THIS page has, read off step 1's counter. */
async function totalSteps(page: Page, lang: "en" | "pt"): Promise<number> {
  const counter = page.getByText(stepText(1, lang));
  await expect(counter).toBeVisible({ timeout: 15_000 });
  const total = Number((await counter.textContent())?.trim().slice(-1));
  expect([4, 5]).toContain(total);
  return total;
}

test.describe("LANG-01 — the guest flow speaks the language the URL asks for", () => {
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: PORTAL_BASE_URL });

  test("WITHOUT JAVASCRIPT: ?lang=en survives every step, four or five", async ({ browser }) => {
    // A context of its own, because `javaScriptEnabled` is a context option and
    // this is the only test in the file that wants it off.
    const context = await browser.newContext({
      baseURL: PORTAL_BASE_URL,
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
      await page.goto("/marcacao?lang=en");

      // STEP 1, IN ENGLISH. The heading is the dictionary's, so this is also the
      // assertion that the page resolved the locale at all.
      const total = await totalSteps(page, "en");

      // AND THE DOCUMENT LANGUAGE WITH IT. `htmlLang` maps en -> en-GB; a page
      // rendered in English inside `lang="pt-PT"` is announced in Portuguese.
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");

      // The clinic radio, then a NATIVE submit. With JavaScript off this is the
      // browser's own form post - no React, no fetch, no client router.
      await page.getByRole("group").getByText(LOCATION.name, { exact: true }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      // STEP 2, STILL ENGLISH. This is the assertion the whole design turns on:
      // the POST went to `action=""`, which is the current URL, which still
      // carries ?lang=en. Nothing carried it in a hidden field and nothing
      // stored it.
      await expect(page.getByText(`Step 2 of ${total}`)).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).searchParams.get("lang")).toBe("en");

      await page.locator('input[name="serviceId"]').first().check();
      await page.getByRole("button", { name: "Continue" }).click();

      // STEP 3 — and the NATIVE date input is still native, which is the other
      // half of "works without JavaScript" (SCHED-07 left exactly this one
      // control alone for that reason).
      await expect(page.getByText(`Step 3 of ${total}`)).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('input[type="date"][name="preferredDate"]')).toHaveCount(1);
      expect(new URL(page.url()).searchParams.get("lang")).toBe("en");

      const date = page.locator('input[type="date"][name="preferredDate"]');
      await date.fill(String(await date.getAttribute("min")));
      await page.getByRole("group").getByText("Morning", { exact: false }).first().click();
      await page.getByRole("button", { name: "Continue" }).click();

      // STEP 4, FOUR POSTS LATER, STILL ENGLISH.
      await expect(page.getByText(`Step 4 of ${total}`)).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).searchParams.get("lang")).toBe("en");
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");

      if (total === 5) {
        // STEP 5, THE CLINICAL INTAKE (INTAKE-01). The details first, then a
        // native Continue: still no JavaScript.
        await page.getByLabel("Full name").fill("E2E Intake Walk");
        await page.getByLabel("Mobile").fill("+351 916 000 124");
        await page.getByRole("button", { name: "Continue" }).click();

        await expect(page.getByText("Step 5 of 5")).toBeVisible({ timeout: 15_000 });
        expect(new URL(page.url()).searchParams.get("lang")).toBe("en");

        // THE CONTROLS THE SPEC NAMES, and each posts by name with no script: a
        // NATIVE date input (the twin of preferredDate) and two radio pairs with
        // NEITHER answer pre-checked (ruling 2).
        const dob = page.locator('input[type="date"][name="dateOfBirth"]');
        await expect(dob).toHaveCount(1);
        await expect(page.locator('input[type="radio"][name="pacemaker"]')).toHaveCount(2);
        await expect(page.locator('input[type="radio"][name="pregnancy"]')).toHaveCount(2);
        await expect(page.locator('input[type="radio"][name="pacemaker"]:checked')).toHaveCount(0);
        await expect(page.locator('input[type="radio"][name="pregnancy"]:checked')).toHaveCount(0);

        // THE CONSENT MOVED HERE, and it states the seven-day rule.
        await expect(page.getByTestId("guest-intake-consent")).toContainText("seven days");
        await expect(page.locator('input[type="checkbox"][name="consent"]')).toHaveCount(1);

        await dob.fill("1985-03-02");
        await page.locator('textarea[name="reason"]').fill("E2E lower back pain");
        await page
          .getByRole("group", { name: "Do you have a pacemaker?" })
          .getByText("No", { exact: true })
          .click();
        await page
          .getByRole("group", { name: "Are you pregnant?" })
          .getByText("No", { exact: true })
          .click();

        // BACK, THEN FORWARD AGAIN: two native POSTs. The answers can only be
        // here afterwards if they travelled in the form body, which is the
        // property. Nothing is submitted, so nothing is written.
        await page.getByRole("button", { name: "Back" }).click();
        await expect(page.getByText("Step 4 of 5")).toBeVisible({ timeout: 15_000 });
        await page.getByRole("button", { name: "Continue" }).click();
        await expect(page.getByText("Step 5 of 5")).toBeVisible({ timeout: 15_000 });

        await expect(dob).toHaveValue("1985-03-02");
        await expect(page.locator('textarea[name="reason"]')).toHaveValue("E2E lower back pain");
        await expect(page.locator('input[name="pacemaker"][value="nao"]')).toBeChecked();
        await expect(page.locator('input[name="pregnancy"][value="nao"]')).toBeChecked();
        // ARTICLE 9: after four more POSTs, no answer and no step is in the URL.
        const url = new URL(page.url());
        expect([...url.searchParams.keys()]).toEqual(["lang"]);
        await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      }
    } finally {
      await context.close();
    }
  });

  test("WITH JAVASCRIPT: the same steps, the same parameter", async ({ page }) => {
    // The pair matters. If only the JS path were tested, the no-JS visitor would
    // be the one nobody checked; if only the no-JS path were, a client-side
    // regression would be invisible.
    await page.goto("/marcacao?lang=en");
    const total = await totalSteps(page, "en");

    await page.getByRole("group").getByText(LOCATION.name, { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(`Step 2 of ${total}`)).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("lang")).toBe("en");
  });

  test("the DEFAULT is Portuguese, and no parameter is needed for it", async ({ page }) => {
    await page.goto("/marcacao");
    await expect(page.getByText(stepText(1, "pt"))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
  });

  test("an UNKNOWN ?lang= lands on Portuguese rather than erroring", async ({ page }) => {
    // A crawler or a typo on a PUBLIC form. It must render, not refuse.
    await page.goto("/marcacao?lang=de");
    await expect(page.getByText(stepText(1, "pt"))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
  });

  test("the two language links are on STEP 1, and the current one is not a link", async ({
    page,
  }) => {
    await page.goto("/marcacao");
    const links = page.getByTestId("guest-lang-links");
    await expect(links).toBeVisible();

    // The OTHER language is an anchor; the CURRENT one is plain text, so a
    // screen reader announces one actionable choice rather than two.
    await expect(page.getByTestId("guest-lang-en")).toBeVisible();
    await expect(page.getByTestId("guest-lang-pt")).toHaveCount(0);

    await page.getByTestId("guest-lang-en").click();
    await expect(page.getByText(stepText(1, "en"))).toBeVisible({ timeout: 15_000 });
    // And now they swap.
    await expect(page.getByTestId("guest-lang-pt")).toBeVisible();
    await expect(page.getByTestId("guest-lang-en")).toHaveCount(0);
  });

  test("the links are NOT offered after step 1, because a link would discard the answers", async ({
    page,
  }) => {
    // A navigation resets useActionState to step 1 with every value gone. On
    // step 1 that costs nothing; on step 2 it would silently throw away what the
    // visitor had just chosen, and the switch would read as the form crashing.
    await page.goto("/marcacao");
    await page.getByRole("group").getByText(LOCATION.name, { exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText(stepText(2, "pt"))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("guest-lang-links")).toHaveCount(0);
  });
});
