/**
 * confirm-code.spec.ts — the 24h SMS confirm page, /c/<code>, in a browser.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND IT IS THE SAME SHAPE AS THE NIF DEFECT
 * ============================================================================
 * A grep for `/c/` over `apps/web/e2e` returned NOTHING. Until this file, no
 * test had ever OPENED this page. The unit suites are thorough and they test
 * the pieces: `confirm-page-gates.test.ts` asserts the two gate constants,
 * `confirm-redeem.db.test.ts` asserts the redemption logic and its timing, and
 * `confirm-link.test.ts` asserts the SMS line. Every one of them was green
 * while `Pedir remarcação` shipped as a button that wrote `consumed_at` and one
 * `audit_log` row and NOTHING THAT ANY SCREEN RENDERS.
 *
 * THAT IS NOT A GAP IN THOSE TESTS; IT IS A GAP BETWEEN THEM. Each proved its
 * own half. What nobody asserted is what a person holding the link SEES, and
 * what the database HOLDS afterwards. INC-CONFIRM-10 is that gap arriving as an
 * incident: the owner pressed a real button on a real link, was told "Pedido
 * recebido", and nobody at the clinic was told anything at all.
 *
 * So every test here reads an OUTPUT: pixels on the page, or a row read back
 * out of the database after the press. Not a constant, and not a return value.
 *
 * ============================================================================
 * WHAT IT COVERS, ONE TEST EACH, EVERY ONE WITH A NEGATIVE ARM
 * ============================================================================
 *   1. A valid code renders date, time and location, and Confirmar moves the
 *      appointment from `scheduled` to `confirmed` — with the audit row and its
 *      server-captured IP read back. Negative arm: the page carries NO service
 *      name, NO practitioner name and NO patient name (counsel section 7), and
 *      a second press writes no second row.
 *   2. A forged, an expired and an already-consumed code are INDISTINGUISHABLE
 *      (SR-30). Negative arm: a valid code's page differs from all three, so
 *      the comparison is proven able to see a difference.
 *   3. `Pedir remarcação` is not rendered while its gate is closed, AND the
 *      action refuses a forged press. Negative arm: the control the page DOES
 *      offer is found by the same locator, and the database is read back to
 *      prove the refused press wrote nothing.
 *   4. The fee sentence slot renders nothing while it is capability-gated dark.
 *      Negative arm: a control sentence is asserted PRESENT by the same means.
 *
 * ============================================================================
 * IT RUNS WITH NO SESSION, DELIBERATELY
 * ============================================================================
 * `test.use` clears the storage state the rest of this suite carries. A patient
 * holding an SMS link has no session and must not need one — a code is not a
 * login and must not become one (`actions.ts`). Running as the seeded admin
 * would leave that property untested and would hide an auth wrapper if one were
 * ever put in front of this route.
 *
 * Chromium only, listed in the Firefox and WebKit `testIgnore` sets in
 * playwright.config.ts, for the reason the other write-heavy specs are: this
 * file WRITES appointments and confirm codes, and the cross-browser job runs
 * against one shared, non-reset database.
 */

import { test, expect, type Page } from "@playwright/test";
import { formatDateLong, formatTime } from "@/lib/reminders/locale";
import { generateConfirmCode } from "@/lib/reminders/confirm-code";
import { FEE_NOTICE_ACCEPTANCE_CLAUSE } from "@/lib/reminders/fee-notice";
import {
  appointmentStatus,
  auditRows,
  authenticatedClient,
  codeIsSpent,
  consumeCode,
  createAppointment,
  ensureConfirmPatient,
  issueCode,
  serviceClient,
  therapistUserId,
} from "./helpers/confirm-code";
import { CONFIRM_PATIENT, LOCATION, RUN_DAY_BASE, SERVICE, THERAPIST_NAME } from "./fixtures";

// The page has no session and must not need one. See the header.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * BUILT IN `beforeAll`, NOT AT MODULE LOAD, and that is not a style choice.
 * Playwright imports every spec file to collect tests, so a client constructed
 * here would throw during COLLECTION when the service-role key is absent and
 * would take the whole suite down with it - a missing credential for THIS file
 * reported as "no tests ran" for every other one.
 */
let db: ReturnType<typeof serviceClient>;

/**
 * The SECOND client, signed in as the seeded admin so its statements run as
 * `authenticated`. Every call to one of 0072/0074's confirm-code functions goes
 * through it, because that is the only role they are granted to; the header of
 * helpers/confirm-code.ts records the CI shard that proved it.
 */
let auth: Awaited<ReturnType<typeof authenticatedClient>>;

/** Resolved once; the seeded therapist's users id is random per seed run. */
let practitionerId: string;

