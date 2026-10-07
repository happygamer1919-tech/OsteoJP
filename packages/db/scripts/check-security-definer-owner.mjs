#!/usr/bin/env node
// Every public SECURITY DEFINER function is owned by `postgres`, and there are
// exactly twenty of them. READ ONLY.
//
// WHY THIS EXISTS. Postgres runs a SECURITY DEFINER function with its OWNER's
// privileges, and RLS on all 37 policy-bearing tables is ENABLE and NOT FORCE
// (relforcerowsecurity FALSE, confirmed against production 2026-08-07). So the
// owner BYPASSES RLS BY OWNERSHIP, and that bypass is the mechanism the patient
// slot sweep, the conflict check and the JWT helpers all depend on.
//
// Change the applying principal and every function created afterwards inherits a
// different owner while the earlier ones keep the old one. NOTHING ELSE DETECTS
// THAT: drizzle-kit succeeds, the function checkers report EXISTS with a live
// body (both true), check-journal reconciles, and CI passes — because
// `supabase db reset` builds a database where ONE principal creates everything,
// so CI structurally cannot reproduce the split. The production symptom is a
// WRONG ANSWER rather than an error, and for appointment_conflicts a wrong
// answer is a double booking.
//
// TWO ASSERTIONS, AND THE SECOND IS THE ONE PEOPLE FORGET.
//   1. OWNER — every function's owner is `postgres`.
//   2. COUNT — there are exactly twenty. An owner check alone passes happily
//      on a TWENTY-FIRST function that arrived correctly owned, which is fine
//      today and is exactly how an unreviewed SECURITY DEFINER function enters
//      the schema unnoticed. Adding one is a deliberate act; it must move this
//      number and 0060's statement list together.
//
// SAFETY, because this is pointed at production:
//   * The transaction is opened READ ONLY, so the server refuses any write.
//   * It reads pg_catalog only (pg_proc / pg_namespace / pg_get_userbyid). It
//     never touches a patient table.
//   * It prints function names, owner names and a verdict. Never the connection
//     string, never an environment value.
//
// USAGE, from the repo root with the target env sourced:
//   pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs
//
// Exit 0 only when BOTH assertions hold. Exit 1 names what failed.

import { pathToFileURL } from "node:url";

/** The declared owner. Read from production 2026-08-07 for the first thirteen. */
export const EXPECTED_OWNER = "postgres";

