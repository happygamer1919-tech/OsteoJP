// verified-migrate's drizzle session asks for the two timeouts the card rules,
// proven WITHOUT A DATABASE. Card LOCK-TIMEOUT-verified-migrate.
//
// ===========================================================================
// WHAT THIS FILE PROVES, AND WHAT IT CANNOT
// ===========================================================================
// It proves, with no connection opened:
//   * the environment drizzle-kit is spawned with carries
//     "-c lock_timeout=10s -c statement_timeout=300s", in PGOPTIONS and as the
//     connection URL's `options` query parameter, in the variable
//     drizzle.config.ts reads;
//   * the driver drizzle-kit resolves from its own install is postgres.js (not
//     `pg`), that postgres.js ignores PGOPTIONS, and that it DOES put the URL's
//     `options` into the startup parameters it would send;
//   * a PGOPTIONS or a URL `options` that was already there is refused, exit 3,
//     before any connection, and the refusal prints neither value.
// It cannot prove that the SERVER applies them: that needs a database, and was
// run on a local throwaway Postgres (see the PR). Nor can it prove that a
// pooler forwards them. verified-migrate reads both settings back from the
// target on its first read and prints `in force` or `NOT APPLIED`, and that
// line, at a sitting, is the only proof for the production path.
//
// This file is NEW, not an edit to scripts/verified-migrate.test.mjs, which is
// pinned in .github/gate-manifest.json. Adding a guard file is allowed by
// scripts/assert-gates-unchanged.mjs; it is frozen at the next GATE-CHANGE.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(REPO, "packages/db/scripts/verified-migrate.mjs");
const src = fs.readFileSync(SRC, "utf8");

const { SESSION_OPTIONS, SESSION_SETTINGS, withSessionOptions, sessionEnvFor, sessionVerdict, EXIT } =
  await import(SRC);

// Hosts that cannot resolve (RFC 2606), never a real one.
const DIRECT = "postgresql://someone.example:not-a-password@direct.invalid:5432/postgres";
const POOLED = "postgresql://someone.example:not-a-password@pooled.invalid:6543/postgres";

/** How postgres.js reads a URL's query (src/index.js parseUrl): WHATWG
 *  URLSearchParams, so `%20` decodes to a space. */
const optionsOf = (url) => new URL(url).searchParams.get("options");

test("the settings are exactly the ruling's two, in the ruling's string", () => {
  assert.equal(SESSION_OPTIONS, "-c lock_timeout=10s -c statement_timeout=300s");
  assert.deepEqual(
    SESSION_SETTINGS.map((s) => [s.name, s.ms]),
    [["lock_timeout", 10_000], ["statement_timeout", 300_000]],
  );
});

test("the spawn env carries both settings, in PGOPTIONS and in the URL drizzle reads", () => {
  const parent = { HOME: "/home/x", PATH: "/bin", DATABASE_URL_DIRECT: DIRECT, DATABASE_URL: POOLED };
  const frozen = JSON.stringify(parent);
  const s = sessionEnvFor(parent);
  assert.equal(s.error, undefined);
  assert.equal(s.urlVar, "DATABASE_URL_DIRECT", "drizzle.config.ts reads DATABASE_URL_DIRECT first");
  assert.equal(s.env.PGOPTIONS, "-c lock_timeout=10s -c statement_timeout=300s");
  assert.equal(optionsOf(s.env.DATABASE_URL_DIRECT), "-c lock_timeout=10s -c statement_timeout=300s");
  assert.equal(s.url, s.env.DATABASE_URL_DIRECT, "the script's own reads use the same URL as drizzle");
  // Everything else passes through untouched, and the parent is not mutated.
  assert.equal(s.env.DATABASE_URL, POOLED);
  assert.equal(s.env.HOME, "/home/x");
  assert.equal(s.env.PATH, "/bin");
  assert.equal(JSON.stringify(parent), frozen);
  // The host, the user, the password and the database are the parent's.
  const a = new URL(s.env.DATABASE_URL_DIRECT);
  const b = new URL(DIRECT);
  for (const k of ["protocol", "username", "password", "hostname", "port", "pathname"]) {
    assert.equal(a[k], b[k], `${k} changed`);
  }
});

test("with only DATABASE_URL set, that is the variable that carries them", () => {
  const s = sessionEnvFor({ DATABASE_URL: POOLED });
  assert.equal(s.urlVar, "DATABASE_URL");
  assert.equal(optionsOf(s.env.DATABASE_URL), SESSION_OPTIONS);
  assert.ok(!("DATABASE_URL_DIRECT" in s.env), "it must not introduce a variable drizzle would then prefer");
});

