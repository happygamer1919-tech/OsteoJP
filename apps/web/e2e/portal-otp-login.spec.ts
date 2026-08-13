/**
 * portal-otp-login.spec.ts — SEC-otp-login-path-has-zero-e2e-coverage.
 *
 * DECISION D'S PRIMARY PATIENT LOGIN, DRIVEN END TO END FOR THE FIRST TIME.
 * Phone, code, session. Until this spec, that path was exercised by unit tests
 * and by Ivan sitting in front of a deployed build, and by nothing else.
 *
 * ============================================================================
 * WHY THE GAP EXISTED, BECAUSE IT WAS NOT AN OVERSIGHT AND THE SHAPE MATTERS
 * ============================================================================
 * Two facts, each harmless alone:
 *
 *   1. `.github/workflows/e2e.yml` wrote only NEXT_PUBLIC_API_URL to the
 *      portal's CI environment. It never wrote PORTAL_TENANT_ID.
 *   2. `apps/portal/lib/auth/otp.ts:54-57` reads that variable and THROWS
 *      without it — deliberately and loudly, per PG7's no-silent-degradation
 *      posture. The caller turns the throw into the `unavailable` screen.
 *
 * Together: the portal's OTP login COULD NOT WORK IN CI, and no test noticed,
 * because every portal spec signs in through the trusted-device door instead.
 *
 * THAT IS WORSE THAN A SKIPPED TEST AND IT IS WORTH BEING PRECISE ABOUT WHY. A
 * skipped suite FAILS TO PROVE and can be un-skipped. Here there was nothing to
 * un-skip: the coverage was not disabled, it was IMPOSSIBLE in this
 * configuration. PG1 (AUTH) passed on the owner's deployed-screen observation,
 * which is the right evidence under WF-03 and is a POINT-IN-TIME check. Nothing
 * in CI defended that path between the observation and launch. This spec is
 * that defence.
 *
 * ============================================================================
 * HOW A TEST READS A CODE IT WAS NEVER SENT, WITHOUT A BACK DOOR
 * ============================================================================
 * `fixtures.ts` records — correctly — that the OTP transport's test sink holds
 * the code in the API process's memory, where Playwright cannot reach it. The
 * conclusion drawn from that ("a test cannot read it without a back door") was
 * right about the SINK and wrong about the DATABASE.
 *
 * `verifyCode` has to check the code against something. That something is a row
 * in `patient_otp_codes` holding `hashCode(code, phoneHash)` =
 * `sha256(sha256(e164) + ":" + code)` — BOTH HASHES UNSALTED AND DETERMINISTIC,
 * by design, and documented as such in `apps/api/lib/auth/otp.ts`. So a test
 * holding the service-role key against the LOCAL seeded database can recover the
 * code by trying all 10^6 of them. Measured: 305ms worst case, 222ms typical.
 *
 * THIS IS NOT A SECURITY FINDING AND MUST NOT BE CITED AS ONE. A 6-digit code
 * has a 10^6 space by definition and the hash was never what protects it. What
 * protects it is the table being service-role only (migration 0056), the
 * five-attempt cap and the five-minute expiry — every one of which `otp.ts`
 * states outright, in the same comment that explains why the phone hash is "a
 * confirmation oracle rather than a secret". Anyone who can read this table
 * already has the patient's row.
 *
 * WHAT IT BUYS: the real login path, through shipped production code, with NO
 * test-only endpoint, NO back door and NO production change of any kind. LOOP 3
 * existed to remove the back doors from this path; this adds coverage without
 * putting one back.
 *
 * ============================================================================
 * WHAT THIS SPEC DOES NOT REPLACE
 * ============================================================================
 * The trusted-device specs stay. They cover the RETURNING patient — the path
 * most patients take every day. This adds the FIRST login beside them.
 */

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { PORTAL_BASE_URL, PORTAL_OTP_PATIENT, TENANT_A } from "./fixtures";

/** Mirrors apps/api/lib/auth/otp.ts → hashPhone. Plain sha256, no salt. */
const hashPhone = (e164: string): string =>
  createHash("sha256").update(e164).digest("hex");

