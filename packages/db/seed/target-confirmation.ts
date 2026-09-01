/**
 * POSITIVE CONFIRMATION OF A CONFIGURATION-SEED TARGET.
 *
 * ==========================================================================
 * WHAT THIS REPLACES, QUOTED SO THE DIFFERENCE IS NOT A MATTER OF OPINION
 * ==========================================================================
 * `seed/form-templates.ts` and `seed/roles.ts` are the two CLIs the owner runs
 * against PRODUCTION on purpose - the v5 form-template catalogue and the
 * permission-role set. Until this module, their entire target check was:
 *
 *     const databaseUrl = process.env.DATABASE_URL;
 *     if (!databaseUrl) throw new Error("DATABASE_URL is required");
 *     const client = postgres(databaseUrl, { max: 1, prepare: false });
 *
 * That predicate is `DATABASE_URL is SET`. It is satisfied by every string,
 * including the one a previous command happened to export half an hour ago.
 * `DECISIONS.md:702` records that the owner runs `seed:form-templates` on
 * production "under the authorization phrase"; grepping either file for
 * `phrase|confirm|AUTORIZO|authoriz` returns ZERO hits. The phrase lives in a
 * runbook and in a habit. The code has never asked for anything.
 *
 * ==========================================================================
 * WHY THERE IS NO "IS THIS PRODUCTION?" BRANCH, AND WHY THAT IS THE POINT
 * ==========================================================================
 * The obvious shape is the one `scripts/import/copy-attachments.mjs` uses:
 * classify the target, and demand a phrase only when the answer is
 * "production". That classification is `isProdSupabaseUrl` - a BLOCKLIST - and
 * SR-08 rules against building a decision out of what is ABSENT from a list.
 * This repository has three recorded instances of that failing open, all of
 * them written down in `local-target.ts`: an empty `PROD_REFS`, a load-test
 * seeder guarding the RETIRED project ref, and an `assert-not-prod.ts` that
 * printed a proof it did not have.
 *
 * A blocklist's answer for an unrecognised host is "not production", so a
 * brand-new production project is unguarded on the day it is created. The
 * failure is silent: the seed runs and reports success.
 *
 * So this module never asks what KIND of target it is. It asks whether the
 * OPERATOR HAS AFFIRMED THIS SPECIFIC HOST, and it asks on every target
 * without exception - local, staging, branch, production, and the host nobody
 * has heard of. There is no case that falls through to "allowed", because
 * there is no classification to fall through.
 *
 * ==========================================================================
 * THE CONFIRMATION NAMES THE HOST, AND THAT IS THE WHOLE MECHANISM
 * ==========================================================================
 * A fixed phrase - `IMPORT FISIOZERO INTO PRODUCTION`, the one CLAUDE.md
 * ratifies for the import lane - proves the operator INTENDED a production
 * run. It cannot prove they intended THIS database, because the same keystrokes
 * authorise every target equally. The failure being closed here is not "ran a
 * seed by accident"; it is "ran the right seed against the wrong target",
 * which a target-independent phrase does not touch.
 *
 * The required line therefore carries the parsed host:
 *
 *     SEED CONFIG INTO db.example.supabase.co
 *
 * A line typed for a local run does not authorise a production run, and the
 * host the operator types is the host printed on the line above the prompt.
 *
 * AND THE STRING IS PRINTED BEFORE THE PROMPT, DELIBERATELY, WHICH IS THE
 * OPPOSITE OF WHAT copy-attachments.mjs DOES. That module withholds its phrase
 * because printing it "turns a refusal into a copy-paste prompt". Correct
 * there: its phrase is ratified in CLAUDE.md, so the operator already knows it
 * and printing it adds nothing but a shortcut. Here the required line is
 * DERIVED FROM THE TARGET and cannot be known in advance, so withholding it
 * makes the gate unsatisfiable rather than strict. What is withheld is the
 * reprint AFTER a mismatch - see `confirmSeedTarget`.
 *
 * The secrecy was never the mechanism in either case. The mechanism is that
 * the operator must read the host to complete the line, and a stale shell is
 * visible at exactly the moment the decision is taken.
 *
 * ==========================================================================
 * A PROMPT, NOT AN ENVIRONMENT VARIABLE
 * ==========================================================================
 * `SEED_DEV_CONFIRM` (seed-guard.ts, gate 3) is an env var, and that is right
 * for the seven dev seeds: they are re-run in a loop and a typed prompt on each
 * would be trained away within a day. These two are hand-run, rarely, one at a
 * time. An env var would be one more thing a shell can hold from an hour ago,
 * which is the exact failure mode this card exists to close, so the
 * confirmation is read from stdin and cannot be pre-armed.
 *
 * NON-INTERACTIVE STDIN IS A REFUSAL. A pipe is not a person, and neither is a
 * CI runner. Nothing in `.github/workflows` invokes either CLI today (checked,
 * not assumed) so this breaks no automation; if something ever needs to, it
 * needs a decision, not a fallback.
 *
 * NEVER PRINTS THE CONNECTION STRING. Standing rule 3. A host, a verdict, and
 * the line to type; never the URL, which carries a password.
 */

