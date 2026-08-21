#!/usr/bin/env node
// Function-existence AND function-BODY check after a migration apply. READ ONLY.
//
// The third sibling of check-migration-tables.mjs and check-migration-columns.mjs,
// for the case neither of them covers: a migration whose whole effect is a
// `CREATE OR REPLACE FUNCTION`.
//
// WHY EXISTENCE ALONE IS NOT ENOUGH HERE, and this is the entire reason this
// script is not a two-line variant of its siblings.
//
// A REPLACED function ALREADY EXISTS. Asking "does public.appointment_conflicts
// exist" after a migration that replaces it returns true whether the migration
// ran or not, so an existence check would print OK for a total no-op. That is
// INC-07 exactly: `drizzle-kit migrate` prints success on a no-op, and the whole
// point of a post-apply checker is to be evidence the migrate output cannot be.
// A checker that cannot distinguish applied from not-applied is worse than no
// checker, because it produces a receipt.
//
// So this script checks a function's BODY, not merely its presence. A
// `<name>:<needle>` argument asserts that `pg_get_functiondef` for that function
// CONTAINS `<needle>` — a token the new body has and the old body does not. That
// is a direct read of what is installed in the database right now.
//
// SAFETY, because this is pointed at production:
//   * The transaction is opened READ ONLY, so the server itself refuses any
//     write this script could contain now or later.
//   * It reads pg_catalog only (pg_proc / pg_get_functiondef). It never touches
//     a patient table, so no NIF, phone, email or clinical value can pass
//     through it.
//   * It prints function names, the needle, and a verdict. It NEVER prints the
//     function body (which can be long), the connection string, or any
//     environment value.
//
// USAGE, from the repo root with the prod env sourced:
//   pnpm --filter @osteojp/db exec node scripts/check-migration-functions.mjs \
//     is_unconfirmed_pedido appointment_conflicts:is_unconfirmed_pedido
//
//   is_unconfirmed_pedido                        -> must EXIST (a new function)
//   appointment_conflicts:is_unconfirmed_pedido  -> must exist AND its body must
//                                                   contain that token (a REPLACE)
//
// IT LIVES INSIDE packages/db ON PURPOSE, for the same reason its siblings do:
// ESM resolves imports from the SCRIPT's own location, so the same file under
// the repo-root scripts/ could not see `postgres`.
//
// Exit 0 only when EVERY named function passes its check. Exit 1 names what
// failed and says plainly not to merge, so it is a gate and not a report.

import { pathToFileURL } from "node:url";

// The driver is imported LAZILY, after the argument and environment checks, so
// running this the wrong way prints the usage message rather than
// ERR_MODULE_NOT_FOUND before any guard can fire.

/**
 * Strip SQL comments from a function definition before matching.
 *
 * WHY THIS IS NOT COSMETIC. A bare `includes()` matches a COMMENT as readily as
 * a CALL, and the two mean opposite things here. The exact failure it lets
 * through: someone replaces
 *
 *     AND NOT public.is_unconfirmed_pedido(a.id)
 * with
 *     -- pedido exclusion via public.is_unconfirmed_pedido, temporarily disabled
 *
 * The function still exists, the token is still in `pg_get_functiondef` output,
 * and the checker prints OK for a body that no longer excludes anything. That is
 * a receipt for a regression - the same class of failure as an existence check
 * on a REPLACE, which is why this script exists at all.
 *
 * Handles both SQL comment forms plus dollar-quoted bodies, which
 * `pg_get_functiondef` always returns:
 *   - block comments, non-greedy so two comments do not merge into one span
 *   - line comments to end of line
 *
 * Exported for the negative-arm test, which proves the swap above FAILS.
 */
export function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

