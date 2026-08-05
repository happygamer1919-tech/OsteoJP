#!/usr/bin/env node
// Sign a reminder action token, so the live confirm/cancel round trip can be
// observed on the deployed app. READ ONLY — touches no database and no network.
//
// WHY THIS EXISTS. LE-token-roundtrip-observation has been queued since PG3
// passed: the /r/[token] route is deployed-proven fail-closed, but a REAL signed
// token has never been redeemed end to end. Producing one needs
// REMINDERS_LINK_SECRET, which never enters the executor's terminal (standing
// rule 3, env var NAMES only). So the owner runs this in his own shell and the
// secret stays there.
//
// The alternative already failed once: handing over an inline `node -e` that had
// never been run. This is committed, reviewable, and covered by a test.
//
// IT DUPLICATES THE WIRE FORMAT FROM lib/reminders/link-token.ts, deliberately
// and with a guard. A .mjs script cannot import that TypeScript module without a
// build step, and adding one for a two-field payload is not worth it. The risk of
// duplication is silent drift — this script signing something the server no
// longer accepts — so `link-token.script-parity.test.ts` asserts that a token
// produced by THIS logic verifies with the REAL verifier. If the format ever
// changes, that test goes red rather than the owner discovering it against a
// deployed URL.
//
// USAGE, from the repo root with the prod env sourced:
//   node apps/web/scripts/sign-reminder-token.mjs <tenantId> <appointmentId> [scope]
//
// scope is `confirm_cancel` (the 48h email link) or `confirm` (the 24h SMS
// link). Default confirm_cancel, because that is the one with both actions to
// observe.

import { createHmac } from "node:crypto";

const SECRET_ENV = "REMINDERS_LINK_SECRET";
const BASE_ENV = "REMINDERS_RESCHEDULE_BASE_URL";
const SCOPES = new Set(["confirm", "confirm_cancel"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const [tenantId, appointmentId, scopeArg] = process.argv.slice(2);
const scope = scopeArg ?? "confirm_cancel";

if (!tenantId || !appointmentId) {
  console.error(
    "usage: node apps/web/scripts/sign-reminder-token.mjs <tenantId> <appointmentId> [confirm|confirm_cancel]",
  );
  process.exit(2);
}
for (const [name, v] of [["tenantId", tenantId], ["appointmentId", appointmentId]]) {
  if (!UUID.test(v)) {
    console.error(`${name} must be a uuid, got: ${v}`);
    process.exit(2);
  }
}
if (!SCOPES.has(scope)) {
  console.error(`scope must be one of ${[...SCOPES].join(" | ")}, got: ${scope}`);
  process.exit(2);
}

const secret = process.env[SECRET_ENV];
if (!secret) {
  // Name only. The value is never printed, here or anywhere.
  console.error(`${SECRET_ENV} is not set. Source the prod env first; never paste the value.`);
  process.exit(2);
}

/**
 * Expiry. The server ties a real token's expiry to the appointment start
 * (link-token.ts: "no live token for a visit that has already happened"), which
 * this script cannot know without a database read. 30 minutes is used instead:
 * long enough to click, short enough that a token pasted into a terminal history
 * is not a standing credential.
 */
const exp = Math.floor(Date.now() / 1000) + 30 * 60;

const wire = { t: tenantId, a: appointmentId, exp, s: scope };
const payloadB64 = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
const token = `${payloadB64}.${sig}`;

const base = process.env[BASE_ENV];
console.log(`scope:   ${scope}`);
console.log(`expires: ${new Date(exp * 1000).toISOString()} (30 minutes)`);
console.log("");
console.log(base ? `${base.replace(/\/$/, "")}/r/${token}` : `/r/${token}`);
if (!base) {
  console.log("");
  console.log(`(${BASE_ENV} not set — prefix the path with the deployed origin yourself)`);
}
