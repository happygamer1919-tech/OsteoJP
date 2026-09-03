/**
 * nif-required.spec.ts — PL-31. A ficha cannot be created without a NIF.
 *
 * Owner CR 2026-08-03: "when creating ficha clinica, the NIF field must be as
 * mandatory to fill in, cannot move forward without it".
 *
 * These cases exist because the unit tests prove the RULE and cannot prove the
 * FORM: that the field is actually marked required, that the exemption reveals
 * its reason input, and that a blocked submit leaves the user on the form
 * instead of silently creating half a patient.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  createPatient,
  fillPatientForm,
  generateValidNif,
  goToPatients,
  gotoPatientEdit,
} from "./helpers";

const uniq = () => Math.random().toString(36).slice(2, 8);

/**
 * Fill the create form with a deliberately bad NIF and submit.
 *
 * Goes through fillPatientForm rather than typing the two fields by hand: the
 * seeded admin has no staff_locations, so the clinic picker is a REQUIRED
 * choice (PL-15b). Hand-filling only name + NIF leaves it empty, the browser
 * blocks the submit on its own native validation, and the request never reaches
 * the server — so the test would sit on /patients/new and "pass" the URL
 * assertion while proving nothing about the NIF rule.
 */
async function submitWithNif(page: Page, nif: string) {
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: `NIF ${uniq()}`, nif });
  await page.getByRole("button", { name: "Criar Paciente" }).click();
}

test("cannot create a patient with no NIF - submit is refused and we stay on the form", async ({
  page,
}) => {
  await page.goto("/patients/new");
  await page.getByLabel(/Nome completo/i).pressSequentially(`Sem NIF ${uniq()}`);
  // Deliberately no NIF, no exemption.
  await page.getByRole("button", { name: "Criar Paciente" }).click();

  // Still on the create form: no redirect to /patients/<uuid> happened.
  await expect(page).toHaveURL(/\/patients\/new/);
  // And the field itself reports as invalid rather than the page just doing
  // nothing, which is what tells the user WHY the button appeared to fail.
  const nif = page.getByLabel(/^NIF/i);
  await expect(nif).toHaveJSProperty("validity.valid", false);
});

test("a valid NIF creates the patient and shows it on the ficha", async ({ page }) => {
  const nif = generateValidNif();
  const id = await createPatient(page, { fullName: `Com NIF ${uniq()}`, nif });

  await page.goto(`/patients/${id}`);
  // `exact` because the NIF also appears inside the identity line
  // ("NIF 200000012 · Consultório B"), which an unanchored match resolves to
  // as well and Playwright then fails as a strict-mode violation.
  await expect(page.getByText(nif, { exact: true })).toBeVisible();
  // A complete ficha carries no incomplete banner.
  await expect(page.getByTestId("ficha-incompleta-nif")).toHaveCount(0);
});

test("a malformed NIF is rejected by the server, not silently stored", async ({ page }) => {
  // Nine digits, so the browser's own required-check passes and the value
  // reaches the server: this asserts the CHECKSUM is enforced, which is the
  // half that stops the field filling up with plausible junk. 123456789 is a
  // real NIF; 123456780 is the same digits with the control digit broken.
  //
  // IT CANNOT TELL THE SERVER'S ANSWER FROM THE CLIENT'S, and that is worth
  // knowing rather than fixing here. Since the blur check exists, this exact
  // sentence is also produced in the browser - by design, both call
  // `nifMessage` - so this case stays green even when the submit never reaches
  // the server at all. That is not hypothetical: it is what happened while the
  // message was a flow element (see the layout case below), and this test
  // passed throughout. The two cases below carry the server-path proof, by
  // asserting the focus only a submit refusal moves.
  await submitWithNif(page, "123456780");

  await expect(page).toHaveURL(/\/patients\/new/);
  await expect(page.getByText(/d[ií]gito de controlo/i)).toBeVisible({ timeout: 8_000 });
});

