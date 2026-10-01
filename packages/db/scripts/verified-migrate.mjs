#!/usr/bin/env node
// THE APPLY, WITH ITS OWN VERDICT. Replaces a bare `pnpm db:migrate` in every
// production apply block.
//
// ===========================================================================
// WHY IT EXISTS: `drizzle-kit migrate`'s EXIT CODE AND STDOUT ARE BOTH UNUSABLE
// ===========================================================================
// It prints "[✓] migrations applied successfully!" whether or not it applied
// anything, and it has once exited 1 with NOTHING on stdout or stderr. Five
// occasions in this project, FOUR distinct causes, one unreadable face:
//
//   0038-0041, 0049  a plain `git checkout <branch>` left the apply worktree on
//                    `main`, so the files were not on disk and nothing was
//                    pending. (docs/DECISIONS.md:2215)
//   0058             the files WERE on disk and the checkout WAS right; a
//                    hand-appended journal `when` was LOWER than the previously
//                    applied migration's, so drizzle read it as already applied.
//   2026-08-26       exit 1, silent. (POST-01)
//   SR-58            a stage inheriting a working tree from a previous stage.
//
// The first family and the 0058 family look IDENTICAL from the migrate output
// and have OPPOSITE fixes. That is why this is a program and not a habit.
//
// ===========================================================================
// THE LOAD-BEARING ASSERTION IS THE JOURNAL DELTA
// ===========================================================================
// Count the rows in `drizzle.__drizzle_migrations` before, run drizzle, count
// after. A no-op leaves the delta at 0 and FAILS HERE regardless of which of the
// four causes produced it. Everything else in this file makes the failure
// legible; this is what makes it a failure at all.
//
// ===========================================================================
// SR-58: IT ASSERTS THE FILES ARE ON DISK BEFORE IT INVOKES ANYTHING
// ===========================================================================
// `--tag` must exist at packages/db/migrations/<tag>.sql and its sha256 must
// equal `--sha256`. That is one readFileSync, and it is what makes a wrong
// working tree LOUD instead of silent. Re-checking out the ref makes the tree
// right; this is what proves it.
//
// ===========================================================================
// IT DOES NOT APPLY ANYTHING ITSELF
// ===========================================================================
// It shells out to `drizzle-kit migrate`. A wrapper that reimplemented the
// applier would be a second migration engine that can disagree with the first.
//
// ===========================================================================
// DRIZZLE'S SESSION ASKS FOR TWO TIMEOUTS, AND THE SERVER'S ANSWER IS PRINTED
// ===========================================================================
// Card LOCK-TIMEOUT-verified-migrate: drizzle's connection asks for
// `lock_timeout=10s` and `statement_timeout=300s`, so a migration waiting on a
// lock gives up after ten seconds instead of queueing every query behind it, and
// no statement runs for more than five minutes. The ruling named PGOPTIONS. Two
// facts, read from the installed code on 2026-09-30, decide how it is carried:
//
//   1. drizzle-kit uses postgres.js here (it tries `pg` first, and `pg` is not
//      installed), and postgres.js NEVER READS PGOPTIONS. Its environment reads
//      are PGHOST, PGPORT, PGUSER(NAME), PGDATABASE, PGPASSWORD, PGAPPNAME,
//      PGTARGETSESSIONATTRS and one PG<NAME> per option in its own defaults
//      table, and `options` is not in that table. What it DOES send is every
//      unrecognised URL query parameter, as a startup parameter. So the settings
//      travel as the URL's `options` query parameter, which Postgres reads
//      exactly as libpq's PGOPTIONS. PGOPTIONS is set as well, for a libpq or
//      `pg` client; postgres.js ignores it.
//   2. A POOLER MAY DROP BOTH. Supavisor (Supabase's session pooler) opens its
//      own server connections and forwards only `search_path` from a client's
//      `options`. So whether the two settings are in force on the target is not
//      something this file can know in advance; it ASKS. Its first read goes
//      through the same URL, the same library and the same startup options as
//      drizzle's connection, reads both settings from `pg_settings`, and prints
//      one line: `in force` or `NOT APPLIED`. It does not refuse on NOT APPLIED:
//      that is today's behaviour, and the line is what makes it visible.
//
// A PGOPTIONS already in the environment, or an `options` already in the URL,
// is REFUSED (exit 3) before any connection. Appending would let the earlier
// `-c` and the later one fight over the same setting, last one winning, so the
// session would be neither what the operator set nor what the documents pin.
//
// ===========================================================================
// SAFETY
// ===========================================================================
//   * Every read is inside a READ ONLY transaction, so the server itself
//     refuses any write this file could contain now or later.
//   * It reads `drizzle.__drizzle_migrations` and two server settings from
//     `pg_settings`, and nothing else. It never touches a patient table, so no
//     NIF, phone, email or clinical value can pass through it.
//   * It prints tags, integers, hashes and the two timeout values. It never
//     prints the connection string and never logs an environment value.
//
// USAGE, from the repo root with the prod env sourced:
//   node packages/db/scripts/verified-migrate.mjs \
//        --tag 0082_patient_locale_grant \
//        --sha256 b43423ae... \
//        --expect-pending 1
//
// EXIT CODES, and 5 is the one this file exists for:
//   0  the delta matched, the hash is in the journal, both printed
//   2  bad invocation (missing --tag, --sha256 or --expect-pending)
//   3  a precondition failed: file missing, hash mismatch, pending count wrong,
//      or PGOPTIONS / a URL `options` parameter was already set
//   4  drizzle itself failed - its captured output is reprinted, INCLUDING when
//      it is empty, which is POST-01's whole symptom
//   5  drizzle SUCCEEDED and the journal did not move. THE SILENT NO-OP, NAMED.
//      Today that state is indistinguishable from success and it is the one that
//      has cost the days.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_ROOT = path.join(HERE, "..");
const REPO_ROOT = path.join(DB_ROOT, "..", "..");
const MIGRATIONS = path.join(DB_ROOT, "migrations");