import { createInterface } from "node:readline";
import { parseTargetHost } from "./local-target";

/**
 * The fixed half of the required line. The variable half is the host.
 *
 * Exported so the tests assert against the constant rather than a transcription
 * of it - a test that hard-codes the words passes after somebody edits them.
 */
export const CONFIRM_PREFIX = "SEED CONFIG INTO" as const;

/** The exact line the operator must type for a given host. */
export function confirmationLineFor(host: string): string {
  return `${CONFIRM_PREFIX} ${host}`;
}

/**
 * A SECOND, INDEPENDENT READING OF THE HOST - AND THE GATE REFUSES WHEN THE
 * TWO DISAGREE.
 *
 * ==========================================================================
 * WHY, AND IT IS A DEFECT FOUND BY THIS CARD'S OWN TEST RATHER THAN A THEORY
 * ==========================================================================
 * `local-target.ts` documents its parsing as: "`new URL()` handles every
 * well-formed case ... It THROWS on a password holding an unescaped `@` or
 * `/`, which real passwords do." The `@` half is true. THE `/` HALF IS NOT.
 * `new URL()` does not throw on a `/` in the password; it takes the first `/`
 * as the start of the path, which leaves a truncated authority, and returns a
 * HOST THAT IS NOT THE TARGET. Measured on Node 22:
 *
 *   postgresql://postgres.abc:p@ss/w0rd@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
 *     -> new URL().hostname === "ss"
 *
 * The fallback parser never runs, because it is reached only when `new URL()`
 * throws. So `parseTargetHost` returns "ss" and never learns it is wrong.
 *
 * FOR `assertLocalTarget` THAT MISPARSE FAILS CLOSED - "ss" is not an allowed
 * local host, so the dev seeds refuse - which is why it has never been seen.
 * FOR THIS GATE IT WOULD NOT. This gate does not classify the host; it PRINTS
 * it and asks the operator to type it back. A wrong host here produces a
 * confirmation that is syntactically perfect and names a database that is not
 * the one about to be written to - the operator affirms "ss" and the write
 * lands on the pooler. That is precisely the §1.3 shape: an unknown case
 * rendered as a known-looking one, and the screen reports something reasonable.
 *
 * THE FIX IS NOT TO PATCH `parseTargetHost` FROM HERE. It is a shipped guard
 * with seven other callers whose behaviour is not this card's to change, and
 * the misparse is fail-CLOSED for every one of them. It is carded separately.
 * What this module does instead is refuse to name a host it cannot read twice
 * the same way.
 *
 * THE SECOND READING splits on the LAST `@` FIRST and only then cuts at the
 * first `/`, which is the opposite order to the WHATWG parser. On the string
 * above it reads `aws-0-eu-west-2.pooler.supabase.com`. The two disagree, and
 * DISAGREEMENT IS A REFUSAL, never a vote: neither reading is authoritative,
 * and picking one would be choosing which of two possible databases to write
 * to. The operator's remedy is to percent-encode the password (`%2F`), after
 * which both parsers agree and the gate proceeds.
 *
 * It is not symmetric-proof either, and that is fine: a DBNAME containing `@`
 * makes the second reading wrong and the first right. It also disagrees, and
 * is also refused. A gate that refuses both ambiguous shapes is correct; a
 * gate that resolves them is guessing.
 */
export function readHostByLastAt(url: string): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  const scheme = url.indexOf("://");
  if (scheme === -1) return null;

  // Query and fragment first: neither can precede the authority, and both can
  // contain `@` and `/`.
  const rest = url.slice(scheme + 3).split("?")[0]!.split("#")[0]!;
  if (rest === "") return null;

  const at = rest.lastIndexOf("@");
  const afterUserinfo = at === -1 ? rest : rest.slice(at + 1);
  const hostPort = afterUserinfo.split("/")[0] ?? "";
  if (hostPort === "") return null;

  const v6 = hostPort.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1]!.toLowerCase();

  const host = hostPort.split(":")[0] ?? "";
  return host === "" ? null : host.toLowerCase();
}

export type SeedTargetVerdict = {
  /** True ONLY when the operator typed the exact line. Never a default. */
  confirmed: boolean;
  /** The parsed host, or null when none could be parsed. Never the URL. */
  host: string | null;
  /** Operator-facing, safe to print: never contains the connection string. */
  reason: string;
};

/** How a confirmation line is read. Injectable so both arms are testable. */
export type ConfirmationReader = () => Promise<string>;

