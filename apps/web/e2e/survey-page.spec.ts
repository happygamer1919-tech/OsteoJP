/**
 * survey-page.spec.ts: the satisfaction survey page, /s/<code>, in a browser
 * (SAT-01).
 *
 * ============================================================================
 * WHY A BROWSER TEST, WHEN THE UNIT AND DATABASE SUITES ARE THOROUGH
 * ============================================================================
 * The lesson of confirm-code.spec.ts: each suite proves its own half, and what
 * nobody asserts is what a person holding the link SEES and what the database
 * HOLDS after they press the button. `app/s/[code]/page.test.tsx` renders the
 * page with the database replaced, and `lib/surveys/survey-page.db.test.ts`
 * drives the store with no browser. This file is the two together: a real
 * form, filled in and submitted, and the answer read back out of the database.
 *
 * ============================================================================
 * WHAT IT COVERS
 * ============================================================================
 *   1. ANSWER ONCE. A live link shows the visit date and the form and nothing
 *      about the patient, the therapist, the service or the clinic. A submit
 *      with a required answer missing saves nothing and keeps what was typed.
 *      A complete submit shows the thank-you page and leaves one answer, a
 *      consumed send and one audit row. Reopening the link shows the page an
 *      unknown link gets, with the same status. Negative arms throughout.
 *   2. A SIGNED-IN MEMBER OF STAFF HOLDING THE LINK SEES THE FORM (spec 3.6,
 *      note A1). The database refuses any session that carries a user, so a
 *      page that passed the visitor's own session on would show "link not
 *      valid" to every signed-in visitor.
 *
 * ============================================================================
 * IT RUNS WITH NO SESSION, DELIBERATELY
 * ============================================================================
 * `test.use` clears the storage state the rest of this suite carries. A patient
 * holding a link has no session and must not need one. Test 2 puts the admin's
 * session back for exactly the reason its title gives.
 *
 * Chromium only, listed in the Firefox and WebKit `testIgnore` sets in
 * playwright.config.ts, as the other write-heavy specs are: this file WRITES
 * appointments, survey sends and an answer into one shared, non-reset database.
 */

import { test, expect, type Page } from "@playwright/test";
import { CURRENT_SURVEY_CONSENT_VERSION } from "@osteojp/i18n";
import { formatDateLong } from "@/lib/reminders/locale";
import { generateSurveyCode } from "@/lib/surveys/survey-code";
import { auditRows, serviceClient, therapistUserId } from "./helpers/confirm-code";
import {
  clearOpenSurveyLinks,
  createConcludedVisit,
  ensureSurveyPatient,
  issueSurveyCode,
  ownerClient,
  surveyAnswers,
  surveySend,
} from "./helpers/survey-code";
import { LOCATION, SERVICE, SURVEY_PATIENT, THERAPIST_NAME } from "./fixtures";

// The page has no session and must not need one. See the header.
test.use({ storageState: { cookies: [], origins: [] } });

/** Built in `beforeAll`, not at module load: a missing key must not stop collection. */
let db: ReturnType<typeof serviceClient>;
/** Signed in as the seeded owner: the session 0102's manual door and policies need. */
let owner: Awaited<ReturnType<typeof ownerClient>>;
let practitionerId: string;

test.beforeAll(async () => {
  db = serviceClient();
  owner = await ownerClient();
  await ensureSurveyPatient(db);
  practitionerId = await therapistUserId(db);
});

/**
 * A run-scoped client address per test. `clientKeyFromHeaders` buckets the
 * `surveySubmit` limiter (10 per minute) by the first `x-forwarded-for` hop,
 * and with no such header every caller shares one bucket. An exhausted limiter
 * answers with the SAME page an invalid link gets, so a retry that inherited a
 * full bucket would fail in a way this page is built to make unreadable.
 */
