#!/usr/bin/env node
// HOW MANY FUNCTIONS AN INNGEST APP SHOULD REGISTER, READ FROM THE CODE.
//
// Two apps, and only these two, are synced by every production deploy:
// osteojp-reminders (R6, the default) and osteojp-consultation (R27, strategy,
// 2026-10-30: `--app osteojp-consultation`). Each is one serve route and one
// array the route hands to serve(); APPS below names both.
//
// R6 (strategy, 2026-10-25): after every production deploy of osteojp-platform,
// .github/workflows/inngest-auto-sync.yml syncs the app and then checks the
// deployment against "the count expected from code". This script is that count.
// It reads the source at the checked-out commit, so the number follows the code
// and is never a constant somebody forgets to move.
//
// WHAT IT READS, and why each step can fail loudly rather than guess:
//   1. The app's serve route must hand its list to serve() (`functions:
//      servedFunctions` for the reminders, `functions` for the consultation app),
//      and must import that list from the module APPS names. If the route serves
//      some other list, counting it would count the wrong thing, so that is a
//      failure, not a warning.
//   2. That module's array literal (`export const servedFunctions = [ ... ]` in
//      apps/web/lib/reminders/inngest/served.ts, `export const functions = [ ... ]`
//      in apps/web/lib/consultation/inngest/functions.ts). Each entry is an
//      identifier or a spread.
//   3. A spread `...name` is followed to the module that `name` is imported
//      from, and that module's `export const name = [ ... ]` is read the same way.
//   4. Every identifier left at the end must be declared in its module as
//      `export const <id> = inngest.createFunction(`. An entry that is not a
//      function definition would make the count wrong, so it fails.
//
// It is a reader of this repository's own shapes, not a TypeScript parser. Any
// shape it does not recognise is an exit 1 with the reason, so a refactor that
// outgrows it reddens the workflow instead of producing a wrong number.
//
// Usage:
//   node scripts/inngest-expected-functions.mjs           # the reminders app's count
//   node scripts/inngest-expected-functions.mjs --list    # one function per line
//   node scripts/inngest-expected-functions.mjs --app osteojp-consultation [--list]
// Any other argument, or an app not in APPS, is refused (exit 1): a typo must not
// quietly count the default app.
// Exit codes: 0 counted, 1 could not count (reason on stderr).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The apps the auto-sync workflow syncs: its serve route, and the list that route serves. */
export const APPS = Object.freeze({
  "osteojp-reminders": Object.freeze({
    route: "apps/web/app/api/inngest/route.ts",
    list: "servedFunctions",
    module: "apps/web/lib/reminders/inngest/served.ts",
  }),
  "osteojp-consultation": Object.freeze({
    route: "apps/web/app/api/inngest/consultation/route.ts",
    list: "functions",
    module: "apps/web/lib/consultation/inngest/functions.ts",
  }),
});
export const DEFAULT_APP = "osteojp-reminders";

class CountError extends Error {}

function read(root, rel) {
  const p = join(root, rel);
  if (!existsSync(p)) throw new CountError(`${rel} does not exist`);
  return readFileSync(p, "utf8");
}

/** Comments out, so a commented-out entry or import is not counted. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The entries of `export const <name> = [ ... ];` in `src`, trimmed, empties dropped. */
export function arrayEntries(src, name) {
  const re = new RegExp(`export\\s+const\\s+${name}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`, "g");
  const found = [...stripComments(src).matchAll(re)];
  if (found.length !== 1) return null;
  return found[0][1].split(",").map((s) => s.trim()).filter(Boolean);
}

/** The module path `name` is imported from, as written in the import. */
function importSource(src, name) {
  for (const m of stripComments(src).matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop());
    if (names.includes(name)) return m[2];
  }
  return null;
}

/** "@/x" is apps/web/x (apps/web/tsconfig.json); "./x" is relative to the importer. */
function resolveModule(root, fromRel, spec) {
  let base;
  if (spec.startsWith("@/")) base = join("apps/web", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromRel), spec);
  else throw new CountError(`${fromRel}: import "${spec}" is not a repository path this reader follows`);
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(join(root, base + ext))) return base + ext;
  }
  throw new CountError(`${fromRel}: cannot find the module "${spec}"`);
}

