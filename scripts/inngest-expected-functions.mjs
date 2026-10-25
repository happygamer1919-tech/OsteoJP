#!/usr/bin/env node
// HOW MANY FUNCTIONS THE osteojp-reminders APP SHOULD REGISTER, READ FROM THE CODE.
//
// R6 (strategy, 2026-10-25): after every production deploy of osteojp-platform,
// .github/workflows/inngest-auto-sync.yml syncs the app and then checks the
// deployment against "the count expected from code". This script is that count.
// It reads the source at the checked-out commit, so the number follows the code
// and is never a constant somebody forgets to move.
//
// WHAT IT READS, and why each step can fail loudly rather than guess:
//   1. apps/web/app/api/inngest/route.ts must hand `servedFunctions` to serve().
//      If the route serves some other list, counting servedFunctions would count
//      the wrong thing, so that is a failure, not a warning.
//   2. apps/web/lib/reminders/inngest/served.ts: the array literal assigned to
//      `export const servedFunctions`. Each entry is an identifier or a spread.
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
//   node scripts/inngest-expected-functions.mjs           # prints the count
//   node scripts/inngest-expected-functions.mjs --list    # one function per line
// Exit codes: 0 counted, 1 could not count (reason on stderr).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/web/app/api/inngest/route.ts";
const SERVED = "apps/web/lib/reminders/inngest/served.ts";
const LIST = "servedFunctions";

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

/** The functions the reminders app serves, each checked to be a createFunction. */
export function expectedFunctions(root = DEFAULT_ROOT) {
  const route = stripComments(read(root, ROUTE));
  if (!/serve\(\s*\{[^}]*\bfunctions\s*:\s*servedFunctions\b/.test(route)) {
    throw new CountError(`${ROUTE} does not pass "functions: ${LIST}" to serve(), so ${LIST} is not what it registers`);
  }
  const list = expand(root, SERVED, LIST, new Set());
  if (list.length === 0) throw new CountError(`${SERVED}: ${LIST} is empty`);
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

export function main(argv = process.argv.slice(2), { root = DEFAULT_ROOT, log = console.log, err = console.error } = {}) {
  try {
    const list = expectedFunctions(root);
    if (argv.includes("--list")) for (const { id, module } of list) log(`${id}  ${module}`);
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