/**
 * The declared count. It matches 0060's statement list one for one, and both
 * must move together — that pairing is the point of asserting a number at all.
 *
 * 13 -> 14 on 2026-09-02: migration 0072 adds `public.resolve_confirm_code(text)`,
 * the single SECURITY DEFINER door to `appointment_confirm_codes`. It carries its
 * own `ALTER FUNCTION ... OWNER TO postgres` in the same migration, which is the
 * pairing this constant exists to enforce - a function created without it would
 * inherit the applying principal's ownership and this count would still be right
 * while the OWNER check caught it.
 *
 * 14 -> 16 on 2026-09-02: migration 0073 adds `public.viewer_location_ids()` and
 * `public.viewer_visible_patient_ids()`, the two nullary helpers `patients_select`
 * evaluates once per statement. Both are SECURITY DEFINER for the same reason
 * every viewer helper since 0047 has been - they read `staff_locations`, which
 * carries its own policy - and both carry their own `ALTER FUNCTION ... OWNER TO
 * postgres` in the same migration.
 *
 * 16 -> 20 on 2026-09-02: migration 0074 adds the three SECURITY DEFINER WRITE
 * doors for `appointment_confirm_codes` (issue, withdraw, consume) that 0072
 * never built, plus `public.viewer_treated_patient_ids()` for PERF-12. The
 * three writers are the reason the service-role seam in
 * apps/web/lib/reminders/confirm-code-store.ts could be removed: SR-29 revokes
 * the table from every application role, so a narrow function per verb is the
 * only shape that writes it without a GRANT that would let any authenticated
 * session write any row.
 *
 * 21 -> 22 with migration 0086 (SCHED-17, NESA): `public.shared_resource_practitioner_ids()`,
 * the nullary set appointments_rls evaluates once per statement. It carries its
 * own `ALTER FUNCTION ... OWNER TO postgres` in 0086.
 *
 * 22 -> 24 with migration 0087 (INTAKE-01, the guest clinical intake):
 * `public.patient_guest_request_ids()`, the nullary set the PATIENT arm of the
 * guest_clinical_intakes policy evaluates once per statement (the patient role
 * has no grant on guest_booking_requests, so it cannot resolve its own request
 * ids any other way), and `public.purge_expired_guest_intakes(uuid)`, the
 * retention job's body, which deletes rows no application role may delete. Both
 * carry their own `ALTER FUNCTION ... OWNER TO postgres` in 0087.
 *
 * This branch carries the SUM of the two, which is what the merge of #1282 made
 * resolvable: 22 + 2. Both migrations were applied to production on 2026-09-11,
 * and the 0087 post-check measured 24 there (row 16, `before + 2` from a carry
 * of 22). docs/migration-apply-0087.md reads the count by delta rather than
 * through this constant, so an apply never depends on this number being current.
 *
 * 24 -> 25 with migration 0090 (NESA-NAMES):
 * `public.shared_resource_appointment_patient_names()`, the narrow read that
 * returns an appointment id and a display name for bookings held by a SHARED
 * RESOURCE, so a therapist reads the patient's name on a NESA card without
 * `patients_select` being widened. It carries its own
 * `ALTER FUNCTION ... OWNER TO postgres` in 0090, and EXECUTE is granted to
 * `authenticated` only - `anon`, `patient` and `service_role` are revoked in the
 * same migration.
 *
 * 25 -> 26 with migration 0091 (CARE-01, promoted 2026-09-21):
 * `public.viewer_care_team_patient_ids()`, the nullary set of patients the
 * calling therapist is CURRENTLY assigned to by reception (`removed_at IS
 * NULL`), evaluated once per statement by the care-team read policy on
 * `appointments`. It carries its own `ALTER FUNCTION ... OWNER TO postgres` in
 * 0091, and EXECUTE is granted to `authenticated` only - PUBLIC, `anon` and
 * `service_role` are revoked in the same migration.
 *
 * MEASURED, NOT INCREMENTED, because this constant is a SUM and a branch that
 * writes it as though it were the only contributor gets it wrong - which is
 * exactly what the 22-vs-23 conflict above cost. Scanning every
 * `ALTER FUNCTION public.<name>(...) OWNER TO` across packages/db/migrations found
 * 26 pins with NO duplicates against 25 declared names, and the single set
 * difference was `viewer_care_team_patient_ids`. A throwaway database with the
 * whole mirror applied through 0091 reports 26 `prosecdef` functions in
 * `public`, which is the same number arrived at from the other end. 0091
 * contributes exactly one, so the sum is 24 + 1 + 1.
 *
 * 26 -> 27 with migration 0096 (CARE-02a, ruled 0098 on 2026-09-27 and
 * renumbered 0096 on 2026-09-30, promoted on PR #1471):
 * `public.viewer_care_team_patient_ids_at_my_clinics()`, the nullary set of
 * patients the calling user is CURRENTLY on the care team of AND linked to one
 * of their own clinics, which `patients_select`, `clinical_records_select` and
 * `patient_care_team_select` evaluate once per statement. It carries its own
 * `ALTER FUNCTION ... OWNER TO postgres` in 0096, and EXECUTE is granted to
 * `authenticated` only (PUBLIC, `anon` and `service_role` are revoked in the
 * same migration). 0095 made one function SECURITY DEFINER and one SECURITY
 * INVOKER, a net zero, so 26 held through it and the sum is 26 + 1.
 *
 * THE ORDER, because this constant and the migration live in different PRs and
 * a frozen gate cannot ride with a migration: GREEN applies 0096 from #1471's
 * held head FIRST; then this change merges; then main is merged into #1471 and
 * #1471 merges. Between this merge and #1471's, main's own count reads red
 * (the seeded database and the derived set hold 26, this says 27): one red run,
 * accepted by the ruling.
 *
 * 27 -> 28 with migration 0097 (the registo write policies, ruled 0099 on
 * 2026-09-27 and renumbered 0097 on 2026-09-30, promoted on PR #1475):
 * `public.claim_ai_draft_authorship(uuid)`, the review claim of an
 * AI-ingested draft that nobody has authored yet. It writes one column, in
 * one direction (a NULL `practitioner_id` becomes the caller), in one state
 * (a `pending_review` draft), for a therapist who sees the patient. It carries
 * its own `ALTER FUNCTION ... OWNER TO postgres` in 0097, and EXECUTE is
 * granted to `authenticated` only (PUBLIC, `anon` and `service_role` are
 * revoked by name in the same migration). 0097 adds no other definer, so the
 * sum is 27 + 1.
 *
 * THE ORDER is 0096's: GREEN applies 0097 from #1475's held head FIRST; then
 * this change merges; then main is merged into #1475 and #1475 merges. Between
 * this merge and #1475's, main's own count reads red (the seeded database and
 * the derived set hold 27, this says 28): one red run, accepted by the ruling.
 *
 * 28 -> 36 with migration 0102 (SAT-01, the satisfaction survey's tables,
 * doors and switch audit; numbered 0102 by strategy's R41, promoted on PR
 * #1551). It creates EIGHT SECURITY DEFINER functions, each with its own
 * `ALTER FUNCTION ... OWNER TO postgres` in 0102:
 *   - six doors, with EXECUTE granted to `authenticated` only:
 *     `public.issue_survey_automatic(text, uuid, uuid, text)`,
 *     `public.issue_survey_manual(text, uuid, uuid, text)`,
 *     `public.survey_send_state(uuid, uuid)`,
 *     `public.resolve_survey_code(text)`,
 *     `public.submit_survey_response(text, uuid, integer, integer, text, boolean, text)`
 *     and `public.opt_out_survey(text, uuid)`;
 *   - two that no application role may execute:
 *     `public.purge_expired_survey_comments(uuid)` and the trigger function
 *     `public.patients_survey_switch_audit()`.
 * Its ninth function, the private helper `public.survey_manual_verdict`, runs
 * as its caller and is NOT counted: it carries no owner pin, on purpose. 0098
 * to 0101 add no definer, so the sum is 28 + 8.
 *
 * MEASURED, NOT INCREMENTED: GREEN's post-check on production read
 * `51 tables, 36 secdef, 0 not postgres` in the sitting of 2026-10-07 (28
 * before it), and the definer set derived from `packages/db/migrations` with
 * 0102 in it has 36 names.
 *
 * THE ORDER is 0096's: GREEN applied 0102 from #1551's held head FIRST; then
 * this change merges; then main is merged into #1551 and #1551 merges. Between
 * this merge and #1551's, main's own count reads red (the seeded database and
 * the derived set hold 28, this says 36): one red run, accepted by the ruling.
 */
