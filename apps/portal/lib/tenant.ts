import 'server-only'

/**
 * The tenant this portal deployment serves. ONE reader, for the whole app.
 *
 * ==========================================================================
 * WHY AN ENVIRONMENT VARIABLE AND NOT A LOOKUP
 * ==========================================================================
 * Both OTP routes take `tenantId` in the body because they run BEFORE any
 * authentication, so there is no verified token to derive it from and no patient
 * row to read it off — `/otp/request` deliberately never touches the patient
 * table at all, which is the property that keeps it from leaking clinic
 * membership. The guest form is anonymous by construction and has the same
 * problem. The alternatives are a host-to-tenant mapping table (a migration) or
 * hard-coding an id in source (forbidden, and wrong the first time this app is
 * deployed for a second clinic). A per-deployment variable is the honest shape:
 * one portal deployment serves one clinic.
 *
 * ==========================================================================
 * IT FAILS LOUD AND IT FAILS AT CALL TIME, NEVER AT MODULE SCOPE
 * ==========================================================================
 * Absent, this throws and the caller turns it into `unavailable` — a screen that
 * says the service is unavailable and a server log naming the VARIABLE, never a
 * value.
 *
 * Not at module scope: Next imports modules during `next build` to collect page
 * data, and a module-scope throw fails the BUILD on every PR — the exact defect
 * W13-03a had to unpick on the API side. **A build is not a boot.** That is the
 * property this file exists to keep, so do not "simplify" it to a module
 * constant.
 *
 * ==========================================================================
 * WHY IT IS ONE FILE NOW. LE-portal-tenant-id-two-readers.
 * ==========================================================================
 * `lib/auth/otp.ts` and `lib/guest/api.ts` each held a private `tenantId()` with
 * the same eight lines. The duplication was ACCEPTED DELIBERATELY when the guest
 * form shipped, and the reason was good: `otp.ts` carries PG1, the only launch
 * gate on a patient-facing path, and the rate-limiter extraction established that
 * a gate-bearing path is not touched to save an import line. Consolidating then
 * would have put a PG1 file in a commit about a public form.
 *
 * TWO COPIES IS THE NUMBER AT WHICH A THIRD GETS WRITTEN without anybody
 * noticing, and the failure mode is not cosmetic: one reader throwing while
 * another returns a stale or different value takes ONE flow down and leaves the
 * other working, which is the hardest kind of report to act on.
 *
 * So it is one file, in a commit that touches nothing else, and the PG1 path's
 * diff is an import line.
 *
 * ==========================================================================
 * ONE MESSAGE, NOT TWO, AND THAT IS NOT A LOSS
 * ==========================================================================
 * The two copies ended differently — "the patient login cannot name its tenant"
 * / "the guest booking form cannot name its tenant". That clause is already in
 * the log: both callers funnel the throw through their own `logUnavailable`,
 * which prefixes `[auth] otp/request` or `[guest] submit`. The surface is
 * recorded by the thing whose job that is, so the message says the part only it
 * can say — WHICH VARIABLE IS MISSING.
 *
 * NAMES ONLY, NEVER VALUES (PII rule 7), which is why the message names
 * `PORTAL_TENANT_ID` and never quotes what it found.
 */
export function tenantId(): string {
  const value = process.env.PORTAL_TENANT_ID
  if (!value) {
    throw new Error('PORTAL_TENANT_ID is not set; this portal deployment cannot name its tenant')
  }
  return value
}