/**
 * Read one line from stdin.
 *
 * The prompt goes to STDERR so stdout stays a clean, pasteable transcript - the
 * same split `copy-attachments.mjs` uses, and the reason the rehearsal evidence
 * files in `docs/import/evidence/` are readable at all.
 */
export async function readConfirmationFromStdin(
  input: NodeJS.ReadableStream = process.stdin,
): Promise<string> {
  const rl = createInterface({ input });
  try {
    for await (const line of rl) return String(line).trim();
    return "";
  } finally {
    rl.close();
  }
}

export type ConfirmSeedTargetOptions = {
  /** The connection string. NEVER printed. */
  url: string | undefined | null;
  /** Which variable holds it, so an operator with several knows which is wrong. */
  what?: string;
  /** Script name for the log prefix, e.g. "seed:form-templates". */
  script: string;
  /** Injected for tests. Defaults to a real stdin read. */
  readConfirmation?: ConfirmationReader;
  /** Injected for tests. Defaults to `process.stdin.isTTY`. */
  interactive?: boolean;
  log?: (msg: string) => void;
  err?: (msg: string) => void;
};

/**
 * Decide whether this run may write, BEFORE a client is opened.
 *
 * Returns a verdict; it does NOT exit. `confirmSeedTargetOrExit` is the
 * process-level wrapper, and the split is what lets both arms be tested without
 * a subprocess.
 *
 * FOUR WAYS TO FAIL AND THEY ARE FOUR DISTINCT REASONS, not one null. §1.3 of
 * PORTAL-REHYDRATE is about exactly this: an unparseable URL, an unset URL, a
 * non-interactive stdin and a mistyped line are different facts, and collapsing
 * them into one "refused" would hide which one an operator hit.
 */
export async function confirmSeedTarget(
  opts: ConfirmSeedTargetOptions,
): Promise<SeedTargetVerdict> {
  const {
    url,
    what = "DATABASE_URL",
    script,
    readConfirmation = () => readConfirmationFromStdin(),
    interactive = Boolean(process.stdin.isTTY),
    log = console.log,
    err = console.error,
  } = opts;

  if (url === undefined || url === null || url === "") {
    return { confirmed: false, host: null, reason: `${what} is not set` };
  }

  const host = parseTargetHost(url);
  if (host === null) {
    // NOT "probably fine". A connection string this module cannot parse is a
    // target it cannot name, and a target it cannot name is one the operator
    // cannot be asked to confirm.
    return {
      confirmed: false,
      host: null,
      reason: `no host could be parsed from ${what}`,
    };
  }

  // The cross-check. See readHostByLastAt: a disagreement means the string has
  // two defensible readings and the gate will not choose one for the operator.
  const second = readHostByLastAt(url);
  if (second !== host) {
    return {
      confirmed: false,
      host: null,
      reason:
        `${what} has two possible hosts depending on how it is parsed, so the ` +
        "target cannot be named; percent-encode any '/' or '@' in the password",
    };
  }

  const expected = confirmationLineFor(host);

  log(`[${script}] TARGET HOST: ${host}`);
  log(`[${script}] This will WRITE configuration rows to that database.`);

  if (!interactive) {
    return {
      confirmed: false,
      host,
      reason:
        "stdin is not interactive, so no operator can confirm this target; " +
        "a pipe is not a person",
    };
  }

  err(
    `\nType the following line exactly, then press Enter:\n` +
      `  ${expected}\n` +
      `(Not stored, not exported, not readable from a shell variable.)\n> `,
  );

  const typed = await readConfirmation();
  if (typed !== expected) {
    // The expected line is NOT reprinted here. It was printed once, above the
    // prompt, where reading it is the point; reprinting it after a mismatch
    // turns a refusal into a retry prompt.
    return {
      confirmed: false,
      host,
      reason: "the confirmation line did not match the target host",
    };
  }

  return { confirmed: true, host, reason: `operator confirmed host "${host}"` };
}

/**
 * `confirmSeedTarget`, with the process exit attached. Never returns on refusal.
 *
 * EXIT 2, NOT 1. CLAUDE.md's ratified table: `0` OK, `1` FAILED, `2`
 * BAD_INVOCATION. An unconfirmed target is a wrong invocation - nothing was
 * attempted and nothing failed - and keeping `1` meaning "the seed ran and went
 * wrong" is what lets an operator read an exit code without reading the log.
 */
export async function confirmSeedTargetOrExit(
  opts: ConfirmSeedTargetOptions,
): Promise<string> {
  const verdict = await confirmSeedTarget(opts);
  if (verdict.confirmed) {
    (opts.log ?? console.log)(`[${opts.script}] confirmation accepted.`);
    return opts.url as string;
  }

  const err = opts.err ?? console.error;
  err(`\n[${opts.script}] REFUSED - ${verdict.reason}.`);
  err(`[${opts.script}] Nothing was written. No connection was opened.`);
  process.exit(2);
}
