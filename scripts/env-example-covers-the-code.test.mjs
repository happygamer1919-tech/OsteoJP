/**
 * `.env.example` must name every variable PRODUCTION code reads.
 *
 * ==========================================================================
 * WHY A TEST AND NOT A ONE-OFF SWEEP
 * ==========================================================================
 * ENV-01 was opened because this file named 27 variables while the code read
 * 65. It was fixed once before by hand and drifted again, and it will drift
 * again the next time a feature lands with a flag - silently, because nothing
 * anywhere compares the two. This is the comparison.
 *
 * ==========================================================================
 * THREE READ STYLES, AND TWO OF THEM DEFEAT THE OBVIOUS GREP
 * ==========================================================================
 *   process.env.NAME      the direct read
 *   env.NAME              an INJECTED EnvSource. OTP_LIVE_SEND is read this way
 *                         (apps/api/lib/auth/otp-transport.ts), which is exactly
 *                         why ENV-01's own card recorded it as invisible.
 *   "NAME" as a constant  REMINDERS_REPLY_CAPABLE is declared as
 *                         REPLY_CAPABLE_FLAG (reply-capability.ts:56) and read
 *                         through it, so it defeats BOTH of the above.
 *
 * A scan that reads only the first style reports a smaller, comfortable number.
 * The card said 30 and a dispatch said 5; the answer with all three styles was
 * 44. Under-reporting here is the §1.3 shape: a check that returns something
 * plausible while looking at the wrong thing.
 *
 * ==========================================================================
 * IT PROVES ITSELF NON-VACUOUS
 * ==========================================================================
 * A scan that matched nothing would pass this test trivially, so the last case
 * asserts the scan still finds the three variables named above - one per read
 * style. If the extractor stops matching, that case reddens instead of the
 * suite going quietly green.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "coverage", "playwright-report", "test-results"]);
/** Provided by the platform or the runtime, never by this file. */
const AMBIENT = new Set(["NODE_ENV", "CI", "PATH", "HOME", "PWD", "TZ", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION", "PORT", "NEXT_RUNTIME", "GITHUB_ACTIONS"]);
/** Named in the file's closing section, deliberately without a line to fill in. */
const DOCUMENTED_AS_EXCLUDED = new Set(["A4_DISABLE_LOCK", "PORTAL_BASE_URL"]);

const isTestFile = (f) => /\.test\.|\.spec\.|\/tests?\/|e2e\/|__tests__|playwright\.config/.test(f);

function sourceFiles() {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
    }
  })(ROOT);
  return out;
}

const DIRECT = /(?:process\.env\.([A-Z][A-Z0-9_]{2,})|process\.env\[\s*["']([A-Z][A-Z0-9_]{2,})["']\s*\]|\benv\.([A-Z][A-Z0-9_]{2,})\b)/g;
const LITERAL = /["']([A-Z][A-Z0-9_]{4,})["']/g;
const PREFIXES = /^(TWILIO|REMINDERS|OTP|INVITES|SUPABASE|SENTRY|RESEND|DATABASE|NEXT_PUBLIC|PORTAL|PATIENT|PLATFORM|AUDIO|IFTHENPAY|FISIOZERO|SEED|M1|A4|SMOKE|SHARP|BASE)_/;

function scan() {
  const read = new Map();
  const add = (n, f) => {
    if (AMBIENT.has(n)) return;
    if (!read.has(n)) read.set(n, new Set());
    read.get(n).add(f.slice(ROOT.length + 1));
  };
  for (const f of sourceFiles()) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(DIRECT)) add(m[1] ?? m[2] ?? m[3], f);
    if (/process\.env|EnvSource|\benv\[|readEnv|getEnv/.test(src)) {
      for (const m of src.matchAll(LITERAL)) if (PREFIXES.test(m[1])) add(m[1], f);
    }
  }
  return read;
}

const documented = new Set(
  readFileSync(join(ROOT, ".env.example"), "utf8")
    .split("\n").map((l) => l.match(/^#?\s*([A-Z][A-Z0-9_]{2,})=/)).filter(Boolean).map((m) => m[1]),
);

test(".env.example names every variable production code reads", () => {
  const read = scan();
  const missing = [...read.entries()]
    .filter(([n, files]) => !documented.has(n) && !DOCUMENTED_AS_EXCLUDED.has(n))
    .filter(([, files]) => ![...files].every(isTestFile))
    .map(([n, files]) => `${n}  (${[...files].filter((f) => !isTestFile(f))[0] ?? [...files][0]})`)
    .sort();
  assert.deepEqual(
    missing, [],
    "These variables are read by production code and are not in .env.example.\n" +
      "Add each one with a comment saying what it gates, NAME ONLY and never a value:\n  " +
      missing.join("\n  "),
  );
});

test("the scan is not vacuous - it still finds one variable of each read style", () => {
  const read = scan();
  // process.env.NAME
  assert.ok(read.has("REMINDERS_LIVE_SEND"), "direct process.env read not found");
  // env.NAME, through an injected EnvSource
  assert.ok(read.has("OTP_LIVE_SEND"), "injected EnvSource read not found - see otp-transport.ts");
  // "NAME" held in a constant
  assert.ok(read.has("REMINDERS_REPLY_CAPABLE"), "indirect constant read not found - see reply-capability.ts");
  assert.ok(read.size > 50, `expected the scan to find many variables, found ${read.size}`);
});

test("the excluded names are named in the file, so the omission is visible", () => {
  const src = readFileSync(join(ROOT, ".env.example"), "utf8");
  for (const n of DOCUMENTED_AS_EXCLUDED) {
    assert.ok(src.includes(n), `${n} is excluded by this test but not mentioned in .env.example`);
  }
});
