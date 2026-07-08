#!/usr/bin/env node
// Twilio SMS integration — live smoke proof. RUN LOCALLY ONLY, never in CI.
//
// Usage:
//   node scripts/twilio-smoke.mjs                 # Proof 1 only (zero cost)
//   TWILIO_SMOKE_CONFIRM=yes SMOKE_TO_NUMBER=+3519XXXXXXXX \
//     node scripts/twilio-smoke.mjs               # Proof 1 + Proof 2 (~cents, 1 SMS)
//
// Proof 1 (zero cost): authenticates against the Twilio REST API (account
//   fetch) and inspects the messaging/sender configuration to show the
//   "OsteoJP" alphanumeric sender registration.
// Proof 2 (one SMS): renders the REAL production 24h appointment-reminder
//   template (apps/web/lib/reminders/templates.ts, imported directly — Node
//   >= 22.18 strips the types natively) with dummy data, sends exactly ONE
//   message to SMOKE_TO_NUMBER, polls to a terminal status, and asserts a
//   single GSM-7 segment.
//
// Credentials come from the local environment / .env.local only. The script
// NEVER prints TWILIO_AUTH_TOKEN (it is used solely inside the Authorization
// header). Do not paste credentials into chat or commit them.
//
// Exit codes: 0 ok · 1 missing/unusable credentials · 2 proof failure.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Proof 2 imports apps/web/lib/reminders/templates.ts directly. Node has to
// reparse it as ESM and warns (MODULE_TYPELESS_PACKAGE_JSON) because the
// nearest package.json (apps/web/package.json) declares no "type". Adding
// "type":"module" to apps/web/package.json is out of scope for this local
// smoke script, so we silence ONLY that one warning code for this process —
// every other warning still passes through unchanged.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const code = rest[0] && typeof rest[0] === "object" ? rest[0].code : rest[1];
  if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  return emitWarning(warning, ...rest);
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* Env loading                                                         */
/* ------------------------------------------------------------------ */

function loadEnvFile(file) {
  if (!existsSync(file)) return 0;
  let loaded = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue; // real env wins
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (value !== "") process.env[key] = value;
    loaded++;
  }
  return loaded;
}

function loadLocalEnv() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, "apps", "web", ".env.local"));
}

function credsPresent() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

function tryVercelEnvPull() {
  // Pull into whichever directory is vercel-linked. `vercel env pull` writes
  // the file; it does not echo secret values to stdout.
  const linkedDir = existsSync(path.join(ROOT, "apps", "web", ".vercel"))
    ? path.join(ROOT, "apps", "web")
    : ROOT;
  console.log(`\n[env] Twilio creds not found locally — trying \`vercel env pull\` in ${linkedDir} ...`);
  try {
    execSync("vercel env pull .env.local --yes", { cwd: linkedDir, stdio: "inherit" });
  } catch {
    console.log("[env] vercel env pull failed (not linked / not logged in). Continuing to manual check.");
  }
}

