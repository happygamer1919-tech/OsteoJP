#!/usr/bin/env node
// Every public SECURITY DEFINER function is owned by `postgres`, and there are
// exactly sixteen of them. READ ONLY.
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
//   2. COUNT — there are exactly sixteen. An owner check alone passes happily
//      on a SEVENTEENTH function that arrived correctly owned, which is fine
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
 */
export const EXPECTED_COUNT = 16;

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
