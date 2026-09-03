/**
 * A DOC MAY NOT TELL THE OWNER TO SET A VARIABLE THE APPLICATION NEVER READS.
 *
 * ==========================================================================
 * SR-43, AND IT COST TWO DAYS OF FAILED SMS
 * ==========================================================================
 * `docs/cutover-runbook.md` used to instruct setting `TWILIO_SENDER_ID=OsteoJP`
 * in Vercel. The application reads `TWILIO_SMS_FROM`. Followed literally, the
 * approved alphanumeric sender was never used.
 *
 * THE RUNBOOK WAS CORRECTED ONCE, BY HAND, AND THE INSTRUCTION SURVIVED IN FOUR
 * OTHER FILES - including `docs/SPEC.md`, which is the live specification. That
 * is the whole reason this is a test: a prose correction fixes the file
 * somebody happened to open, and nothing compares the rest of the corpus to the
 * code. `QUESTIONS.md` even records the runbook fix as DONE, which is true and
 * was never the whole answer.
 *
 * ==========================================================================
 * IT USES THE SAME THREE-STYLE SCAN, AND THAT IS NOT DECORATION
 * ==========================================================================
 * `env-example-covers-the-code.test.mjs` documents why one style is not enough:
 *
 *   process.env.NAME      the direct read
 *   env.NAME              an injected EnvSource
 *   "NAME" as a constant  e.g. REMINDERS_REPLY_CAPABLE, declared as
 *                         REPLY_CAPABLE_FLAG and read through it
 *
 * A one-style scan here would report `REMINDERS_REPLY_CAPABLE` and
 * `OTP_LIVE_SEND` as unread and fail on documentation that is perfectly
 * correct. Under-reporting and OVER-reporting are the same defect wearing
 * different clothes: a check that looks at the wrong thing.
 *
 * ==========================================================================
 * WHAT IS DELIBERATELY NOT CHECKED
 * ==========================================================================
 * DATED RECORDS ARE LEFT ALONE. A handoff or a closeout is a record of what was
 * believed on a date; rewriting one is a different and worse thing than
 * correcting a live instruction, and the same reasoning `handover-counts` gives
 * about its dated blocks. They are listed by name below, so adding one is a
 * decision somebody makes.
 *
 * Run: pnpm test:scripts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the APPLICATION lives. A read anywhere here counts as "the code reads it". */
const APP_DIRS = ["apps", "packages"];
/** Plus operator tooling, which is real code an operator runs. */
const TOOL_DIRS = ["scripts", "tools"];

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "coverage", "playwright-report", "test-results"]);

/**
 * Records of what was believed on a date. Not corrected, by design.
 * Adding to this list is how you say "this file is history, not instruction".
 */