function failMissingCreds() {
  console.error(`
[env] TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN are missing or empty.

Vercel marks sensitive env vars as non-pullable, so \`vercel env pull\` may
return them redacted/empty. In that case:

  1. Open the Twilio Console → Account → API keys & tokens.
  2. Copy the Account SID and Auth Token.
  3. Paste them into ${path.join(ROOT, ".env.local")} as:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=<auth token>
       TWILIO_SMS_FROM=OsteoJP
  4. Re-run this script.

NEVER paste these values into chat, commits, or CI config.
`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Twilio REST helpers (fetch only — no SDK needed)                    */
/* ------------------------------------------------------------------ */

function authHeader() {
  const basic = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  return { Authorization: `Basic ${basic}` };
}

async function twilioGet(url) {
  const res = await fetch(url, { headers: authHeader() });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function twilioPostForm(url, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/** The exact sender resolution the production code performs (clients.ts). */
function resolveFrom() {
  return process.env.TWILIO_SMS_FROM ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
}

/* ------------------------------------------------------------------ */
/* Proof 1 — creds valid + sender config (zero cost)                   */
/* ------------------------------------------------------------------ */

async function proof1() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  console.log("\n=== Proof 1: credentials + sender configuration (zero cost) ===");

  const account = await twilioGet(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}.json`,
  );
  if (!account.ok) {
    console.error(
      `[proof1] FAIL — account fetch returned HTTP ${account.status} (${account.body?.message ?? "no message"}). Credentials are not valid.`,
    );
    process.exit(2);
  }
  console.log(
    `[proof1] Account OK: "${account.body.friendly_name}" — status=${account.body.status}, type=${account.body.type}`,
  );

  // Alphanumeric sender registration lives on Messaging Services (Sender Pool).
  const mgSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const services = [];
  if (mgSid) {
    const svc = await twilioGet(`https://messaging.twilio.com/v1/Services/${mgSid}`);
    if (svc.ok) services.push(svc.body);
    else console.warn(`[proof1] WARN — TWILIO_MESSAGING_SERVICE_SID set but fetch failed (HTTP ${svc.status}).`);
  } else {
    const list = await twilioGet("https://messaging.twilio.com/v1/Services?PageSize=50");
    if (list.ok) services.push(...(list.body.services ?? []));
  }

  let osteoJpRegistered = false;
  for (const svc of services) {
    const alpha = await twilioGet(
      `https://messaging.twilio.com/v1/Services/${svc.sid}/AlphaSenders`,
    );
    const senders = alpha.ok ? (alpha.body.alpha_senders ?? []) : [];
    console.log(
      `[proof1] Messaging service "${svc.friendly_name}" (${svc.sid}): alpha senders = ${
        senders.length ? senders.map((s) => JSON.stringify(s.alpha_sender)).join(", ") : "(none)"
      }`,
    );
    if (senders.some((s) => s.alpha_sender === "OsteoJP")) osteoJpRegistered = true;
  }
  if (services.length === 0) {
    console.log("[proof1] No messaging services found on the account.");
  }

  const from = resolveFrom();
  console.log(`[proof1] Production sender resolution (TWILIO_SMS_FROM ?? TWILIO_MESSAGING_SERVICE_SID): ${from ?? "(unset — live sends would be suppressed as unconfigured)"}`);
  if (from === "OsteoJP") {
    console.log('[proof1] From is the alphanumeric sender "OsteoJP" — messages will show "OsteoJP" on the handset.');
  }
  if (osteoJpRegistered) {
    console.log('[proof1] "OsteoJP" alphanumeric sender IS registered in a messaging service sender pool.');
  } else {
    console.log('[proof1] NOTE: "OsteoJP" not found in any messaging-service sender pool. For PT, the registered alpha sender may still be usable directly as From="OsteoJP" (registration is account-level for pre-registered countries) — Proof 2 is the definitive check.');
  }
  if (process.env.TWILIO_SENDER_ID && !process.env.TWILIO_SMS_FROM) {
    console.warn(
      "[proof1] WARN — TWILIO_SENDER_ID is set but the code reads TWILIO_SMS_FROM (docs/cutover-runbook.md names the wrong var). Set TWILIO_SMS_FROM.",
    );
  }
}

/* ------------------------------------------------------------------ */
/* Proof 2 — one real SMS through the production render path           */
/* ------------------------------------------------------------------ */

async function proof2() {
  console.log("\n=== Proof 2: one live SMS via the production template path ===");
  const confirm = process.env.TWILIO_SMOKE_CONFIRM;
  const to = process.env.SMOKE_TO_NUMBER;

  if (confirm !== "yes" || !to) {
    console.log(
      "[proof2] Skipped. To send ONE real SMS (~cents), set BOTH:\n" +
        "  TWILIO_SMOKE_CONFIRM=yes\n" +
        "  SMOKE_TO_NUMBER=+3519XXXXXXXX   (your personal number, E.164 — never a seeded patient number)",
    );
    return;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    console.error(`[proof2] FAIL — SMOKE_TO_NUMBER must be E.164 (e.g. +351912345678); got ${JSON.stringify(to)}.`);
    process.exit(2);
  }
  const from = resolveFrom();
  if (!from) {
    console.error("[proof2] FAIL — no sender configured (set TWILIO_SMS_FROM=OsteoJP).");
    process.exit(2);
  }

  // REAL production render path — same module + function dispatchReminder uses.
  const templates = await import(
    new URL("../apps/web/lib/reminders/templates.ts", import.meta.url).href
  );
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const body = templates.renderSms("24h", "pt", {
    patientFirstName: "Smoke",
    appointmentDateLong: "(unused in SMS)",
    appointmentDateShort: `${dd}/${mm}`,
    appointmentTime: "14:30",
    practitionerName: "(unused in SMS)",
    clinicLocation: "Castelo Branco",
    clinicPhone: "+351 272 000 000",
    rescheduleLink: "(unused in SMS)",
  });
  console.log(`[proof2] Rendered 24h PT reminder (${body.length} chars, GSM-7 asserted at render): ${body}`);

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const sent = await twilioPostForm(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    { To: to, From: from, Body: body },
  );
  if (!sent.ok) {
    console.error(
      `[proof2] FAIL — send rejected: HTTP ${sent.status}, code=${sent.body?.code}, message=${sent.body?.message}`,
    );
    process.exit(2);
  }
  const msgSid = sent.body.sid;
  console.log(`[proof2] Accepted by Twilio: SID=${msgSid}, initial status=${sent.body.status}`);

  // Poll to a terminal status (delivered/undelivered/failed), max 90 s.
  const TERMINAL = new Set(["delivered", "undelivered", "failed"]);
  let last = sent.body;
  const deadline = Date.now() + 90_000;
  while (!TERMINAL.has(last.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await twilioGet(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${msgSid}.json`,
    );
    if (poll.ok) {
      if (poll.body.status !== last.status) {
        console.log(`[proof2] status → ${poll.body.status}`);
      }
      last = poll.body;
    }
  }

  const segments = last.num_segments;
  console.log(`
[proof2] RESULT — paste into docs/qa/twilio-proof.md:
  SID:          ${msgSid}
  Final status: ${last.status}${last.error_code ? ` (error_code=${last.error_code})` : ""}
  Segments:     ${segments}
  From:         ${from}
  Timestamp:    ${new Date().toISOString()}
`);
  if (String(segments) !== "1") {
    console.error(`[proof2] FAIL — expected exactly 1 segment, got ${segments}.`);
    process.exit(2);
  }
  if (last.status !== "delivered") {
    console.error(
      `[proof2] ${TERMINAL.has(last.status) ? "FAIL" : "TIMEOUT"} — final status "${last.status}" is not "delivered".`,
    );
    process.exit(2);
  }
  console.log("[proof2] PASS — delivered, 1 segment.");
}

/* ------------------------------------------------------------------ */

loadLocalEnv();
if (!credsPresent()) {
  tryVercelEnvPull();
  loadLocalEnv();
}
if (!credsPresent()) failMissingCreds();

await proof1();
await proof2();
