#!/usr/bin/env node
/**
 * READ-ONLY. Answers ONE question: does `public.guest_booking_requests` grant
 * the `authenticated` role the privileges reception's guest queue needs?
 *
 * ===========================================================================
 * WHY THIS EXISTS
 * ===========================================================================
 * Migration 0063 created `guest_booking_requests` with RLS policies and NO
 * GRANT. It is the ONLY table in the whole migration set created after 0003
 * without a grant in its own migration - 0055, 0056 and 0058 all carry one, and
 * 0055's own comment states the rule: "These tables do NOT inherit 0003's
 * blanket grant".
 *
 * On CI, built from the same `supabase/migrations` by `supabase db reset`, every
 * staff read of that table fails:
 *
 *   PostgresError: permission denied for table guest_booking_requests
 *   code 42501
 *
 * `withTenantContext` runs `set local role authenticated`, so that is the role
 * reception's queue reads as. If production's ACL matches the committed
 * migration, /notificacoes is throwing for every staff member since 0063 was
 * applied on 2026-08-15.
 *
 * IT DOES NOT MATCH WHAT THE OWNER OBSERVED. On 2026-08-17 he saw a guest
 * request rendered in that queue. Both cannot be true, so this script settles
 * which - it is a PREMISE MISMATCH and it is not being reconciled by guesswork.
 *
 * ===========================================================================
 * HOW TO RUN IT (Ivan, in your own shell - this terminal never connects to prod)
 * ===========================================================================
 *   set -a; . ~/osteojp-secrets/new-prod.env; set +a
 *   node packages/db/scripts/check-guest-requests-grant.mjs
 *
 * It runs three SELECTs against catalog views. It writes NOTHING, reads no
 * patient data, and prints no connection string.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "No DATABASE_URL_DIRECT or DATABASE_URL in the environment. Source the prod env file first.",
  );
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  // 1. The grants that actually exist on the table, for the roles that matter.
  const grants = await sql`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'guest_booking_requests'
      and grantee in ('authenticated', 'anon', 'service_role', 'patient')
    order by grantee, privilege_type
  `;

  // 2. The comparison table, which is known-correct: 0055 granted explicitly.
  const control = await sql`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'staff_notifications'
      and grantee = 'authenticated'
    order by privilege_type
  `;

  // 3. RLS state, so the answer cannot be misread as "RLS is off".
  const [rls] = await sql`
    select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
    from pg_class
    where oid = 'public.guest_booking_requests'::regclass
  `;

  const authPrivs = grants
    .filter((g) => g.grantee === "authenticated")
    .map((g) => g.privilege_type);

  console.log("=== public.guest_booking_requests ===");
  console.log("RLS enabled:", rls?.rls_enabled, "| forced:", rls?.rls_forced);
  console.log("grants:", grants.length === 0 ? "(none)" : "");
  for (const g of grants) console.log(`  ${g.grantee.padEnd(14)} ${g.privilege_type}`);

  console.log("\n=== control: public.staff_notifications (0055 granted explicitly) ===");
  console.log("  authenticated:", control.map((c) => c.privilege_type).join(", ") || "(none)");

  console.log("\n=== VERDICT ===");
  // The queue READS; the convert reads and UPDATEs. Both are needed for
  // GUEST-06; SELECT alone is enough for the shipped GUEST-03 queue.
  const hasSelect = authPrivs.includes("SELECT");
  const hasUpdate = authPrivs.includes("UPDATE");

  // 0065 REVOKED FIVE PRIVILEGES, so "holds SELECT and UPDATE" is no longer the
  // whole question - what matters now is whether it holds anything ELSE.
  // Before 0065 the extras were present and came from Supabase's default
  // privileges rather than from any migration; after it they are gone.
  const EXPECTED = ["SELECT", "UPDATE"];
  const extras = authPrivs.filter((p) => !EXPECTED.includes(p)).sort();

  if (hasSelect && hasUpdate && extras.length === 0) {
    // THE INTENDED END STATE. This arm did not exist before 2026-08-18: until
    // 0065 was applied, no database had ever been in it.
    console.log("CORRECT. authenticated holds SELECT and UPDATE, and nothing else.");
    console.log("This is the state migration 0065 defines, and the committed");
    console.log("migrations now reproduce it: a database built from");
    console.log("packages/db/migrations gets the same ACL production has.");
    console.log("Nothing to do.");
  } else if (hasSelect && hasUpdate) {
    // The PRE-0065 state, and the one the whole script was written to diagnose.
    console.log("WORKS, BUT OVER-PRIVILEGED. authenticated holds SELECT and UPDATE,");
    console.log("so reception's queue and the convert both function - AND it also");
    console.log("holds:", extras.join(", "));
    console.log("Nothing granted those. They come from Supabase default privileges");
    console.log("applied at CREATE TABLE. RLS still bounds every one of them, so");
    console.log("this is not an exposure - but it means 0065 has NOT been applied");
    console.log("to this database, and the committed migrations do not describe it.");
  } else if (hasSelect && !hasUpdate) {
    console.log("PARTIAL. authenticated can SELECT but NOT UPDATE.");
    console.log("The shipped guest queue (GUEST-03) works; the GUEST-06 convert");
    console.log("would fail at the point it marks the request handled.");
  } else {
    console.log("*** PRODUCTION IS BROKEN. authenticated cannot SELECT this table. ***");
    console.log("Reception's /notificacoes page throws for every staff member,");
    console.log("because listPendingGuestRequests runs on every render of it.");
    console.log("This is an incident, not a CI difference. Report it immediately.");
  }
} finally {
  await sql.end({ timeout: 5 });
}