test("an existing query string is kept and the options are appended to it", () => {
  const r = withSessionOptions(`${DIRECT}?sslmode=require`);
  const u = new URL(r.url);
  assert.equal(u.searchParams.get("sslmode"), "require");
  assert.equal(u.searchParams.get("options"), SESSION_OPTIONS);
  assert.equal(new URL(withSessionOptions(`${DIRECT}?`).url).searchParams.get("options"), SESSION_OPTIONS);
  assert.equal(new URL(withSessionOptions(`${DIRECT}?a=1&`).url).searchParams.get("options"), SESSION_OPTIONS);
});

test("a PGOPTIONS already in the environment is REFUSED, not merged", () => {
  const s = sessionEnvFor({ DATABASE_URL_DIRECT: DIRECT, PGOPTIONS: "-c lock_timeout=0" });
  assert.match(s.error, /PGOPTIONS is already set/);
  assert.equal(s.env, undefined);
  // The error names the variable, never its value.
  assert.ok(!s.error.includes("lock_timeout=0"));
  // An empty one is no setting at all.
  assert.equal(sessionEnvFor({ DATABASE_URL_DIRECT: DIRECT, PGOPTIONS: "" }).error, undefined);
  assert.equal(sessionEnvFor({ DATABASE_URL_DIRECT: DIRECT, PGOPTIONS: "  " }).error, undefined);
});

test("an `options` already in the URL is REFUSED, not merged", () => {
  const s = sessionEnvFor({ DATABASE_URL_DIRECT: `${DIRECT}?options=-c%20lock_timeout%3D0` });
  assert.match(s.error, /already carries an `options` parameter/);
  assert.equal(s.env, undefined);
  assert.ok(!s.error.includes("direct.invalid") && !s.error.includes("not-a-password"));
});

// The driver premise, from drizzle-kit's OWN install location, because that is
// where its `await import("pg")` / `await import("postgres")` resolve from.
const DB_REQUIRE = createRequire(path.join(REPO, "packages/db/package.json"));
// Its "exports" hide bin.cjs, so find the package root from its main entry.
const KIT_BIN = path.join(path.dirname(DB_REQUIRE.resolve("drizzle-kit")), "bin.cjs");
const KIT_REQUIRE = createRequire(KIT_BIN);

test("drizzle-kit resolves postgres.js and not pg, so postgres.js is the driver it uses", () => {
  // bin.cjs tries `pg` FIRST. If this fails, someone installed `pg`, drizzle-kit
  // has switched drivers, and every finding in the card must be re-read.
  assert.throws(() => KIT_REQUIRE.resolve("pg"), /Cannot find module/);
  assert.ok(KIT_REQUIRE.resolve("postgres"));
  const bin = fs.readFileSync(KIT_BIN, "utf8");
  assert.ok(bin.indexOf('checkPackage("pg")') < bin.indexOf('checkPackage("postgres")'));
});

test("postgres.js ignores PGOPTIONS and sends the URL's `options` as a startup parameter", async () => {
  const { default: postgres } = await import(pathToFileURL(KIT_REQUIRE.resolve("postgres")).href);
  const had = process.env.PGOPTIONS;
  process.env.PGOPTIONS = SESSION_OPTIONS;
  try {
    // No query is issued, so no socket is opened; `.options` is the parsed config.
    const plain = postgres(DIRECT, { max: 1 });
    assert.equal(plain.options.connection.options, undefined, "postgres.js now reads PGOPTIONS; re-read the card");
    await plain.end();

    const s = sessionEnvFor({ DATABASE_URL_DIRECT: DIRECT });
    const carried = postgres(s.env.DATABASE_URL_DIRECT, { max: 1 });
    assert.equal(carried.options.connection.options, SESSION_OPTIONS);
    await carried.end();
  } finally {
    if (had === undefined) delete process.env.PGOPTIONS;
    else process.env.PGOPTIONS = had;
  }
});

test("the server's answer: in force only when BOTH read the ruled milliseconds", () => {
  const row = (name, setting, shown, unit = "ms") => ({ name, setting, unit, shown });
  const ok = sessionVerdict([row("lock_timeout", "10000", "10s"), row("statement_timeout", "300000", "5min")]);
  assert.deepEqual(ok, { inForce: true, shown: "lock_timeout=10s statement_timeout=5min" });

  // What a pooler that dropped the startup options leaves: the defaults.
  const dropped = sessionVerdict([row("lock_timeout", "0", "0"), row("statement_timeout", "0", "0")]);
  assert.deepEqual(dropped, { inForce: false, shown: "lock_timeout=0 statement_timeout=0" });

  // One of two is not in force.
  assert.equal(sessionVerdict([row("lock_timeout", "10000", "10s"), row("statement_timeout", "0", "0")]).inForce, false);
  // A missing row is not in force, and says so.
  const absent = sessionVerdict([row("lock_timeout", "10000", "10s")]);
  assert.equal(absent.inForce, false);
  assert.match(absent.shown, /statement_timeout=\(absent\)/);
  // A unit other than ms is not in force, even with the right number.
  assert.equal(
    sessionVerdict([row("lock_timeout", "10000", "10s", "s"), row("statement_timeout", "300000", "5min")]).inForce,
    false,
  );
  // An empty answer is not a pass.
  assert.equal(sessionVerdict([]).inForce, false);
});

