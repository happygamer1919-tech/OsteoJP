/**
 * The bare-node target guard, and the seeding/load-test scripts that must carry
 * it. Runs in `pnpm test:scripts`, which is in the REQUIRED CI job.
 *
 * SR-08. Every refusal case is also driven through the predicate this guard
 * REPLACED, so the suite proves the old one said yes. A test that only shows
 * the new guard refusing cannot tell you the old guard did not.
 *
 * THE LAST TEST SPAWNS THE REAL SCRIPT. Unit-testing the helper proves the
 * helper; it does not prove `perf-seed-loadtest.mjs` calls it. That script's
 * entire history is a guard that was present, documented and wrong, so the
 * check that matters is running the file and reading its exit code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describeTarget, parseTargetHost, readAllowedLocalHosts } from "./local-target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SEEDER = join(HERE, "perf-seed-loadtest.mjs");

const LIVE = "dfotoodqvmjhbdcxyaxf";
/** Shape-accurate, 20 chars, NOT on the blocklist: the next project provisioned. */
const UNLISTED = "zzzzyyyyxxxxwwwwvvvv";
const prodUrl = (ref) =>
  `postgresql://postgres.${ref}:redacted@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The predicate this guard replaced — `perf-seed-loadtest.mjs:23` as it stood. */
const oldGuardAllows = (url) => !url.includes("jaxmkwoxjcgzkwxgbayx");

test("the allowlist is read from the TypeScript source, not copied", () => {
  const hosts = readAllowedLocalHosts();
  assert.ok(hosts.includes("127.0.0.1"), "127.0.0.1 must be allowed");
  assert.ok(hosts.length >= 2);
  const src = readFileSync(join(ROOT, "packages/db/seed/local-target.ts"), "utf8");
  for (const h of hosts) assert.ok(src.includes(h), `${h} must come from local-target.ts`);
});

test("an unreadable allowlist THROWS rather than returning nothing", () => {
  assert.throws(() => readAllowedLocalHosts(join(ROOT, "does-not-exist.ts")), /unreadable/);
});

test("parseTargetHost splits on the LAST @, so a password is never read as a host", () => {
  assert.equal(parseTargetHost("postgresql://user:p@ss@prod.example.com:5432/db"), "prod.example.com");
  assert.equal(parseTargetHost(LOCAL), "127.0.0.1");
  assert.equal(parseTargetHost("postgresql://u:p@[::1]:5432/db"), "::1");
  assert.equal(parseTargetHost("garbage"), null);
});

test("THE OLD GUARD ALLOWED THE LIVE CLINIC. This one refuses it.", () => {
  const url = prodUrl(LIVE);
  assert.equal(oldGuardAllows(url), true, "the old predicate must be shown to allow it");
  assert.equal(describeTarget(url).local, false);
});

test("an UNLISTED production-shaped ref is refused; no blocklist can see it", () => {
  const url = prodUrl(UNLISTED);
  assert.equal(oldGuardAllows(url), true);
  assert.equal(describeTarget(url).local, false);
});

test("a host that merely BEGINS with a local address is refused", () => {
  const url = "postgresql://u:p@127.0.0.1.attacker.example.com:5432/db";
  assert.equal(url.includes("127.0.0.1"), true, "the careless allowlist must be shown to allow it");
  assert.equal(describeTarget(url).local, false);
});

test("an unparseable or absent target is refused, never defaulted to allowed", () => {
  for (const v of ["garbage", "", undefined, null]) {
    assert.equal(describeTarget(v).local, false, `${String(v)} must be refused`);
  }
});

test("a local target is accepted", () => {
  assert.equal(describeTarget(LOCAL).local, true);
});

/**
 * THE ONE THAT WOULD HAVE CAUGHT PERF-08. Runs the real file.
 */
test("perf-seed-loadtest.mjs ABORTS on a production-shaped DATABASE_URL", () => {
  let code = 0;
  let stderr = "";
  try {
    execFileSync(process.execPath, [SEEDER], {
      env: { ...process.env, DATABASE_URL: prodUrl(LIVE), DATABASE_URL_DIRECT: "" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (e) {
    code = e.status ?? -1;
    stderr = String(e.stderr ?? "");
  }
  assert.equal(code, 1, "the seeder must exit 1 on a production-shaped target");
  assert.match(stderr, /not one of the allowed local targets/);
  // The refusal names the host and NEVER the connection string. Standing rule 3.
  assert.ok(!stderr.includes("redacted@"), "the refusal must not echo the connection string");
});

test("perf-seed-loadtest.mjs ABORTS on an UNLISTED production-shaped ref too", () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [SEEDER], {
      env: { ...process.env, DATABASE_URL: prodUrl(UNLISTED), DATABASE_URL_DIRECT: "" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (e) {
    code = e.status ?? -1;
  }
  assert.equal(code, 1);
});

test("perf-seed-loadtest.mjs ABORTS when no target is set at all", () => {
  let code = 0;
  try {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_DIRECT;
    execFileSync(process.execPath, [SEEDER], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (e) {
    code = e.status ?? -1;
  }
  assert.equal(code, 1, "an empty environment is a refusal, not a pass");
});

/**
 * EVERY seeding and load-test script is covered, and the list is DERIVED so a
 * new one cannot be added without either wiring the guard or failing here.
 */
test("every seeding and load-test script under scripts/ carries the guard", () => {
  const candidates = readdirSync(HERE)
    .filter((f) => /(seed|loadtest|load-test)/i.test(f))
    .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));
  assert.ok(candidates.length > 0, "the scan is not vacuous");
  for (const f of candidates) {
    const src = readFileSync(join(HERE, f), "utf8");
    assert.match(src, /assertLocalTarget\(/, `${f} must call assertLocalTarget`);
  }
});