/**
 * INC-nif-validationerror-at-the-desk — THIS IS THE CASE THAT PROVES THE FIX.
 *
 * Everything above passed before the change too, because a thrown message
 * happened to render in the form's single error paragraph. What could not be
 * proven from a unit test is the MECHANISM: a server action that throws in
 * production hands the client an opaque digest, so the operator saw a save that
 * failed with no cause and Sentry recorded an unhandled error for a typo.
 *
 * The three assertions map one-to-one onto the three halves of the fix:
 *   - the sentence is in the NIF FIELD'S own slot, not at the bottom of a long
 *     form (the refusal carries its field);
 *   - the NIF box has FOCUS, so the cursor is already where the correction goes
 *     (the submit refusal moves it, and re-pressing Guardar moves it again); and
 *   - the sentence appears EXACTLY ONCE anywhere on the page, which is what the
 *     plain getByText assertions above quietly depend on.
 */
test("a refused NIF lands on the NIF field, focuses it, and is said exactly once", async ({
  page,
}) => {
  await submitWithNif(page, "123456780");

  await expect(page).toHaveURL(/\/patients\/new/);

  const slot = page.getByTestId("field-error-nif");
  await expect(slot).toBeVisible({ timeout: 8_000 });
  await expect(slot).toHaveText(/d[ií]gito de controlo/i);

  // The cursor is in the box the operator has to fix.
  await expect(page.getByLabel(/^NIF/i)).toBeFocused();

  // Said once. Two copies would fail Playwright's strict mode on the plain
  // getByText locators the cases above use, for a reason that reads unrelated.
  await expect(page.getByText(/d[ií]gito de controlo/i)).toHaveCount(1);
});

/**
 * THE BLUR MESSAGE MUST NOT MOVE THE PAGE, and this case exists because the
 * first version of it did.
 *
 * WHAT HAPPENED, found by this file on CI and reproduced locally. The inline
 * message was rendered as an ordinary flow element, so showing it made the NIF
 * field TALLER and pushed everything below it down - including "Criar
 * paciente". Clicking that button straight from the NIF box therefore did this:
 *
 *   mousedown on the button -> the input blurs -> the check runs -> React
 *   re-renders -> the button moves down ~40px -> mouseup lands somewhere else
 *   -> Chromium delivers the click to the common ancestor, NOT the button.
 *
 * So `onSubmit` never fired, the server was never asked, and the message on the
 * screen was the CLIENT'S. It looked exactly like a working refusal. The only
 * assertion that could tell the difference was focus, because only a submit
 * refusal moves the cursor - which is how the failure surfaced at all.
 *
 * IT IS A REAL DEFECT AND NOT A TEST ARTEFACT. A person clicking Guardar
 * straight after typing a NIF would have had their first click swallowed, on
 * every attempt, and nothing would have said why. That is worse than the
 * incident this card is about.
 *
 * THE FIX IS THAT THE MESSAGE IS AN OVERLAY: absolutely positioned under its
 * field, so it takes no space in the flow. This case pins the property that
 * matters - the button does not move - rather than the mechanism, so a future
 * redesign of the message is free as long as it does not move the page.
 */
test("showing the blur message moves nothing, so the click that caused it still lands", async ({
  page,
}) => {
  await page.goto("/patients/new");
  await fillPatientForm(page, { fullName: `Layout ${uniq()}` });

  const button = page.getByRole("button", { name: "Criar Paciente" });
  const before = await button.boundingBox();

  const nif = page.getByLabel(/^NIF/i);
  await nif.click();
  await nif.press("ControlOrMeta+a");
  await nif.pressSequentially("123456780");
  await page.getByLabel(/Telem[oó]vel/i).click();
  await expect(page.getByTestId("field-error-nif")).toBeVisible();

  const after = await button.boundingBox();
  expect(before).not.toBeNull();
  expect(after?.y).toBe(before?.y);
});

/**
 * The client-side blur check, and the two things it must NOT do.
 *
 * It is UX ONLY: it decides nothing, the server re-runs the same `checkNif` on
 * every write, and the case above is what proves the server still refuses. What
 * this case pins is that adding it did not make the form hostile to type in.
 */
test("the blur check warns on leaving the NIF box, and does not trap the cursor", async ({
  page,
}) => {
  await page.goto("/patients/new");

  const nif = page.getByLabel(/^NIF/i);
  await nif.click();
  await nif.pressSequentially("123456780");
  // Leave the box the way a person does: onward to the next field.
  await page.getByLabel(/Telem[oó]vel/i).click();

  await expect(page.getByTestId("field-error-nif")).toBeVisible();
  // AND THE CURSOR STAYED WHERE THE OPERATOR PUT IT. A blur check that focuses
  // the box it is complaining about makes the form impossible to tab through,
  // and it is one line away from doing exactly that.
  await expect(nif).not.toBeFocused();

  // Correcting it clears the warning without a round trip.
  await nif.click();
  await nif.press("ControlOrMeta+a");
  await nif.pressSequentially("123456789");
  await page.getByLabel(/Telem[oó]vel/i).click();
  await expect(page.getByTestId("field-error-nif")).toHaveCount(0);
});