test("the two verdict words cannot match each other in a grep", () => {
  const inForce = src.match(/`session {4}in force: /);
  const notApplied = src.match(/`session {4}NOT APPLIED: [^`]*`\s*\+\s*"([^"]*)"/);
  assert.ok(inForce, "the in-force line is gone");
  assert.ok(notApplied, "the NOT APPLIED line is gone");
  assert.ok(!/in force/i.test(notApplied[0]), "the NOT APPLIED line contains `in force`");
});

test("the spawn is handed the session env, and the reads use the session URL", () => {
  const spawn = src.slice(src.indexOf("const run = spawnSync("));
  const call = spawn.slice(0, spawn.indexOf(");") + 2);
  assert.match(call, /"drizzle-kit",\s*"migrate"/);
  assert.match(call, /env: session\.env/, "drizzle-kit is spawned without the session env");
  assert.match(src, /postgres\(session\.url,/, "the script's reads no longer use drizzle's URL");
  assert.ok(!/postgres\(url,/.test(src), "a read still uses the bare URL");
  // The refusal comes before the first connection.
  assert.ok(src.indexOf("sessionEnvFor(process.env)") < src.indexOf("const before = await read()"));
  assert.ok(src.indexOf("sessionEnvFor(process.env)") < src.indexOf('await import("postgres")'));
});

test("nothing from the environment is interpolated into a printed line", () => {
  // It prints tags, integers, hashes and the two timeout values. Never a URL.
  assert.ok(!/\$\{\s*(url|session\.url|parentUrl|augmented\.url|process\.env[^}]*)\s*\}/.test(src));
  assert.ok(!/console\.(log|error)\([^;]*process\.env/.test(src));
});

// ---------------------------------------------------------------------------
// The refusal, run for real: a child process, an unresolvable host, and exit 3
// BEFORE any connection. The tag and sha256 are the newest migration on disk,
// so the SR-58 file check passes and the run reaches the session check.
// ---------------------------------------------------------------------------
const journal = JSON.parse(fs.readFileSync(path.join(REPO, "packages/db/migrations/meta/_journal.json"), "utf8"));
const newest = [...journal.entries].sort((a, b) => a.idx - b.idx).at(-1).tag;
const newestSha = createHash("sha256")
  .update(fs.readFileSync(path.join(REPO, "packages/db/migrations", `${newest}.sql`)))
  .digest("hex");

function runWrapper(extraEnv) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...extraEnv };
  return spawnSync(process.execPath, [SRC, "--tag", newest, "--sha256", newestSha, "--expect-pending", "1"], {
    cwd: REPO,
    encoding: "utf8",
    env,
    timeout: 20_000,
  });
}

test("run for real: a PGOPTIONS in the environment stops it at exit 3, value unprinted", () => {
  const r = runWrapper({ DATABASE_URL_DIRECT: DIRECT, PGOPTIONS: "-c lock_timeout=12345s" });
  assert.equal(r.status, EXIT.PRECONDITION, r.stderr);
  assert.match(r.stderr, /PRECONDITION FAILED: PGOPTIONS is already set/);
  const printed = r.stdout + r.stderr;
  assert.ok(!printed.includes("12345s"), "the refusal printed PGOPTIONS' value");
  assert.ok(!printed.includes("direct.invalid") && !printed.includes("not-a-password"), "it printed the URL");
  // It stopped before connecting: no journal line, no drizzle banner.
  assert.ok(!r.stdout.includes("journal ") && !r.stdout.includes("--- drizzle-kit migrate ---"));
});

test("run for real: an `options` in the URL stops it at exit 3, URL unprinted", () => {
  const r = runWrapper({ DATABASE_URL: `${POOLED}?options=-c%20lock_timeout%3D12345s` });
  assert.equal(r.status, EXIT.PRECONDITION, r.stderr);
  assert.match(r.stderr, /already carries an `options` parameter/);
  const printed = r.stdout + r.stderr;
  assert.ok(!printed.includes("12345s") && !printed.includes("pooled.invalid") && !printed.includes("not-a-password"));
  assert.ok(!r.stdout.includes("journal "));
});