test.beforeAll(async () => {
  db = serviceClient();
  auth = await authenticatedClient();
  await ensureConfirmPatient(db);
  practitionerId = await therapistUserId(db);
});

/**
 * A RUN-SCOPED CLIENT ADDRESS PER TEST, AND IT IS NOT A CONVENIENCE.
 *
 * TWO THINGS AT ONCE, and the second is why it is per TEST rather than per
 * file. First, it is the value `confirmCodeAction` captures server-side under
 * SR-06, so test 1 can read it back out of `audit_log` and prove the capture
 * happened — an assertion that is impossible without controlling the address.
 *
 * Second, `clientKeyFromHeaders` buckets the `tokenRedeem` limiter (10 per
 * minute) by the first `x-forwarded-for` hop, and with NO such header every
 * caller collapses into one shared `c-code:unattributed` bucket. Every press in
 * this file, plus every press a CI retry repeats, would share one counter — and
 * an exhausted limiter answers with the SAME generic refusal a forged code
 * gets. The suite would go red on a test that describes SR-30, for a reason
 * that is nothing to do with SR-30, and the page is designed so that the two
 * cannot be told apart from outside. A fresh address per test removes the whole
 * question rather than budgeting against it.
 */
let clientIp: string;

test.beforeEach(async ({ page }, testInfo) => {
  clientIp = `10.${testInfo.retry + 1}.${Math.floor(Math.random() * 254) + 1}.${
    Math.floor(Math.random() * 254) + 1
  }`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": clientIp });
});