function expand(root, rel, name, seen) {
  const key = `${rel}#${name}`;
  if (seen.has(key)) throw new CountError(`${key} spreads itself`);
  seen.add(key);
  const src = read(root, rel);
  const entries = arrayEntries(src, name);
  if (!entries) throw new CountError(`${rel}: expected exactly one "export const ${name} = [ ... ]"`);
  const out = [];
  for (const e of entries) {
    if (e.startsWith("...")) {
      const inner = e.slice(3).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(inner)) throw new CountError(`${rel}: cannot follow the spread "${e}"`);
      const spec = importSource(src, inner);
      const target = spec ? resolveModule(root, rel, spec) : rel;
      out.push(...expand(root, target, inner, seen));
    } else if (/^[A-Za-z_$][\w$]*$/.test(e)) {
      const spec = importSource(src, e);
      out.push({ id: e, module: spec ? resolveModule(root, rel, spec) : rel });
    } else {
      throw new CountError(`${rel}: "${e}" is neither an identifier nor a spread`);
    }
  }
  return out;
}

/** The functions an app serves, each checked to be a createFunction. */
export function expectedFunctions(root = DEFAULT_ROOT, app = DEFAULT_APP) {
  const spec = Object.hasOwn(APPS, app) ? APPS[app] : null;
  if (!spec) throw new CountError(`unknown app "${app}"; known: ${Object.keys(APPS).join(", ")}`);
  const { route: ROUTE, list: LIST, module: SERVED } = spec;
  const route = stripComments(read(root, ROUTE));
  // `functions: <list>`, or the shorthand `functions,` when the list is itself named `functions`.
  const passes = new RegExp(
    `serve\\(\\s*\\{[^}]*\\bfunctions\\s*${LIST === "functions" ? "(?::\\s*functions\\s*)?[,}]" : `:\\s*${LIST}\\b`}`,
  );
  if (!passes.test(route)) {
    throw new CountError(`${ROUTE} does not pass "functions: ${LIST}" to serve(), so ${LIST} is not what it registers`);
  }
  const list = expand(root, SERVED, LIST, new Set());
  if (list.length === 0) throw new CountError(`${SERVED}: ${LIST} is empty`);
  const from = importSource(route, LIST);
  if (!from || resolveModule(root, ROUTE, from) !== SERVED) {
    throw new CountError(`${ROUTE} does not import ${LIST} from ${SERVED}`);
  }
  const ids = new Set();
  for (const { id, module } of list) {
    if (ids.has(id)) throw new CountError(`${id} is listed twice`);
    ids.add(id);
    const src = stripComments(read(root, module));
    const decl = new RegExp(`export\\s+const\\s+${id}\\s*=\\s*inngest\\.createFunction\\(`);
    if (!decl.test(src)) throw new CountError(`${module}: ${id} is not declared as "export const ${id} = inngest.createFunction("`);
  }
  return list;
}

/** `--list` and `--app <id>`, nothing else. */
function parseArgs(argv) {
  let app = DEFAULT_APP;
  let list = false;
  let sawApp = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--list") list = true;
    else if (argv[i] === "--app" && !sawApp && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      app = argv[++i];
      sawApp = true;
    } else throw new CountError(`argument not understood: "${argv[i]}" (usage: [--app <id>] [--list])`);
  }
  return { app, list };
}

export function main(argv = process.argv.slice(2), { root = DEFAULT_ROOT, log = console.log, err = console.error } = {}) {
  try {
    const args = parseArgs(argv);
    const list = expectedFunctions(root, args.app);
    if (args.list) for (const { id, module } of list) log(`${id}  ${module}`);
    else log(String(list.length));
    return 0;
  } catch (e) {
    err(`inngest-expected-functions: ${e instanceof CountError ? e.message : e}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
