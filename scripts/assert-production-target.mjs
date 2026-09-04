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
// IT PRINTS HOST, PORT AND PROJECT REF. NOTHING ELSE, EVER.
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
// USAGE, from the repo root with the environment sourced:
//   node scripts/assert-production-target.mjs
// Exit 0 = the target IS production. Exit 2 = it is not, and nothing should run.

const EXPECTED_REF = "dfotoodqvmjhbdcxyaxf";
const EXPECTED_PORT = "5432";

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

let url;
try {
  url = new URL(raw);
} catch {
  // The value is NOT included in the message. A malformed connection string is
  // still a connection string.
  console.error("REFUSING: the connection string could not be parsed as a URL.");
  process.exit(2);
}

const ref = url.username.split(".").pop() ?? "";
console.log(`host: ${url.hostname}`);
console.log(`port: ${url.port}`);
console.log(`ref:  ${ref}`);

if (ref !== EXPECTED_REF) {
  console.error(`REFUSING: project ref is "${ref}", not the production project.`);
  process.exit(2);
}
if (url.port !== EXPECTED_PORT) {
  console.error(
    `REFUSING: port is "${url.port}", not ${EXPECTED_PORT}. ` +
      "drizzle-kit needs the SESSION pooler; the transaction pooler on 6543 has no session advisory locks.",
  );
  process.exit(2);
}

console.log("target verified: production, session pooler.");