const EXIT = { OK: 0, BAD_INVOCATION: 2, PRECONDITION: 3, DRIZZLE_FAILED: 4, SILENT_NOOP: 5 };

/* ------------------------------------------------------------------ args -- */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) return { error: `unexpected argument "${a}"` };
    const key = a.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return { error: `--${key} needs a value` };
    out[key] = value;
    i += 1;
  }
  return out;
}

export function validateArgs(args) {
  const problems = [];
  if (!args.tag) problems.push("--tag <migration tag, e.g. 0082_patient_locale_grant>");
  if (!args.sha256) problems.push("--sha256 <sha256 of that file>");
  else if (!/^[0-9a-f]{64}$/.test(args.sha256)) problems.push("--sha256 must be 64 lowercase hex characters");
  if (args["expect-pending"] === undefined) problems.push("--expect-pending <integer>");
  else if (!/^\d+$/.test(args["expect-pending"])) problems.push("--expect-pending must be a non-negative integer");
  return problems;
}

/** The delta a run of `expected` pending migrations must produce. Extracted so
 *  the arithmetic is testable without a database. */
export function verdictFor({ before, after, expectedPending, drizzleExit }) {
  if (drizzleExit !== 0) return { code: EXIT.DRIZZLE_FAILED, reason: "drizzle_failed" };
  const delta = after - before;
  if (delta === 0 && expectedPending > 0) return { code: EXIT.SILENT_NOOP, reason: "silent_noop" };
  if (delta !== expectedPending) return { code: EXIT.PRECONDITION, reason: "wrong_delta" };
  return { code: EXIT.OK, reason: "ok" };
}

/* ------------------------------------------------------ session timeouts -- */
/** The two settings the card rules, with the value `pg_settings` reports for
 *  each (both are in milliseconds there). */
export const SESSION_SETTINGS = Object.freeze([
  Object.freeze({ name: "lock_timeout", value: "10s", ms: 10_000 }),
  Object.freeze({ name: "statement_timeout", value: "300s", ms: 300_000 }),
]);

/** "-c lock_timeout=10s -c statement_timeout=300s", the ruling's string. */
export const SESSION_OPTIONS = SESSION_SETTINGS.map((s) => `-c ${s.name}=${s.value}`).join(" ");

/** The URL with the settings added as its `options` query parameter, which
 *  postgres.js sends as a startup parameter. Refuses a URL that already has one.
 *  Only the query is inspected; the host, the user and the password are never
 *  parsed, so nothing about them can be reported or altered. */
