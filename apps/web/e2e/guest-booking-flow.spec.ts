/**
 * guest-booking-flow.spec.ts - the PUBLIC booking form at /marcacao, walked in a
 * browser by somebody who is not logged in.
 *
 * ==========================================================================
 * WHY IT EXISTS, AND IT IS TWO REASONS AT ONCE.
 * ==========================================================================
 * FIRST, LE-guest-form-no-e2e: this flow had 131 assertions and NO browser
 * coverage. The encoding, the write endpoint, the public read, the server action
 * and the dictionary each have their own unit suite; nothing loaded the page
 * anonymously and pressed the buttons. In particular NOTHING proved that
 * `proxy.ts` lets an unauthenticated visitor reach the page at all - a rule
 * change there would have passed every test in the repository and closed the
 * public form.
 *
 * SECOND, SCHED-07: this is the ONE date field the conversion sweep left NATIVE,
 * and a decision to leave something alone deserves a test more than a change
 * does. GuestBookingForm's own header gives the reason - "the four steps are one
 * <form> posting to one server action ... so the flow works identically with and
 * without JavaScript" - and the shared DatePicker is a client component that
 * posts through React state. Converting it would have traded a cosmetic
 * consistency for a public form that stops working when a script does. The
 * assertion below pins the control: `input[type="date"]`, named `preferredDate`.
 *
 * IT RUNS AGAINST THE PORTAL APP, anonymously: no storageState, PORTAL_BASE_URL
 * as the base. The seed's tenant is the one PORTAL_TENANT_ID names.
 */
import { test, expect } from "@playwright/test";
import { LOCATION, PORTAL_BASE_URL } from "./fixtures";

test.describe("the public guest booking form (GUEST-04)", () => {
  // ANONYMOUS. Overriding storageState with `undefined` is the point of the
  // test: the default project ships an admin session, and inheriting it would
  // prove the page works for staff, which is not the question.
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: PORTAL_BASE_URL });

  test("an anonymous visitor walks four steps and gets a confirmation, with a NATIVE date field", async ({
    page,
  }) => {
    await page.goto("/marcacao");

    // STEP 1 - the page is reachable without a session. This is the assertion
    // the unit suites cannot make: it is about proxy.ts, not about the form.
    await expect(page.getByRole("heading", { name: "Pedido de marcação" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Passo 1 de 4")).toBeVisible();

    // No availability is disclosed anywhere on this screen (MN-27 / MN-28): a
    // visitor must not learn who works where or when a building is empty.
    await expect(page.getByText(/terapeuta/i)).toHaveCount(0);

    // LINDA-A-VELHA BY NAME, not "the first radio". The catalog orders clinics
    // by name, so the first is Consultorio B - which offers NOTHING, because
    // both seeded bookable services are scoped to Linda-a-Velha by
    // `services.location_id` and the route intersects that ceiling with the
    // price grid. A spec that picked the first radio would be asserting a
    // catalog accident.
    // Scoped to the radio GROUP: the clinic name also appears in the telephone
    // list at the foot of the page, and an unscoped text match resolves to two.
    await page.getByRole("group").getByText(LOCATION.name, { exact: true }).click();
    await page.getByRole("button", { name: "Continuar" }).click();

    // STEP 2 - service.
    await expect(page.getByText("Passo 2 de 4")).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="serviceId"]').first().check();
    await page.getByRole("button", { name: "Continuar" }).click();

    // STEP 3 - when. THE DATE FIELD IS THE NATIVE CONTROL, deliberately, and it
    // still posts by NAME. If somebody converts it to the shared picker this
    // line fails, which is exactly the conversation that should happen first.
    await expect(page.getByText("Passo 3 de 4")).toBeVisible({ timeout: 10_000 });
    const date = page.locator('input[type="date"][name="preferredDate"]');
    await expect(date).toHaveCount(1);
    // The bounds come from the SERVER, in Lisbon, so a browser in another zone
    // cannot be offered yesterday.
    await expect(date).toHaveAttribute("min", /^\d{4}-\d{2}-\d{2}$/);
    await expect(date).toHaveAttribute("max", /^\d{4}-\d{2}-\d{2}$/);

    // A DATE INSIDE THE SERVER'S OWN WINDOW, read off the field rather than
    // invented. The bounds are a booking horizon, and a spec that picked a date
    // beyond it would be refused by the server and re-render step 3 - which
    // reads as "Continuar is broken" and is not. Reading them also proves they
    // are usable rather than merely present.
    const min = (await date.getAttribute("min")) ?? "";
    const max = (await date.getAttribute("max")) ?? "";
    expect(min < max).toBe(true);
    const preferred = min;
    await date.fill(preferred);
    await page.locator('input[name="preferredPeriod"][value="manha"]').check();
    await page.getByRole("button", { name: "Continuar" }).click();

    // STEP 4 - the review carries the date THIS BROWSER chose, which is what
    // proves the value survived two more posts as a hidden field.
    await expect(page.getByText("Passo 4 de 4")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(preferred)).toBeVisible();

    await page.getByLabel("Nome completo").fill(`E2E Convidado ${Date.now()}`);
    await page.getByLabel("Telemóvel").fill("+351 916 000 123");
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Enviar pedido" }).click();

    // THE CONFIRMATION IS A STATE, NOT A URL: there is no address anybody can
    // visit to be told their request arrived, so it is asserted in the render
    // that follows the accepted submit.
    await expect(page.getByTestId("guest-confirmation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("guest-confirmation")).toContainText(
      /em análise|análise|recebemos/i,
    );
  });
});
