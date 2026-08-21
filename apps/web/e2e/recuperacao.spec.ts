/**
 * recuperacao.spec.ts — INC-12. The page had NO e2e coverage at all, which is
 * why two server-side defects reached production on a page nobody could load.
 *
 * ==========================================================================
 * A 200 ON AN EMPTY LIST WOULD BE WORTHLESS HERE
 * ==========================================================================
 * The empty page rendered correctly throughout the incident. Both crashes
 * needed real rows: one query only runs when the candidate list is non-empty,
 * and the other threw on every request but had nothing to prove it. So this
 * spec asserts against SEEDED CANDIDATES with the awkward shapes, and the
 * fixtures are dated relative to now so they are always inside the window.
 *
 * WHAT IT RUNS AS: the default project's admin session, which has NO
 * staff_locations assignment - so `viewerLocationScope` returns null and the
 * query takes the UNRESTRICTED branch. That is the same branch the owner takes,
 * and the branch that was live when the page crashed for him.
 */
import { test, expect } from "@playwright/test";

const NAMES = {
  mobile: "E2E Recuperar Movel",
  landline: "E2E Recuperar Fixo",
  postponed: "E2E Recuperar Adiado",
} as const;

test("recuperacao renders a NON-EMPTY list for an unscoped admin (INC-12)", async ({ page }) => {
  await page.goto("/recuperacao");

  // THE HEADING FIRST. If the server render throws, the error boundary renders
  // instead and this fails - which is the whole incident, asserted directly.
  await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toBeVisible();

  // AND NOT THE ERROR BOUNDARY. Asserted explicitly rather than inferred from
  // the heading being present: the two are different DOM, and a future layout
  // change could render both.
  await expect(page.getByText("Não foi possível carregar a recuperação")).toHaveCount(0);

  // A REAL ROW. The empty state must NOT be what we are looking at.
  await expect(page.getByText("Ninguém para contactar.")).toHaveCount(0);
  // EXACT: "E2E Recuperar Movel" is a prefix of nothing else, but exactness costs
  // nothing and removes the whole question - the two assertions above it failed on
  // precisely this ambiguity.
  await expect(page.getByText(NAMES.mobile, { exact: true })).toBeVisible();
});

test("a mobile row offers WhatsApp, SMS and Email; a landline row offers none of them", async ({
  page,
}) => {
  await page.goto("/recuperacao");
  const mobile = page.locator("li").filter({ hasText: NAMES.mobile }).first();
  const landline = page.locator("li").filter({ hasText: NAMES.landline }).first();

  await expect(mobile.getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "SMS" })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Email" })).toBeVisible();

  // THE LANDLINE ARM IS THE ONE THAT CATCHES AN OVER-EAGER FIX. A Portuguese
  // geographic line normalises perfectly and cannot receive either channel, and
  // this patient has no email either - so the row has no channel at all and must
  // SAY so rather than silently render three fewer buttons.
  await expect(landline.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);
  await expect(landline.getByRole("link", { name: "SMS" })).toHaveCount(0);
  await expect(landline.getByRole("link", { name: "Email" })).toHaveCount(0);
  await expect(landline.getByText("Sem número registado")).toBeVisible();
  await expect(landline.getByText("Sem email registado")).toBeVisible();
});

test("the date and the therapist render, which is what the null-date crash broke", async ({
  page,
}) => {
  await page.goto("/recuperacao");
  const row = page.locator("li").filter({ hasText: NAMES.mobile }).first();

  // A REAL dd/mm/aaaa, not the em dash the null guard renders. This is the
  // assertion that distinguishes "the query returned a date" from "the page
  // survived a null" - and two of this incident's four defects were about
  // exactly that difference.
  //
  // ANCHORED, AND THAT IS NOT COSMETIC. Unanchored, the pattern also matches the
  // contact line ("... em 20/08/2026, 14:48"), so the locator resolved to TWO
  // elements and Playwright strict mode failed it - a red test over a correct
  // page. Anchoring pins the field that carries only the date.
  await expect(row.getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  // EXACT, for the same reason the date is anchored one line up: the contact
  // line also carries the therapist name ("Contactado por E2E Therapist em ..."),
  // so a substring match resolves to two elements and strict mode fails it.
  //
  // I FIXED THE DATE FIRST AND SHIPPED THIS ONE RED, which is this incident's
  // own lesson committed a fifth time at small scale: finding a defect class
  // obliges a sweep for the class, and the sweep includes the file you are
  // holding.
  await expect(row.getByText("E2E Therapist", { exact: true })).toBeVisible();
});

test("a recorded contact renders with who and when (the contacts query)", async ({ page }) => {
  // THE SECOND CRASHING STATEMENT. It only runs when the candidate list is
  // non-empty, so nothing before this spec ever executed it against real rows.
  await page.goto("/recuperacao");
  const row = page.locator("li").filter({ hasText: NAMES.mobile }).first();
  await expect(row.getByText(/Contactado (por .+ )?em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
});

test("a postponed patient is in Adiados and NOT in the main list", async ({ page }) => {
  // THE FIRST CRASHING STATEMENT ran on every request, so this section is the
  // one that took the page down even when there was nothing to show. Asserting
  // it POPULATED is what makes it more than a smoke test.
  await page.goto("/recuperacao");
  await expect(page.getByRole("heading", { name: "Adiados" })).toBeVisible();
  await expect(page.getByText("Nenhum paciente adiado.")).toHaveCount(0);

  const adiados = page.locator("section").filter({ hasText: "Adiados" }).last();
  await expect(adiados.getByText(NAMES.postponed, { exact: true })).toBeVisible();
  await expect(adiados.getByRole("button", { name: "Trazer de volta" }).first()).toBeVisible();

  // AND the postponed patient must NOT be offered for contact. A patient in both
  // places is the bug the postponement clause exists to prevent, and it would
  // look perfectly normal on screen.
  const list = page.locator("section").filter({ hasText: "Recuperação de utentes" }).first();
  await expect(list.getByText(NAMES.postponed)).toHaveCount(0);
});

test("a THERAPIST cannot reach the page at all", async ({ browser }) => {
  // The security property, and the reason `followup:read` is its own capability.
  // The list is every patient's telephone number in one place.
  const ctx = await browser.newContext({ storageState: "e2e/.auth/therapist.json" });
  const page = await ctx.newPage();
  await page.goto("/recuperacao");
  await expect(page.getByRole("heading", { name: "Recuperação de utentes" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/recuperacao/);
  await ctx.close();
});