export const EXPECTED_COUNT = 36;

/**
 * The verdict, as a pure function of the catalog rows.
 *
 * Extracted and exported so the NEGATIVE ARM can drive it with fabricated rows.
 * A checker whose failure path has never executed is a checker nobody has
 * tested, and this one guards a property CI cannot reproduce.
 */
export function evaluate(rows, { owner = EXPECTED_OWNER, count = EXPECTED_COUNT } = {}) {
  const problems = [];

  const wrong = rows.filter((r) => r.owner !== owner);
  for (const r of wrong) {
    problems.push(`${r.name} is owned by "${r.owner}", expected "${owner}"`);
  }

  if (rows.length !== count) {
    problems.push(
      `expected exactly ${count} SECURITY DEFINER function(s) in public, found ${rows.length}` +
        (rows.length > count
          ? ` — a new one landed without being added to 0060 and to EXPECTED_COUNT`
          : ` — one is missing, or was dropped without updating 0060`),
    );
  }

  return problems;
}

const IS_CLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (IS_CLI) {
  const DB_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!DB_URL) {
    // Names only. The value is never printed, here or anywhere.
    console.error("Set DATABASE_URL_DIRECT or DATABASE_URL (names only; never paste the value).");
    process.exit(2);
  }

  let postgres;
  try {
    ({ default: postgres } = await import("postgres"));
  } catch {
    console.error(
      "could not resolve the `postgres` driver from here.\n" +
        "Run it through the package that depends on it, from the repo root:\n\n" +
        "  pnpm --filter @osteojp/db exec node scripts/check-security-definer-owner.mjs",
    );
    process.exit(2);
  }

  // TLS is REQUIRED for a remote host and OFF for a local one.
  //
  // This script runs in two places its siblings never do. Against production it
  // must not connect in the clear. In CI it points at the Supabase stack on
  // 127.0.0.1:54322, which serves no TLS at all — a hardcoded `ssl: "require"`
  // there fails with "socket disconnected before secure TLS connection was
  // established", which reads exactly like a checker failure and is not one.
  //
  // Decided from the HOST, never from an env flag: a flag could be set wrong and
  // would silently permit a cleartext connection to production, which is the one
  // outcome that must be impossible.
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL);
  const sql = postgres(DB_URL, {
    ssl: isLocal ? false : "require",
    max: 1,
    idle_timeout: 10,
    connect_timeout: 15,
    onnotice: () => {},
  });

  try {
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe("set transaction read only");
      return tx`
        select p.proname as name,
               pg_get_userbyid(p.proowner) as owner,
               p.provolatile as volatility
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
        order by p.proname
      `;
    });

    const width = Math.max(...rows.map((r) => r.name.length), 10);
    for (const r of rows) {
      const ok = r.owner === EXPECTED_OWNER;
      console.log(`${r.name.padEnd(width)}  ${r.owner.padEnd(12)} ${ok ? "OK" : "WRONG OWNER"}`);
    }
    console.log(`\n${rows.length} SECURITY DEFINER function(s) in public.`);

    const problems = evaluate(rows);
    if (problems.length > 0) {
      console.error(`\nFAIL: ${problems.length} problem(s):`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error(
        "\nSECURITY DEFINER ownership is the RLS bypass three code paths depend on.\n" +
          "A split owner set produces WRONG ANSWERS, not errors. Do not merge.",
      );
      process.exit(1);
    }
    console.log(`\nOK: all ${rows.length} owned by ${EXPECTED_OWNER}.`);
  } catch (err) {
    console.error(`query failed: ${err instanceof Error ? err.message : "unknown"}`);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