/** An instant `days` out, at 12:30 UTC — a real wall-clock time in Lisbon. */
function futureInstant(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 30, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * The `<dd>` of one detail row, addressed through its `<dt>` label.
 *
 * `has:` an EXACT text match, not `hasText:` — a substring filter would let a
 * location whose name happened to contain "Data" select the wrong row, and the
 * failure would be a value assertion that reads as a rendering bug.
 */
function detail(page: Page, label: string) {
  return page
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd");
}

/** Everything the holder can read, normalised. The unit of comparison for SR-30. */
async function visibleText(page: Page): Promise<string> {
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
}

/**
 * Open a code and refuse to continue if the page is the generic refusal.
 *
 * THE PREMISE IS ASSERTED BEFORE ANYTHING ELSE BECAUSE THIS SURFACE IS BUILT TO
 * HIDE EXACTLY THIS. If the dev server is running without
 * `REMINDERS_CONFIRM_CODE_SECRET`, or with a different one, `hashConfirmCode`
 * throws inside the page's `.catch(() => null)` and EVERY valid code renders
 * the ordinary "Ligação inválida ou expirada". Tests 2 and 4 would then pass
 * for the wrong reason — a page that refuses everything is trivially
 * indistinguishable and trivially free of a fee sentence — and test 1 would
 * fail with a message about a missing heading.
 *
 * `reuseExistingServer` is on outside CI, so an already-running `pnpm dev`
 * started before this change is the likely cause and the message says so.
 */
async function openValidCode(page: Page, code: string): Promise<void> {
  await page.goto(`/c/${code}`);
  const generic = page.getByRole("heading", { name: "Ligação inválida ou expirada" });
  if ((await generic.count()) > 0) {
    throw new Error(
      "A code this spec had just minted rendered the GENERIC REFUSAL. The most likely " +
        "cause by far is that the web dev server does not hold the same " +
        "REMINDERS_CONFIRM_CODE_SECRET this spec hashed with: playwright.config.ts injects " +
        "it from e2e/fixtures.ts, and `reuseExistingServer` means a dev server started " +
        "BEFORE that wiring is reused as-is. Stop any dev server on the lane's WEB_PORT and " +
        "run the suite through: node scripts/lane-stack.mjs e2e --lane <lane>",
    );
  }
  await expect(page.getByRole("heading", { name: "A sua consulta" })).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1. The round trip: what the page shows, and what Confirmar writes.
// ---------------------------------------------------------------------------

test("a valid code renders date, time and location, and Confirmar flips agendada to confirmada", async ({
  page,
}) => {
  const startsAt = futureInstant(RUN_DAY_BASE + 120);
  const appointmentId = await createAppointment(db, { practitionerId, startsAt });
  const { code, codeHash } = await issueCode(auth, appointmentId);

  const expectedDate = formatDateLong(startsAt, "pt");
  const expectedTime = formatTime(startsAt, "pt");
  // THE EXPECTATION IS SHAPE-CHECKED BEFORE IT IS USED. An assertion against a
  // formatter that had started returning "" would pass against a page that also
  // rendered "", which is the vacuous-guard shape (ACC-vacuous-guard-sweep).
  expect(expectedTime).toMatch(/^\d{2}:\d{2}$/);
  expect(expectedDate).toContain(String(startsAt.getUTCFullYear()));

  await openValidCode(page, code);

  await expect(detail(page, "Data")).toHaveText(expectedDate);
  await expect(detail(page, "Hora")).toHaveText(expectedTime);
  await expect(detail(page, "Local")).toHaveText(LOCATION.name);

  // NEGATIVE ARM — COUNSEL SECTION 7. Date, time and location ONLY. A page whose
  // contents vary by service leaks by omission, so the three things it must
  // never carry are asserted absent on the very render that proves the three it
  // must carry are present.
  const shown = await visibleText(page);
  expect(shown).not.toContain(SERVICE.name);
  expect(shown).not.toContain(THERAPIST_NAME);
  expect(shown).not.toContain(CONFIRM_PATIENT.name);

  await page.getByRole("button", { name: "Confirmar consulta" }).click();

  await expect(page).toHaveURL(/\/c\/[^/?]+\?r=confirmed$/);
  await expect(page.getByRole("heading", { name: "Consulta confirmada" })).toBeVisible();

  // THE OUTPUT, READ BACK OUT OF THE DATABASE. This is the assertion the whole
  // file exists for: not that the action returned an outcome, but that the row
  // a human being will later look at actually moved.
  expect(await appointmentStatus(db, appointmentId)).toBe("confirmed");

  // Confirm is idempotent and does NOT consume: the code stays live so a second
  // press can answer `already_confirmed` rather than the generic refusal.
  expect(await codeIsSpent(auth, codeHash)).toBe(false);

  const audits = await auditRows(db, appointmentId, "appointment.confirm.sms_code");
  expect(audits).toHaveLength(1);
  // SR-06: the address is captured SERVER-SIDE from the proxy header and is
  // never a value the form could name. Asserting it against the address this
  // browser actually sent is what makes that a proven property rather than a
  // comment.
  expect(audits[0]!.ip).toBe(clientIp);
  expect(audits[0]!.metadata).toEqual({ via: "confirm_code" });
  // The holder of a confirm code has no session and is not a user.
  expect(audits[0]!.actor_user_id).toBeNull();

  // SECOND PRESS. The appointment is `confirmed` and still viewable, so the page
  // renders again and the button is still there.
  await page.goto(`/c/${code}`);
  await page.getByRole("button", { name: "Confirmar consulta" }).click();
  await expect(page).toHaveURL(/\?r=already_confirmed$/);
  await expect(page.getByRole("heading", { name: "Consulta já confirmada" })).toBeVisible();

  // NEGATIVE ARM ON THE WRITE: idempotent means idempotent in the LEDGER too. A
  // second audit row would be a second claim that a patient confirmed.
  expect(await auditRows(db, appointmentId, "appointment.confirm.sms_code")).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// 2. SR-30 — three refusals that must be one.
// ---------------------------------------------------------------------------

test("a forged, an expired and an already-consumed code are indistinguishable", async ({ page }) => {
  // FORGED: well-formed, minted by the real generator, never issued.
  const forged = generateConfirmCode();

  // EXPIRED: a LIVE code on an appointment that has already started. 0072 stores
  // no `expires_at` on purpose (SR-28) — expiry is read from
  // `appointments.starts_at`, so an expired code is built by moving the
  // appointment, never by ageing the row.
  const past = new Date(Date.now() - 2 * 24 * 60 * 60_000);
  const expiredAppt = await createAppointment(db, { practitionerId, startsAt: past });
  const { code: expired } = await issueCode(auth, expiredAppt);

  // ALREADY CONSUMED: a live appointment whose code has been spent, through
  // 0074's own `consume_confirm_code` — the same door *pedir remarcação* uses.
  const spentAppt = await createAppointment(db, {
    practitionerId,
    startsAt: futureInstant(RUN_DAY_BASE + 121),
  });
  const { code: spent, codeHash: spentHash } = await issueCode(auth, spentAppt);
  await consumeCode(auth, spentHash);

  // MALFORMED: not eight base64url characters at all. It takes the same exit,
  // and `resolveConfirmCode` looks it up against a hash that cannot exist so it
  // costs the same query — the timing half of SR-30.
  const malformed = "nao-e-um-codigo";

  const signatures: Record<string, string> = {};
  for (const [name, code] of Object.entries({ forged, expired, spent, malformed })) {
    await page.goto(`/c/${encodeURIComponent(code)}`);
    await expect(page.getByRole("heading", { name: "Ligação inválida ou expirada" })).toBeVisible();
    signatures[name] = await visibleText(page);
  }

  // THE PROPERTY. Not "each one refuses" — four refusals that differed would
  // each pass that — but that the four responses are the SAME TEXT.
  expect(signatures.expired).toBe(signatures.forged);
  expect(signatures.spent).toBe(signatures.forged);
  expect(signatures.malformed).toBe(signatures.forged);

  // Nothing about the real appointment leaks through a refusal that HAS one.
  const leaks = [LOCATION.name, SERVICE.name, CONFIRM_PATIENT.name, formatDateLong(past, "pt")];
  for (const [name, text] of Object.entries(signatures)) {
    for (const leak of leaks) expect(text, `${name} leaked ${leak}`).not.toContain(leak);
  }

  // NEGATIVE ARM. A comparison of four identical strings proves nothing unless
  // the comparison can see a difference at all — and the empty string would
  // satisfy every assertion above. A valid code's page must differ.
  const liveAppt = await createAppointment(db, {
    practitionerId,
    startsAt: futureInstant(RUN_DAY_BASE + 122),
  });
  const { code: live } = await issueCode(auth, liveAppt);
  await openValidCode(page, live);
  expect(await visibleText(page)).not.toBe(signatures.forged);
});

// ---------------------------------------------------------------------------
// 3. The closed gate — the render half AND the write half.
// ---------------------------------------------------------------------------

test("Pedir remarcação is not rendered and the action refuses it while the gate is closed", async ({
  page,
}) => {
  const appointmentId = await createAppointment(db, {
    practitionerId,
    startsAt: futureInstant(RUN_DAY_BASE + 123),
  });
  const { code, codeHash } = await issueCode(auth, appointmentId);

  await openValidCode(page, code);

  // THE CONTROL COMES FIRST. `toHaveCount(0)` on a page that failed to render is
  // green, so the absence assertion below is worth nothing until the same
  // locator strategy has been shown to FIND a button on this page.
  await expect(page.getByRole("button", { name: "Confirmar consulta" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /remarca/i })).toHaveCount(0);

  // ==========================================================================
  // NOW THE HALF THAT HIDING A BUTTON DOES NOT COVER.
  // ==========================================================================
  // The form posts to a public endpoint. Anybody holding the URL can add the
  // button back, which is precisely why `confirmCodeAction` checks the SAME
  // constant the render checks. This appends a `pedido` submitter to the page's
  // own form — the shipped server action, the shipped code, one extra button —
  // and presses it.
  await page.evaluate(() => {
    const form = document.querySelector("form");
    if (!form) throw new Error("the confirm page rendered no form to submit");
    const button = document.createElement("button");
    button.type = "submit";
    button.name = "action";
    button.value = "pedido";
    button.dataset.e2e = "forged-pedido";
    button.textContent = "forged pedido";
    form.appendChild(button);
  });
  await page.locator("[data-e2e='forged-pedido']").click();

  await expect(page).toHaveURL(/\?r=generic$/);
  await expect(page.getByRole("heading", { name: "Ligação inválida ou expirada" })).toBeVisible();

  // THE THREE THINGS A SUCCESSFUL PEDIDO WOULD HAVE LEFT BEHIND. Read back out
  // of the database, because "the page said no" and "nothing was written" are
  // different facts and only the second one is the gate.
  expect(await appointmentStatus(db, appointmentId)).toBe("scheduled");
  expect(await codeIsSpent(auth, codeHash)).toBe(false);
  expect(
    await auditRows(db, appointmentId, "appointment.reschedule_request.sms_code"),
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 4. The fee slot, which renders nothing.
// ---------------------------------------------------------------------------

test("the fee sentence slot renders nothing while the capability is dark", async ({ page }) => {
  const appointmentId = await createAppointment(db, {
    practitionerId,
    startsAt: futureInstant(RUN_DAY_BASE + 124),
  });
  const { code } = await issueCode(auth, appointmentId);

  await openValidCode(page, code);
  const shown = await visibleText(page);

  // The control: the same reading of the same page finds the copy that IS
  // approved, so "no fee sentence" is a fact about the fee sentence and not
  // about an empty render.
  expect(shown).toContain("Confirmar consulta");

  // TWO LOCKS, AND THE SECOND IS NOT A FLAG. `REMINDERS_FEE_NOTICE_ENABLED` is
  // unset here, and `FEE_NOTICE_TEMPLATE_ID` is registered `approved: false`,
  // which no flag can open. Asserting the CLAUSE rather than the whole sentence
  // means a reworded fee line still trips this.
  expect(shown).not.toContain(FEE_NOTICE_ACCEPTANCE_CLAUSE);
  expect(shown).not.toContain("Falta sem aviso");
  expect(shown).not.toContain("50%");
});
