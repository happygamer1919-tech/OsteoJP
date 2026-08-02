#!/usr/bin/env node
// Twilio SMS integration — live smoke proof. RUN LOCALLY ONLY, never in CI.
//
// Usage:
//   node scripts/twilio-smoke.mjs                 # Proof 0 (render-only) + Proof 1 (zero cost)
//   TWILIO_SMOKE_CONFIRM=yes SMOKE_TO_NUMBER=+3519XXXXXXXX \
//     node scripts/twilio-smoke.mjs               # Proof 0 + 1 + Proof 2 (~cents, 1 SMS)
//
// Proof 0 (render-only, zero cost, NO network, NO creds): renders every PT SMS
//   template through the REAL production path with the longest prod clinic name
//   ("Castelo Branco"), prints the multi-line body, and asserts pure GSM-7 /
//   single segment. Always runs first so the copy can be reviewed with no
//   Twilio account and nothing is ever sent. (With no credentials exported the
//   Proof 0 output still prints in full, then the run stops at exit code 1
//   because Proof 1/2 could not be attempted.)
// Proof 1 (zero cost): authenticates against the Twilio REST API (account
//   fetch) and inspects the messaging/sender configuration to show the
//   "OsteoJP" alphanumeric sender registration.
// Proof 2 (one SMS): renders the REAL production 24h appointment-reminder
//   template (apps/web/lib/reminders/templates.ts, imported directly — Node
//   >= 22.18 strips the types natively) with dummy data, sends exactly ONE
//   message to SMOKE_TO_NUMBER, polls to a terminal status, and asserts a
//   single GSM-7 segment.
//
// Credentials come from the operator's shell environment and NOWHERE ELSE.
// The repo working tree is not in the credential path at any level, read or
// write: this script does not read .env.local (or any other file) for a
// credential, never writes a file, never edits .gitignore, and never invokes
// the vercel CLI. If credentials are absent it prints the required variable
// NAMES and exits — it does not go looking for values.
// It NEVER prints TWILIO_AUTH_TOKEN (used solely inside the Authorization
// header). Do not paste credentials into chat, into a repo file, or commit them.
//
// Exit codes: 0 ok · 1 missing/unusable credentials · 2 proof failure.

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

/* ------------------------------------------------------------------ */
/* Credentials — process environment only                              */
/* ------------------------------------------------------------------ */

// There is deliberately no env-FILE loader here. Reading .env.local was removed
// on 2026-08-02 along with the `vercel env pull` fallback that wrote it: a
// credential sitting in the working tree is readable by every process and every
// agent session attached to the repo, and a script that reads one is what makes
// putting it there look reasonable. process.env is the only source.
function credsPresent() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

// Hard exit. Names only — this function never reads, fetches, or writes a
// credential value, and never shells out to another tool to find one.
function failMissingCreds() {
  console.error(`
[env] Twilio credentials are not present in this shell. Proof 1 and Proof 2
cannot run. Nothing was written and nothing was sent.

Required (NAMES only — values are never printed, stored, or fetched by this script):

  TWILIO_ACCOUNT_SID              required
  TWILIO_AUTH_TOKEN               required
  TWILIO_SMS_FROM                 the production sender, e.g. the alphanumeric ID
  TWILIO_MESSAGING_SERVICE_SID    optional; only if sending via a messaging service

Export them in YOUR OWN shell, in this terminal session only:

  export TWILIO_ACCOUNT_SID=...
  export TWILIO_AUTH_TOKEN=...
  export TWILIO_SMS_FROM=...
  node scripts/twilio-smoke.mjs

Values come from the Twilio Console → Account → API keys & tokens.

DO NOT write these values into any file inside this repository (.env.local
included): the working tree is readable by every process and every agent
session attached to it. DO NOT paste them into chat, commits, or CI config.
Exported shell variables die with the terminal session; a file does not.
The export lines above land in your shell history — clear them afterwards, or
read the values in without echo using whatever prompt form your shell provides.
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
/* Proof 0 — render-only preview (zero cost, no network, no creds)      */
/* ------------------------------------------------------------------ */

async function proof0() {
  console.log("\n=== Proof 0: render-only preview (zero cost, no network, no send) ===");

  // REAL production render path — same module the send path imports.
  const templates = await import(
    new URL("../apps/web/lib/reminders/templates.ts", import.meta.url).href
  );

  // Longest prod clinic name is "Castelo Branco" (Montemor-o-Novo stays hidden).
  const ctx = {
    patientFirstName: "(unused in SMS)",
    appointmentDateLong: "(unused in SMS)",
    appointmentDateShort: "23/05",
    appointmentTime: "14:30",
    practitionerName: "(unused in SMS)",
    clinicLocation: "Castelo Branco",
    clinicPhone: "+351 210 000 000",
    rescheduleLink: "(unused in SMS)",
  };
  const followUpCtx = {
    patientFirstName: "(unused in SMS)",
    appointmentDateLong: "(unused in SMS)",
    appointmentDateShort: "23/05",
    clinicPhone: "+351 210 000 000",
  };

  const previews = [
    ["confirmation PT", templates.renderConfirmationSms("pt", ctx)],
    ["reminder 48h PT", templates.renderSms("48h", "pt", ctx)],
    ["reminder 24h PT", templates.renderSms("24h", "pt", ctx)],
    ["no_show PT", templates.renderNoShowSms("pt", ctx)],
    ["follow_up PT", templates.renderFollowUpSms("pt", followUpCtx)],
  ];

  let allOk = true;
  for (const [label, body] of previews) {
    // renderSms already asserted GSM-7 at render; recompute here for the proof.
    const gsm7 = templates.isGsm7(body);
    // GSM-7 single-segment ceiling is 160; above that carriers split at 153.
    const segments = body.length <= 160 ? 1 : Math.ceil(body.length / 153);
    if (!gsm7 || segments !== 1) allOk = false;
    console.log(
      `\n[proof0] ${label} — ${body.length} chars, GSM-7=${gsm7}, ${segments} segment:\n${body}`,
    );
  }

  if (!allOk) {
    console.error("\n[proof0] FAIL — a template is not GSM-7 or exceeds one segment.");
    process.exit(2);
  }
  console.log(
    '\n[proof0] PASS — every PT SMS renders pure GSM-7, 1 segment (longest clinic "Castelo Branco").',
  );
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

// Proof 0 is render-only: no creds, no network, no send. Always first so the
// restyled copy can be reviewed even with no Twilio account configured.
await proof0();

// No env-file read, no fallback, by design. Absent credentials are an operator
// action, not something this script resolves for them: the previous
// `vercel env pull` fallback wrote real credential values into the repo working
// tree, mutated .gitignore during what is documented as a read-only proof, and
// pulled the development scope rather than production, so it never produced
// usable Twilio creds anyway.
if (!credsPresent()) failMissingCreds();

await proof1();
await proof2();