const DATED_RECORDS = new Set([
  "docs/HANDOFF-2026-06-18.md",
  "docs/session-13-closeout.md",
  // The register of open and answered questions. It QUOTES the wrong
  // instruction in order to record that it was wrong, which is the opposite of
  // repeating it.
  "docs/QUESTIONS.md",
  // Same: it records the correction as a decision.
  "docs/design/DECISIONS.md",
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const rel = join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const DIRECT = /(?:process\.env\.([A-Z][A-Z0-9_]{2,})|process\.env\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]|\benv\.([A-Z][A-Z0-9_]{2,})\b)/g;
const LITERAL = /["']([A-Z][A-Z0-9_]{4,})["']/g;
const PREFIXES = /^(TWILIO|REMINDERS|OTP|INVITES|SUPABASE|SENTRY|RESEND|DATABASE|NEXT_PUBLIC|PORTAL|PATIENT|PLATFORM|AUDIO|IFTHENPAY|FISIOZERO|SEED|M1|A4|SMOKE|SHARP|BASE)_/;

/**
 * TEST FILES DO NOT COUNT AS READING, and this is the one exclusion that had to
 * be discovered rather than designed. `twilio-proof.test.ts` SETS
 * `TWILIO_SENDER_ID` in order to prove the code IGNORES it - so a scan that
 * counted tests would conclude the application reads it and would fall silent
 * on the exact variable this guard exists for. Same filter the sibling
 * `.env.example` scan applies, for the same reason.
 */
const isTestFile = (f) => /\.test\.|\.spec\.|\/tests?\/|e2e\/|__tests__|playwright\.config/.test(f);

/** Every variable the given roots read IN PRODUCTION CODE, by all three styles. */
function namesReadIn(roots) {
  const read = new Set();
  for (const dir of roots) {
    for (const f of walk(dir)) {
      if (!/\.(ts|tsx|mjs|js)$/.test(f)) continue;
      if (isTestFile(f)) continue;
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const m of src.matchAll(DIRECT)) read.add(m[1] ?? m[2] ?? m[3]);
      if (/process\.env|EnvSource|\benv\[|readEnv|getEnv/.test(src)) {
        for (const m of src.matchAll(LITERAL)) if (PREFIXES.test(m[1])) read.add(m[1]);
      }
    }
  }
  return read;
}

/**
 * An imperative instruction to SET a variable, in a doc.
 *
 * NARROW ON PURPOSE. A doc that merely MENTIONS a name - to say it is ignored,
 * or to record that it was once wrong - is not instructing anybody, and
 * flagging it would make the correction itself fail the check. The verbs are
 * what make it an instruction.
 */
const INSTRUCTION = /\b(set|update|updates|add|flip|configure|define)\b[^.\n]{0,80}?`?([A-Z][A-Z0-9_]{4,})`?[^.\n]{0,40}?\b(env|environment|vercel|var|variable)\b/gi;
const INSTRUCTION_ALT = /\b(env var|environment variable)\b[^.\n]{0,40}?`?([A-Z][A-Z0-9_]{4,})`?/gi;

test("no doc instructs setting an env var the application never reads", () => {
  const appReads = namesReadIn(APP_DIRS);
  const toolReads = namesReadIn(TOOL_DIRS);

  const offences = [];
  for (const f of walk("docs")) {
    if (!f.endsWith(".md")) continue;
    if (DATED_RECORDS.has(f.split("\\").join("/"))) continue;
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const line of src.split("\n")) {
      // A line that says the variable is NOT read is a correction, not an
      // instruction. Without this the fix for SR-43 would fail this test.
      if (/never reads|is ignored|not `?[A-Z_]+`?,? which/i.test(line)) continue;
      for (const re of [INSTRUCTION, INSTRUCTION_ALT]) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) {
          const name = m[2];
          if (!PREFIXES.test(name)) continue;
          if (appReads.has(name)) continue;
          offences.push(
            `${f}: instructs setting ${name}, which nothing in apps/ or packages/ reads` +
              (toolReads.has(name) ? ` (only ${TOOL_DIRS.join("/")} reads it)` : ""),
          );
        }
      }
    }
  }

  assert.deepEqual(
    [...new Set(offences)].sort(),
    [],
    "A doc tells an operator to set a variable the application does not read.\n" +
      "Name the variable the code ACTUALLY reads, or say in the same line that this one is ignored.\n  " +
      [...new Set(offences)].sort().join("\n  "),
  );
});

test("the scan is not vacuous - it sees all three read styles in the app", () => {
  // Same guarantee env-example-covers-the-code.test.mjs makes about itself. A
  // scan that matched nothing would pass the test above trivially and would
  // then report every documented variable as unread the day somebody widened
  // the instruction regex.
  const appReads = namesReadIn(APP_DIRS);
  assert.ok(appReads.has("REMINDERS_LIVE_SEND"), "direct process.env read not found");
  assert.ok(appReads.has("OTP_LIVE_SEND"), "injected EnvSource read not found");
  assert.ok(appReads.has("REMINDERS_REPLY_CAPABLE"), "constant-declared read not found");
});

test("TWILIO_SENDER_ID is the instance this exists for, and it is still unread by the app", () => {
  // If the application ever DOES read it, this test says so and the guard above
  // stops having an opinion about it - which is correct, and is a change
  // somebody should have to see.
  const appReads = namesReadIn(APP_DIRS);
  const toolReads = namesReadIn(TOOL_DIRS);
  assert.ok(!appReads.has("TWILIO_SENDER_ID"), "apps/ or packages/ now reads TWILIO_SENDER_ID");
  assert.ok(toolReads.has("TWILIO_SENDER_ID"), "scripts/twilio-smoke.mjs should still read it");
});