/** Mirrors apps/api/lib/auth/otp.ts → hashCode. Domain-separated by the phone hash. */
const hashCode = (code: string, phoneHash: string): string =>
  createHash("sha256").update(`${phoneHash}:${code}`).digest("hex");

/**
 * Service-role client against the LOCAL Supabase the suite seeds. Never
 * production: the URL is `127.0.0.1:54321` in CI and the key is the local
 * throwaway printed by `supabase status`.
 */
function admin() {
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // NAMES ONLY, NEVER VALUES (rule 3 / PII rule 7). And it THROWS rather than
  // returning a client that cannot read: a spec that silently could not query
  // would report "no code was issued" for a missing environment variable, which
  // is the exact conflation this project keeps paying for.
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. This spec reads the local seeded " +
        "patient_otp_codes table; without the key it cannot tell a missing code " +
        "from a missing credential, so it refuses to guess.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The newest live code row for this phone, or a thrown error naming which of the
 * two failure modes happened.
 *
 * NO `| null` RETURN, on purpose — section 1.3 of PORTAL-REHYDRATE.md. "No row
 * was issued" and "the query failed" are different facts and a caller given
 * `null` would treat them alike, exactly as the four collapsed cases did in
 * LOOP 7's helper.
 */
async function newestCodeHash(phoneHash: string): Promise<string> {
  const { data, error } = await admin()
    .from("patient_otp_codes")
    .select("code_hash, expires_at, consumed_at, created_at")
    .eq("tenant_id", TENANT_A)
    .eq("phone_hash", phoneHash)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`patient_otp_codes query failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      "NO UNCONSUMED OTP ROW EXISTS for the fixture phone. The request step " +
        "reported success, so either /api/v1/auth/otp/request did not reach the " +
        "database, or PORTAL_TENANT_ID names a tenant the seed did not write. " +
        "Check the portal's .env.local step in e2e.yml before anything else.",
    );
  }
  return data[0]!.code_hash as string;
}

/**
 * Invert the stored hash over the 6-digit space.
 *
 * BOUNDED AND EXHAUSTIVE. Every code `generateOtpCode` can produce is in
 * `000000`-`999999` — zero-padded, leading zeros included, which is why the
 * portal's input is `type="text"` and not `number`. If nothing matches, the
 * stored row was produced by a different scheme and that is a REAL failure, not
 * a reason to fall back to anything.
 */
function recoverCode(codeHash: string, phoneHash: string): string {
  for (let i = 0; i < 1_000_000; i += 1) {
    const candidate = String(i).padStart(6, "0");
    if (hashCode(candidate, phoneHash) === codeHash) return candidate;
  }
  throw new Error(
    "NO 6-DIGIT CODE HASHES TO THE STORED VALUE. The whole space was tried, so " +
      "hashCode() or generateOtpCode() has changed shape in apps/api and this " +
      "spec's mirror of them is stale. Do not widen the search; fix the mirror.",
  );
}

test.describe("SEC — Decision D's first patient login, phone to session", () => {
  // NO storageState. That is the point of this file: every other portal spec
  // arrives already authenticated through the trusted-device door, and this one
  // must start with nothing.
  test.use({ storageState: { cookies: [], origins: [] }, baseURL: PORTAL_BASE_URL });

  /**
   * ONE TEST, BOTH ARMS, AND ONE ISSUED CODE. THE REASON IS A REAL LIMIT.
   *
   * `RULES.otpRequest` is 3 per hour PER PHONE and per client key
   * (apps/api/lib/rate-limit/limiter.ts:184). Playwright retries twice, so a
   * spec that requested a code per test would spend 2 requests per attempt and
   * hit the ceiling on the second retry — and the failure would arrive as
   * `otp_rate_limited`, which looks like a broken login rather than a spec
   * budgeting badly. One request per attempt leaves headroom for all three.
   *
   * It is also the stronger test. The same issued code is REFUSED when a wrong
   * one is typed and ACCEPTED when the right one is, so the pair cannot both be
   * satisfied by a verify route that says yes to everything — which is the
   * failure mode a positive-only login test would miss entirely. The wrong guess
   * costs one of the five permitted attempts and leaves the code live, which is
   * exactly what `MAX_ATTEMPTS` is for.
   */
  test("a wrong code is refused, the real one mints a session, and the dashboard survives a reload", async ({
    page,
  }) => {
    const phoneHash = hashPhone(PORTAL_OTP_PATIENT.phoneE164);

    await page.goto("/auth/login");

    // THE SCREEN IS DECISION D'S, AND THIS ASSERTS IT BEFORE USING IT. A login
    // screen that had regressed to email and password would otherwise fail below
    // with a confusing locator error instead of the real finding.
    await expect(page.getByRole("heading", { name: /entrar com o seu telem/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/palavra-passe|password/i)).toHaveCount(0);

    // ---- STEP 1: the phone -------------------------------------------------
    await page.getByLabel(/n[úu]mero de telem[óo]vel/i).fill(PORTAL_OTP_PATIENT.phoneTyped);
    await page.getByRole("button", { name: /enviar c[óo]digo/i }).click();

    // The code screen, in the product's own words. `otp_sent` is deliberately
    // worded "if the number is registered" — it is returned for a known and an
    // unknown number alike, which is the enumeration property PG1 rests on, so
    // seeing it proves the request was ACCEPTED and nothing about the patient.
    await expect(page.getByLabel(/c[óo]digo de 6 d[íi]gitos/i)).toBeVisible({ timeout: 30_000 });

    // ---- STEP 2: the code that was actually issued -------------------------
    // Read from the database, not from the screen and not from a fixture: a
    // hardcoded code would pass against a login that never issued one.
    const code = recoverCode(await newestCodeHash(phoneHash), phoneHash);
    // The VALUE is never logged — it is a live credential for five minutes, and
    // rule 3 does not carve out test credentials. Its shape is enough to
    // diagnose a bad recovery.
    console.log(`[SEC-otp] recovered a ${code.length}-digit code from the issued row`);
    expect(code).toMatch(/^\d{6}$/);

    // ---- THE NEGATIVE ARM FIRST, ON THE SAME LIVE CODE ---------------------
    // Chosen by comparison with the real code rather than picked, so it cannot
    // accidentally be right.
    const wrong = code === "000000" ? "111111" : "000000";
    await page.getByLabel(/c[óo]digo de 6 d[íi]gitos/i).fill(wrong);
    await page.getByRole("button", { name: /^entrar$/i }).click();

    // REFUSED, and still on the login screen. The API answers ONE 401 with ONE
    // body for six distinct failures so the screen cannot be used as a
    // patient-list oracle; the portal renders the single `otp_refused` string.
    await expect(page.getByText(/n[ãa]o foi poss[íi]vel entrar/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).not.toHaveURL(/\/portal\/dashboard/);

    // AND THE REFUSAL NAMES NOTHING. A message distinguishing "wrong code" from
    // "no such patient" would rebuild the oracle inside the portal and undo the
    // property the API paid for.
    const refusal = await page.locator("body").innerText();
    expect(
      refusal,
      "the refusal must not disclose which of the six failures occurred",
    ).not.toMatch(/c[óo]digo errado|n[ãa]o existe|n[ãa]o registado|expirou/i);

    // ---- THE POSITIVE ARM, SAME CODE, SAME SCREEN --------------------------
    // The wrong guess spent one of five permitted attempts and left the code
    // live, which is what MAX_ATTEMPTS is for. If this step ever fails with a
    // refusal, read the attempt counter before suspecting the login path.
    await page.getByLabel(/c[óo]digo de 6 d[íi]gitos/i).fill(code);
    await page.getByRole("button", { name: /^entrar$/i }).click();

    // THE ASSERTION: A SESSION EXISTS. The URL alone would pass on a redirect
    // that carried an error, so this waits for the dashboard to RENDER
    // something only an authenticated patient sees. `/portal/dashboard` sits
    // behind the portal's proxy: an unauthenticated request is turned around at
    // the edge and lands back on /auth/login.
    await page.waitForURL(/\/portal\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /ol[áa]/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // AND IT SURVIVES A RELOAD, which is what separates a session from a
    // redirect. A one-shot navigation would pass even if nothing were persisted.
    await page.reload();
    await expect(page).toHaveURL(/\/portal\/dashboard/);
    await expect(page.getByRole("heading", { name: /ol[áa]/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
