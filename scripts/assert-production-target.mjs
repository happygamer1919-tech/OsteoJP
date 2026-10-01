#!/usr/bin/env node
// ===================================================================
// THE TARGET GUARD, INVERTED. It now REQUIRES production. READ ONLY.
// ===================================================================
// Until 2026-09-04 the guard in every apply block REFUSED production, because
// standing rules 1 and 2 forbade a terminal from connecting to it. Those rules
// are amended for this wave: the lane applies migrations itself, and the guard's
// job flips from "you must not be pointed at production" to "you must be, and
// nothing else will do".
//
// A GUARD THAT ONLY EVER SAID NO IS NOT THE SAME GUARD READ BACKWARDS. Under the
// old rule, a misconfigured target failed safe: the wrong database refused and
// nothing happened. Under the new one, the dangerous case is the QUIET one - a
// URL that points at a staging copy, a branch database or a pooler on the wrong
// port would apply the migration somewhere nobody is watching and report
// success. So this refuses on any mismatch and prints what it saw.
//
// FROM THE STRING IT PRINTS HOST, PORT AND PROJECT REF. NOTHING ELSE, EVER.
// The connection string is read from the environment and never echoed, never
// logged, never included in an error. The ref is the part of the username after
// the last dot, which is how Supabase's pooler names the project; it is not a
// credential.
//
// WHY THE PORT MATTERS AS MUCH AS THE REF. drizzle-kit needs SESSION-level
// advisory locks. The transaction pooler on 6543 does not support them, so a
// migration pointed there fails in a way that looks like a lock problem rather
// than a target problem. 5432 is the session pooler.
//
// WHAT IT COMPARES, SINCE 2026-09-30. Until then it read the ref from the
// username and checked the port, and never looked at the host: a local URL whose
// username carried the ref passed everything but the port. The lead's ruling
// after INC-rehearsal-subagent-passed-the-reader-guard: compare the PARSED host
// and database name. The check itself lives in scripts/production-target.mjs,
// which the journal reader imports too, so the two guards cannot drift apart. Its
// header lists every check and the parser disagreement each one closes: scheme,
// authority, ref, host, port, database, query.
//
// IT IMPORTS ONE FILE. Before 2026-09-30 it imported nothing and its own sha256
// covered everything it ran. Now a document that pins this file by sha256 pins
// scripts/production-target.mjs beside it; that file imports nothing.
//
// USAGE, from the repo root with the environment sourced:
//   node scripts/assert-production-target.mjs
// Exit 0 = the target IS production. Exit 2 = it is not, and nothing should run.

import { PRODUCTION, REASONS, checkProductionTarget } from "./production-target.mjs";

const raw = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!raw) {
  // NAMES ONLY. Neither variable's value exists to be printed, and if one did it
  // would still not be printed.
  console.error(
    "REFUSING: neither DATABASE_URL_DIRECT nor DATABASE_URL is set. " +
      "Source the production environment first.",
  );
  process.exit(2);
}

// THE ENVIRONMENT CAN REDIRECT psql PAST THE URL. libpq reads PGHOSTADDR, PGSERVICE
// and PGSERVICEFILE from the shell that runs psql after this guard, and any of them
// can send the connection somewhere the URL does not name. A production sitting
// sets none of them, so a set one is refused. NAMES ONLY: the value is never read
// into a message.
for (const name of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"]) {
  if ((process.env[name] ?? "") !== "") {
    console.error(`REFUSING: ${name} is set, and psql would use it instead of the URL this guard checks. Unset it.`);
    process.exit(2);
  }
}

const verdict = checkProductionTarget(raw);
// NOTHING FROM THE STRING IS PRINTED UNTIL ITS SHAPE IS PROVEN. A misplaced "/",
// "?" or "@" in a password moves part of it into what new URL() calls the host or
// the port, so the three lines below are printed only once the scheme and the
// authority checks have passed. Before that, the refusal names the check only.
if (["unset", "control", "parse", "scheme", "authority"].includes(verdict.failed) || verdict.seen === null) {
  // The value is NOT included in the message. A malformed connection string is
  // still a connection string.
  console.error(`REFUSING: ${REASONS[verdict.failed] ?? "the connection string could not be parsed as a URL."}`);
  process.exit(2);
}

const { host, port, ref } = verdict.seen;
console.log(`host: ${host}`);
console.log(`port: ${port}`);
console.log(`ref:  ${ref}`);

if (verdict.ok !== true) {
  if (verdict.failed === "ref") {
    console.error(`REFUSING: project ref is "${ref}", not the production project.`);
  } else if (verdict.failed === "port") {
    console.error(
      `REFUSING: port is "${port}", not ${PRODUCTION.port}. ` +
        "drizzle-kit needs the SESSION pooler; the transaction pooler on 6543 has no session advisory locks.",
    );
  } else {
    // Every other reason names no value from the string: see REASONS.
    console.error(`REFUSING: ${REASONS[verdict.failed] ?? "the target failed a check this guard has no message for."}`);
  }
  process.exit(2);
}

console.log("target verified: production, session pooler.");