export function withSessionOptions(rawUrl) {
  // new URL() trims trailing whitespace and C0 controls; postgres.js would read them as part of
  // the database once a query is appended after them. Trim them, so nothing about the target moves.
  const url = rawUrl.replace(/[\u0000-\u0020]+$/, "");
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : url.slice(hashAt);
  const queryAt = base.indexOf("?");
  const query = queryAt === -1 ? "" : base.slice(queryAt + 1);
  if (new URLSearchParams(query).has("options")) {
    return { error: "the connection URL already carries an `options` parameter" };
  }
  const sep = queryAt === -1 ? "?" : query === "" || query.endsWith("&") ? "" : "&";
  return { url: `${base}${sep}options=${encodeURIComponent(SESSION_OPTIONS)}${fragment}` };
}

/** The environment drizzle-kit is spawned with: the parent's, plus PGOPTIONS,
 *  plus the SAME variable drizzle.config.ts will read (DATABASE_URL_DIRECT,
 *  else DATABASE_URL, the `??` it uses) carrying the options. Returns the URL
 *  this script's own reads use too, so the two connections ask identically. */
export function sessionEnvFor(parentEnv) {
  if ((parentEnv.PGOPTIONS ?? "").trim() !== "") {
    return { error: "PGOPTIONS is already set in this environment" };
  }
  const urlVar = parentEnv.DATABASE_URL_DIRECT !== undefined ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
  const parentUrl = parentEnv[urlVar];
  if (!parentUrl) return { error: "neither DATABASE_URL_DIRECT nor DATABASE_URL is set" };
  const augmented = withSessionOptions(parentUrl);
  if (augmented.error) return { error: augmented.error };
  return {
    urlVar,
    url: augmented.url,
    env: { ...parentEnv, PGOPTIONS: SESSION_OPTIONS, [urlVar]: augmented.url },
  };
}

/** What the server says about the two settings, from `pg_settings` rows
 *  `{ name, setting, unit, shown }`. In force only if BOTH read exactly the
 *  ruled milliseconds; a missing row is not in force. */
export function sessionVerdict(rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  let inForce = true;
  const shown = SESSION_SETTINGS.map((s) => {
    const row = byName.get(s.name);
    if (!row || row.unit !== "ms" || String(row.setting) !== String(s.ms)) inForce = false;
    return `${s.name}=${row ? row.shown : "(absent)"}`;
  }).join(" ");
  return { inForce, shown };
}