test("999999990 is refused and the message points at the exemption", async ({ page }) => {
  await submitWithNif(page, "999999990");

  await expect(page).toHaveURL(/\/patients\/new/);
  await expect(page.getByText(/consumidor final/i)).toBeVisible({ timeout: 8_000 });
});

test("the exemption lets a foreign patient through, and is shown on the ficha", async ({
  page,
}) => {
  const name = `Estrangeiro ${uniq()}`;
  const id = await createPatient(page, {
    fullName: name,
    nifExempt: true,
    nifExemptReason: "Passaporte do Reino Unido",
  });

  await page.goto(`/patients/${id}`);
  // The ficha states the exemption and its reason rather than an empty dash.
  await expect(page.getByText(/Sem NIF/)).toBeVisible();
  await expect(page.getByText(/Passaporte do Reino Unido/)).toBeVisible();
  // An exempted patient is COMPLETE: no incomplete banner.
  await expect(page.getByTestId("ficha-incompleta-nif")).toHaveCount(0);
});

test("ticking the exemption reveals a required reason and hides the NIF input", async ({
  page,
}) => {
  await page.goto("/patients/new");
  const nif = page.getByLabel(/^NIF/i);
  await expect(nif).toBeEnabled();

  await page.getByLabel(/Estrangeiro \/ sem NIF/i).check();
  await expect(nif).toBeDisabled();

  const reason = page.getByLabel(/^Motivo/i);
  await expect(reason).toBeVisible();
  await expect(reason).toHaveJSProperty("required", true);

  // Un-ticking restores the NIF input.
  await page.getByLabel(/Estrangeiro \/ sem NIF/i).uncheck();
  await expect(nif).toBeEnabled();
  await expect(page.getByLabel(/^Motivo/i)).toHaveCount(0);
});

test("an existing NIF cannot be edited back to empty", async ({ page }) => {
  const id = await createPatient(page, {
    fullName: `Editar NIF ${uniq()}`,
    nif: generateValidNif(),
  });

  // LE-e2e-nif-edit-404: captures WHICH kind of 404 this is, if it 404s.
  await gotoPatientEdit(page, id);
  // Cleared with real key events, not fill(""): WebKit's automation layer does
  // not propagate fill() to React's onChange, so the controlled input would
  // keep its old value and this test would pass without testing anything.
  const nifBox = page.getByLabel(/^NIF/i);
  await nifBox.click();
  await nifBox.press("ControlOrMeta+a");
  await nifBox.press("Backspace");
  await expect(nifBox).toHaveValue("");
  await page.getByRole("button", { name: /Guardar/i }).click();

  // Rejected server-side: the ficha keeps the NIF it had.
  await expect(page.getByText(/N[ãa]o é possível remover um NIF já registado/i)).toBeVisible({
    timeout: 8_000,
  });
  // INC-nif-validationerror-at-the-desk: this refusal is raised INSIDE the
  // transaction, not by the parser, and it must reach the desk the same way -
  // on the NIF field, once. It is the case that proves the wrapper catches the
  // whole write and not only the parse.
  await expect(page.getByTestId("field-error-nif")).toHaveText(
    /N[ãa]o é possível remover um NIF já registado/i,
  );
  await expect(page.getByText(/N[ãa]o é possível remover um NIF já registado/i)).toHaveCount(1);
});

test("patient search still finds a patient by NIF", async ({ page }) => {
  const nif = generateValidNif();
  const name = `Busca NIF ${uniq()}`;
  await createPatient(page, { fullName: name, nif });

  await goToPatients(page);
  // UX-01: by field name, not by placeholder copy. See the note in
  // e2e/helpers/index.ts searchPatients().
  const box = page.locator('input[name="q"]');
  await box.pressSequentially(nif);
  await box.press("Enter");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible({
    timeout: 8_000,
  });
});