// Everything below runs ONLY as a CLI. Importing this module (the negative-arm
// test does) must not read argv, open a connection, or call process.exit.
const IS_CLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = IS_CLI ? process.argv.slice(2).filter(Boolean) : [];
if (IS_CLI && args.length === 0) {
  console.error(
    "usage: check-migration-functions.mjs <fn>[:<body-substring>] [...]\n" +
      "example: check-migration-functions.mjs is_unconfirmed_pedido " +
      "appointment_conflicts:is_unconfirmed_pedido",
  );
  process.exit(2);
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
const specs = [];
for (const raw of args) {
  const [name, needle = null] = raw.split(":");
  // Both halves are validated rather than trusted: the name is interpolated into
  // a catalog lookup and the needle into a comparison, and "it came from argv on
  // the owner's own machine" is not a reason to skip validation.
  if (!IDENT.test(name)) {
    console.error(`refusing non-identifier function name: ${JSON.stringify(name)}`);
    process.exit(2);
  }
  if (needle !== null && !IDENT.test(needle)) {
    console.error(`refusing non-identifier body substring: ${JSON.stringify(needle)}`);
    process.exit(2);
  }
  specs.push({ name, needle });
}

const DB_URL = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (IS_CLI && !DB_URL) {
  // Names only. The value is never printed, here or anywhere.
  console.error("Set DATABASE_URL_DIRECT or DATABASE_URL (names only; never paste the value).");
  process.exit(2);
}

let postgres;
if (IS_CLI) try {
  ({ default: postgres } = await import("postgres"));
} catch {
  console.error(
    "could not resolve the `postgres` driver from here.\n" +
      "Run it through the package that depends on it, from the repo root:\n\n" +
      "  pnpm --filter @osteojp/db exec node scripts/check-migration-functions.mjs " +
      args.join(" "),
  );
  process.exit(2);
}

const sql = IS_CLI ? postgres(DB_URL, {
  ssl: "require",
  max: 1,
  idle_timeout: 10,
  connect_timeout: 15,
  // The driver must not print the URL on a connection error.
  onnotice: () => {},
}) : null;

if (IS_CLI) try {
  const names = specs.map((s) => s.name);
  const rows = await sql.begin(async (tx) => {
    // Belt and braces: the server refuses writes for the whole transaction.
    await tx.unsafe("set transaction read only");
    return tx`
      select
        n.name,
        (
          select string_agg(pg_get_functiondef(p.oid), E'\n')
          from pg_proc p
          join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = n.name
        ) as def
      from unnest(${sql.array(names)}::text[]) as n(name)
      order by n.name
    `;
  });

  const defs = new Map(rows.map((r) => [r.name, r.def]));
  const width = Math.max(...specs.map((s) => s.name.length));
  const failures = [];

  for (const { name, needle } of specs) {
    const def = defs.get(name) ?? null;
    if (def === null) {
      console.log(`${name.padEnd(width)}  MISSING`);
      failures.push(`${name} does not exist`);
      continue;
    }
    if (needle === null) {
      console.log(`${name.padEnd(width)}  EXISTS`);
      continue;
    }
    // The body check. This is the half that distinguishes a real REPLACE from a
    // no-op on a function that already existed.
    //
    // MATCHED AGAINST THE COMMENT-STRIPPED BODY. A commented-out call still
    // carries the token, so a raw substring match would report OK for a body
    // that no longer does the thing. See stripSqlComments.
    const live = stripSqlComments(def);
    if (live.includes(needle)) {
      console.log(`${name.padEnd(width)}  EXISTS, live body calls "${needle}"`);
    } else if (def.includes(needle)) {
      // Named separately from a plain STALE BODY because the operator needs to
      // know the token IS there and is inert - that is a different problem from
      // "the migration did not run", and diagnosing it as the latter wastes a
      // round trip.
      console.log(`${name.padEnd(width)}  COMMENTED OUT: "${needle}" appears only in a comment`);
      failures.push(
        `${name} mentions "${needle}" ONLY inside a comment - the call is not live`,
      );
    } else {
      console.log(`${name.padEnd(width)}  STALE BODY, missing "${needle}"`);
      failures.push(`${name} exists but its body does not contain "${needle}"`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} check(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error("\nThe migration did NOT apply, or applied only in part. Do not merge the PR.");
    process.exit(1);
  }
  console.log(`\nOK: all ${specs.length} function check(s) passed.`);
} catch (err) {
  // Message only. A driver error object can carry the connection string.
  console.error(`query failed: ${err instanceof Error ? err.message : "unknown"}`);
  process.exit(1);
} finally {
  await sql?.end({ timeout: 5 });
}