/* ------------------------------------------------------------------ main -- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`verified-migrate: ${args.error}`);
    return EXIT.BAD_INVOCATION;
  }
  const problems = validateArgs(args);
  if (problems.length > 0) {
    console.error("verified-migrate: missing or invalid arguments:");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\nusage: node packages/db/scripts/verified-migrate.mjs \\\n" +
        "         --tag <tag> --sha256 <64 hex> --expect-pending <n>",
    );
    return EXIT.BAD_INVOCATION;
  }
  const tag = args.tag;
  const expectedPending = Number(args["expect-pending"]);

  /* -- SR-58. THE FILES ARE ON DISK, AND THEY ARE THE APPROVED ONES. ------ */
  const file = path.join(MIGRATIONS, `${tag}.sql`);
  if (!existsSync(file)) {
    console.error(
      `PRECONDITION FAILED: ${path.relative(REPO_ROOT, file)} is not on disk.\n` +
        "  This is SR-58's whole subject. `drizzle-kit migrate` against a tree without the\n" +
        "  migration REPORTS SUCCESS, because there is nothing to apply. Re-checkout the ref\n" +
        "  (detached, by sha) inside THIS stage and run again.",
    );
    return EXIT.PRECONDITION;
  }
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (actual !== args.sha256) {
    console.error(
      `PRECONDITION FAILED: ${tag}.sql is on disk but is NOT the approved file.\n` +
        `  expected sha256  ${args.sha256}\n` +
        `  on disk          ${actual}\n` +
        "  The tree is at the wrong commit, or the file was edited after approval.",
    );
    return EXIT.PRECONDITION;
  }
  console.log(`file       ${tag}.sql present, sha256 matches`);

  /* -- the journal on disk, and the pending set drizzle will compute. ----- */
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta", "_journal.json"), "utf8"));
  const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);
  if (!entries.some((e) => e.tag === tag)) {
    console.error(
      `PRECONDITION FAILED: "${tag}" is not in meta/_journal.json.\n` +
        "  The .sql file exists and the journal does not list it, so drizzle will not apply it\n" +
        "  and will report success.",
    );
    return EXIT.PRECONDITION;
  }

  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "verified-migrate: neither DATABASE_URL_DIRECT nor DATABASE_URL is set. Source the environment first.",
    );
    return EXIT.BAD_INVOCATION;
  }

  /* -- the two timeouts, asked for on drizzle's connection and on ours. ---- */
  const session = sessionEnvFor(process.env);
  if (session.error) {
    // The reason only. Never the value of PGOPTIONS, never the URL.
    console.error(
      `PRECONDITION FAILED: ${session.error}.\n` +
        "  This script sets the drizzle session's options itself, to exactly\n" +
        `  "${SESSION_OPTIONS}", and will not merge them with settings it did not write.\n` +
        "  Unset it (or take `options` out of the URL) and run again.",
    );
    return EXIT.PRECONDITION;
  }
  console.log(
    `session    ${SESSION_SETTINGS.map((s) => `${s.name}=${s.value}`).join(" ")} requested ` +
      "(URL `options` startup parameter and PGOPTIONS)",
  );
  const { default: postgres } = await import("postgres");

  /** READ ONLY, every time. Through the SAME URL drizzle is handed, so the
   *  settings it reads are the ones drizzle's connection was offered. */
  const read = async () => {
    const sql = postgres(session.url, { prepare: false, max: 1 });
    try {
      return await sql.begin(async (tx) => {
        await tx`set transaction read only`;
        const [{ n }] = await tx`select count(*)::int as n from drizzle.__drizzle_migrations`;
        const last = await tx`select created_at from drizzle.__drizzle_migrations
                               order by created_at desc limit 1`;
        const mine = await tx`select 1 from drizzle.__drizzle_migrations
                               where hash = ${args.sha256} limit 1`;
        const settings = await tx`select name, setting, unit, current_setting(name) as shown
                                   from pg_settings
                                   where name in ('lock_timeout', 'statement_timeout')`;
        return {
          n,
          lastWhen: last[0] ? Number(last[0].created_at) : null,
          present: mine.length > 0,
          settings,
        };
      });
    } finally {
      await sql.end();
    }
  };

  const before = await read();
  const sessionNow = sessionVerdict(before.settings);
  // Two verdict words that do not contain each other, so a grep for one can
  // never match the other.
  console.log(
    sessionNow.inForce
      ? `session    in force: ${sessionNow.shown}`
      : `session    NOT APPLIED: the server reports ${sessionNow.shown}. The connection path ` +
          "dropped the startup options (a pooler does this); drizzle runs without the two timeouts.",
  );
  // drizzle's own predicate, restated so the two cannot disagree about
  // "pending". `created_at` holds the journal `when` (dialect.js:67).
  const pending = entries.filter((e) => before.lastWhen === null || before.lastWhen < e.when);
  console.log(`journal    ${before.n} row(s) applied, last when=${before.lastWhen ?? "(none)"}`);
  console.log(`pending    ${pending.length}  [${pending.map((e) => e.tag).join(", ") || "-"}]`);

  // CHECKED BEFORE THE PENDING COUNT, and the order is load-bearing. Once a
  // migration is applied its journal `when` IS the last applied `when`, so
  // `pending` computes to 0 and the pending branch below fires with the 0058
  // message - telling an operator to fix a journal entry that is correct. Asking
  // "is it already there" first gives a re-run the answer it actually has.
  if (before.present) {
    console.error(
      `\nPRECONDITION FAILED: ${tag}'s sha256 is ALREADY in drizzle.__drizzle_migrations.\n` +
        "  This migration has been applied. Applying it again is not what this command is for,\n" +
        "  and the journal `when` is NOT the problem - do not go and edit it.",
    );
    return EXIT.PRECONDITION;
  }

  if (pending.length !== expectedPending) {
    console.error(
      `\nPRECONDITION FAILED: expected ${expectedPending} pending, found ${pending.length}.`,
    );
    const last = entries[entries.length - 1];
    if (pending.length === 0 && last && before.lastWhen !== null && last.when <= before.lastWhen) {
      console.error(
        `  "${last.tag}" has when=${last.when} and the database's last applied when is ${before.lastWhen}.\n` +
          "  Because it is NOT GREATER, drizzle will treat it as already applied, apply nothing,\n" +
          "  and print success. That is the 0058 cause. Fix the journal `when` and re-run.",
      );
    }
    console.error("  Do NOT run drizzle-kit migrate.");
    return EXIT.PRECONDITION;
  }
  /* -- run the real applier, capture EVERYTHING, print it either way. ----- */
  console.log("\n--- drizzle-kit migrate ---");
  const run = spawnSync(
    "pnpm",
    ["--filter", "@osteojp/db", "exec", "drizzle-kit", "migrate"],
    { cwd: REPO_ROOT, encoding: "utf8", env: session.env },
  );
  const out = (run.stdout ?? "").trim();
  const err = (run.stderr ?? "").trim();
  // PRINTED EVEN ON SUCCESS, and the "(nothing)" is the point: POST-01's whole
  // symptom is a run with no output, and a wrapper that only printed on failure
  // would reproduce the silence it exists to end.
  console.log(`stdout: ${out || "(nothing)"}`);
  console.log(`stderr: ${err || "(nothing)"}`);
  console.log(`exit:   ${run.status}`);
  console.log("--- end drizzle-kit migrate ---\n");

  const after = await read();
  console.log(`journal    ${before.n} -> ${after.n}  (delta ${after.n - before.n})`);
  console.log(`${tag} present by sha256: ${after.present ? "yes" : "NO"}`);

  const verdict = verdictFor({
    before: before.n,
    after: after.n,
    expectedPending,
    drizzleExit: run.status,
  });

  if (verdict.reason === "drizzle_failed") {
    console.error(
      `FAIL: drizzle-kit migrate exited ${run.status}.` +
        (out || err ? "" : "\n  IT PRINTED NOTHING. That is POST-01. First things to try, in order:\n" +
          "    the SESSION pooler on 5432 rather than the transaction pooler on 6543 (advisory locks),\n" +
          "    drizzle.config.ts's DATABASE_URL_DIRECT fallback,\n" +
          "    running drizzle-kit directly rather than through `pnpm --filter exec`, which swallows\n" +
          "    output on some failure paths.") +
        (sessionNow.inForce
          ? `\n  THE TWO TIMEOUTS WERE IN FORCE (${sessionNow.shown}). A migration that waited 10 s for a\n` +
            "    lock, or ran one statement longer than 300 s, was CANCELLED by the server, and drizzle's one\n" +
            "    transaction rolled back: the journal delta below says whether anything moved. The server log\n" +
            "    names it (`canceling statement due to lock timeout` / `statement timeout`); drizzle may not."
          : ""),
    );
    return verdict.code;
  }
  if (verdict.reason === "silent_noop") {
    console.error(
      "FAIL: drizzle reported SUCCESS and the journal did not move.\n" +
        "  THIS IS THE SILENT NO-OP. Nothing was applied. The four known causes:\n" +
        "    the working tree is not on the ref you think (SR-58) - but the file check above passed,\n" +
        "      so if you are here it is probably not this one;\n" +
        "    the journal `when` is not strictly greater than the last applied (0058);\n" +
        "    the migration is already applied under a different hash;\n" +
        "    drizzle is pointed at a different database than this script.",
    );
    return verdict.code;
  }
  if (verdict.reason === "wrong_delta") {
    console.error(
      `FAIL: the journal moved by ${after.n - before.n}, expected ${expectedPending}.\n` +
        "  MORE than expected means something else applied migrations during this run.\n" +
        "  FEWER means part of the pending set did not land. Neither is safe to continue from.",
    );
    return verdict.code;
  }
  if (!after.present) {
    console.error(
      `FAIL: the journal moved by ${expectedPending} but ${tag}'s sha256 is NOT in it.\n` +
        "  Something applied, and it was not the approved file.",
    );
    return EXIT.PRECONDITION;
  }

  console.log("OK: the journal moved by exactly the pending count and carries the approved sha256.");
  return EXIT.OK;
}

// Importable for tests; runs only when invoked directly.
if (process.argv[1] && process.argv[1].endsWith("verified-migrate.mjs")) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`verified-migrate: ${e?.message ?? e}`);
      process.exit(EXIT.DRIZZLE_FAILED);
    });
}

export { EXIT };