test.beforeEach(async ({ page }, testInfo) => {
  const ip = `10.${testInfo.retry + 1}.${Math.floor(Math.random() * 254) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  // An unanswered link from an earlier test or an interrupted run would make
  // the manual door refuse the next one.
  await clearOpenSurveyLinks(db, owner);
});

const INVALID_TITLE = "Ligação inválida ou expirada";
const FORM_TITLE = "Avaliação de satisfação";

/** Everything the holder can read, normalised. */
async function visibleText(page: Page): Promise<string> {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
}

/** A concluded visit with a live survey link, made through 0102's own door. */
async function liveLink(): Promise<{ appointmentId: string; endsAt: Date; code: string }> {
  const visit = await createConcludedVisit(db, { practitionerId });
  const { code } = await issueSurveyCode(owner, visit.appointmentId);
  return { ...visit, code };
}

/**
 * Open a link and refuse to continue if the page is the generic refusal.
 *
 * THE PREMISE IS ASSERTED FIRST BECAUSE THIS SURFACE IS BUILT TO HIDE EXACTLY
 * THIS. A dev server running without the key this spec hashed with renders the
 * ordinary "not valid" page for every valid code, and the tests below would
 * then fail with a message about a missing form.
 */
async function openLiveLink(page: Page, code: string): Promise<number> {
  const response = await page.goto(`/s/${code}`);
  if ((await page.getByRole("heading", { name: INVALID_TITLE }).count()) > 0) {
    throw new Error(
      "A survey code this spec had just issued rendered the GENERIC REFUSAL. The most likely " +
        "cause is that the web dev server does not hold the REMINDERS_CONFIRM_CODE_SECRET this " +
        "spec hashed with: playwright.config.ts injects it from e2e/fixtures.ts, and " +
        "`reuseExistingServer` means a dev server started BEFORE that wiring is reused as-is. " +
        "Stop any dev server on the lane's WEB_PORT and run the suite through: " +
        "node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  await expect(page.getByRole("heading", { name: FORM_TITLE })).toBeVisible();
  return response?.status() ?? 0;
}

// ---------------------------------------------------------------------------
// 1. Answer once.
// ---------------------------------------------------------------------------

test("a live link is answered once: the form, the thank-you page, one answer in the database, then the generic page", async ({
  page,
}) => {
  const { appointmentId, endsAt, code } = await liveLink();
  const expectedDate = formatDateLong(endsAt, "pt");
  // The expectation is shape-checked before it is used.
  expect(expectedDate).toContain(String(endsAt.getUTCFullYear()));

  const liveStatus = await openLiveLink(page, code);

  // WHAT THE PAGE SHOWS: the visit date, who reads the answers (text 7), and
  // the three questions.
  await expect(page.getByText(`Consulta de ${expectedDate}`)).toBeVisible();
  await expect(
    page.getByText(
      "As respostas são identificadas e lidas pela equipa da clínica onde foi atendido, incluindo o seu terapeuta.",
    ),
  ).toBeVisible();
  const q1 = page.getByRole("radiogroup", { name: /^1\. Numa escala de 0 a 10/ });
  const q2 = page.getByRole("radiogroup", { name: /^2\. Numa escala de 1 a 5/ });
  await expect(q1.getByRole("radio")).toHaveCount(11);
  await expect(q2.getByRole("radio")).toHaveCount(5);
  const consent = page.getByRole("checkbox", {
    name: "Autorizo a OsteoJP a contactar-me a propósito das minhas respostas.",
  });
  await expect(consent).not.toBeChecked();

  // NEGATIVE ARM: the visit date ONLY. Asserted on the very render that proves
  // the date is there.
  const shown = await visibleText(page);
  for (const leak of [SURVEY_PATIENT.name, SURVEY_PATIENT.email, THERAPIST_NAME, SERVICE.name, LOCATION.name]) {
    expect(shown, `the page leaked ${leak}`).not.toContain(leak);
  }
  // No opt-out control in this pull request: the page's one button is the
  // submit. (Scoped to the page's own content; the dev server adds a button.)
  await expect(page.locator("main").getByRole("button")).toHaveCount(1);

  // A SUBMIT WITH A REQUIRED ANSWER MISSING SAVES NOTHING, says so in the
  // approved words, and keeps what was typed.
  const comment = `Comentario de teste ${code.slice(0, 2)}${Date.now()}`;
  await q1.getByRole("radio", { name: "9", exact: true }).check();
  await page.getByRole("textbox").fill(comment);
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  // Scoped to the page's own content: the framework keeps a live region of its own.
  await expect(page.locator("main").getByRole("alert")).toHaveText("Verifique os campos assinalados.");
  await expect(page.getByText("Escolha um valor de 1 a 5.")).toBeVisible();
  await expect(page.getByText("Escolha um valor de 0 a 10.")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/s/${code}$`));
  await expect(q1.getByRole("radio", { name: "9", exact: true })).toBeChecked();
  await expect(page.getByRole("textbox")).toHaveValue(comment);
  expect(await surveyAnswers(owner, appointmentId)).toEqual([]);
  expect((await surveySend(owner, appointmentId)).consumed_at).toBeNull();

  // THE COMPLETE ANSWER.
  await q2.getByRole("radio", { name: "4", exact: true }).check();
  await consent.check();
  await page.getByRole("button", { name: "Enviar respostas" }).click();

  await expect(page).toHaveURL(new RegExp(`/s/${code}\\?r=answered&l=pt$`));
  await expect(page.getByRole("heading", { name: "Resposta registada" })).toBeVisible();
  await expect(page.getByText("Obrigado. A sua resposta foi registada.")).toBeVisible();
  // No answer travels in the address.
  expect(page.url()).not.toContain("Comentario");

  // THE OUTPUT, READ BACK OUT OF THE DATABASE: one answer, as given, for the
  // patient the send was made to.
  expect(await surveyAnswers(owner, appointmentId)).toEqual([
    {
      nps: 9,
      rating: 4,
      comment,
      contact_consent: true,
      consent_version: CURRENT_SURVEY_CONSENT_VERSION,
      patient_id: SURVEY_PATIENT.id,
    },
  ]);
  const send = await surveySend(owner, appointmentId);
  expect(send.outcome).toBe("answered");
  expect(send.consumed_at).not.toBeNull();

  // One audit row, from nobody's session, carrying the channel and nothing of
  // the answer.
  const audits = await auditRows(db, appointmentId, "survey.submitted");
  expect(audits).toHaveLength(1);
  expect(audits[0]!.actor_user_id).toBeNull();
  expect(audits[0]!.metadata).toEqual({ channel: "email" });

  // REOPEN THE LINK: it is spent, and it is now the page a link nobody issued
  // gets, text for text and status for status.
  const spentResponse = await page.goto(`/s/${code}`);
  await expect(page.getByRole("heading", { name: INVALID_TITLE })).toBeVisible();
  const spentText = await visibleText(page);

  const unknownResponse = await page.goto(`/s/${generateSurveyCode()}`);
  await expect(page.getByRole("heading", { name: INVALID_TITLE })).toBeVisible();
  expect(spentText).toBe(await visibleText(page));
  expect(spentResponse?.status()).toBe(unknownResponse?.status());

  const malformedResponse = await page.goto("/s/nao-e-um-codigo");
  await expect(page.getByRole("heading", { name: INVALID_TITLE })).toBeVisible();
  expect(await visibleText(page)).toBe(spentText);
  expect(malformedResponse?.status()).toBe(unknownResponse?.status());

  // NEGATIVE ARM: the comparison can see a difference. The live page was not
  // this text, and nothing of the visit leaks through the refusal.
  expect(spentText).not.toBe(shown);
  expect(spentText).not.toContain(expectedDate);
  // The status of a refusal is the status of the page itself: no error code
  // tells a spent link from a live one.
  expect(spentResponse?.status()).toBe(liveStatus);

  // Still one answer: opening the spent link three more times wrote nothing.
  expect(await surveyAnswers(owner, appointmentId)).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// 2. The visitor's own session is never used.
// ---------------------------------------------------------------------------

test.describe("a visitor who is also signed in", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("a member of staff holding a live link sees the form, not the generic page", async ({ page }) => {
    const { appointmentId, code } = await liveLink();

    // CONTROL: this browser really is signed in. Without it the test would
    // pass for the reason test 1 passes.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await openLiveLink(page, code);
    await expect(page.getByRole("button", { name: "Enviar respostas" })).toBeVisible();

    // Opening wrote nothing: the send is still unanswered.
    expect((await surveySend(owner, appointmentId)).consumed_at).toBeNull();
    expect(await surveyAnswers(owner, appointmentId)).toEqual([]);
  });
});
