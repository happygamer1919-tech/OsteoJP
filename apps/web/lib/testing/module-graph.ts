import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * SKEW-01 - THE MODULE GRAPH THE SOURCE GUARDS WALK. Test support only: no
 * application module imports this file.
 *
 * Shared by lib/actions/call-sites.test.ts (every server-action call on
 * /agenda goes through runAction) and lib/timers/visible-interval.test.ts
 * (every periodic timer on /agenda pauses while the tab is hidden), so both
 * guards read /agenda's code the same way: comments stripped, imports resolved
 * and read rather than guessed from a path.
 */

/** apps/web */
export const APP = resolve(__dirname, "..", "..");
/** The repository root, for @osteojp/* workspace packages. */
const REPO = resolve(APP, "..", "..");

/**
 * A small lexer: blanks comments, and (with `blankStrings`) the TEXT of string
 * and template literals, keeping line breaks so line numbers stay true.
 * Template `${...}` expressions stay visible: code inside them is still code.
 * Regex literals are not modelled; the scanned files hold none containing a
 * quote or `//`, and call-sites.test.ts's self-tests would redden if that
 * assumption produced a wrong line.
 */
function lex(src: string, blankStrings: boolean): string {
  let out = "";
  let i = 0;
  // Each frame is the context we are in; a "code" frame inside a template
  // tracks its own brace depth so the closing `}` of `${` is found.
  const stack: Array<{ kind: "code" | "template"; depth: number }> = [{ kind: "code", depth: 0 }];
  const keep = (c: string) => (blankStrings && c !== "\n" ? " " : c);
  while (i < src.length) {
    const top = stack[stack.length - 1]!;
    const c = src[i]!;
    const next = src[i + 1];
    if (top.kind === "template") {
      if (c === "\\") {
        out += keep(c) + keep(next ?? "");
        i += 2;
      } else if (c === "`") {
        out += c;
        stack.pop();
        i += 1;
      } else if (c === "$" && next === "{") {
        out += "${";
        stack.push({ kind: "code", depth: 0 });
        i += 2;
      } else {
        out += keep(c);
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      out += c;
      i += 1;
      while (i < src.length && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") {
          out += keep(src[i]!) + keep(src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += keep(src[i]!);
        i += 1;
      }
      if (i < src.length) {
        out += src[i];
        i += 1;
      }
      continue;
    }
    if (c === "`") {
      out += c;
      stack.push({ kind: "template", depth: 0 });
      i += 1;
      continue;
    }
    if (stack.length > 1 && c === "{") top.depth += 1;
    if (stack.length > 1 && c === "}") {
      if (top.depth === 0) {
        out += c;
        stack.pop();
        i += 1;
        continue;
      }
      top.depth -= 1;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Comments blanked, strings kept: for reading directives and import specifiers. */
export function stripComments(src: string): string {
  return lex(src, false);
}

/** Comments AND literal text blanked: for finding where a name is USED. */
export function codeOnly(src: string): string {
  return lex(src, true);
}

const read = (path: string) => stripComments(readFileSync(path, "utf8"));

function firstFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Resolves a relative or `@/` specifier (and, with `packages`, an @osteojp/*
 * workspace package through its index). Anything else is outside the graph.
 */
export function resolveModule(fromFile: string, spec: string, options: { packages?: boolean } = {}): string | null {
  if (spec.startsWith("@/")) return firstFile(join(APP, spec.slice(2)));
  if (spec.startsWith(".")) return firstFile(resolve(dirname(fromFile), spec));
  if (options.packages) {
    const m = /^@osteojp\/([\w-]+)(\/.*)?$/.exec(spec);
    if (m) return firstFile(join(REPO, "packages", m[1]!, m[2] ? m[2].slice(1) : "index"));
  }
  return null;
}

function hasDirective(path: string, directive: "use server" | "use client"): boolean {
  return new RegExp(`^["']${directive}["']`).test(read(path).trimStart());
}

/** True when the module's first statement is the "use server" directive. */
export function isUseServerModule(path: string): boolean {
  return hasDirective(path, "use server");
}

/** True when the module's first statement is the "use client" directive. */
export function isUseClientModule(path: string): boolean {
  return hasDirective(path, "use client");
}

const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** The modules `file` imports, resolved. */
function importsOf(file: string, options: { packages?: boolean }): string[] {
  const out: string[] = [];
  for (const m of read(file).matchAll(SPECIFIER_RE)) {
    const target = resolveModule(file, m[1]!, options);
    if (target) out.push(target);
  }
  return out;
}

/**
 * Every module reachable from `entries` through relative and `@/` imports
 * (and @osteojp/* packages with `packages`). `stopAt` modules are included but
 * not walked through.
 */
export function reachableFrom(
  entries: string[],
  options: { packages?: boolean; stopAt?: (file: string) => boolean } = {},
): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (options.stopAt?.(file)) continue;
    for (const target of importsOf(file, options)) if (!seen.has(target)) queue.push(target);
  }
  return seen;
}

export const AGENDA_ENTRIES = ["page.tsx", "layout.tsx", "error.tsx", "loading.tsx"].map((f) =>
  join(APP, "app/agenda", f),
);

/**
 * The modules /agenda runs IN THE BROWSER: every "use client" module the
 * route reaches, and everything those import (workspace packages included).
 * A "use server" module is a boundary: the browser holds only a reference to
 * its functions, never their code.
 */
export function agendaClientModules(): Set<string> {
  const stopAtServer = { stopAt: (f: string) => isUseServerModule(f) };
  const route = reachableFrom(AGENDA_ENTRIES, { packages: true, ...stopAtServer });
  const clientRoots = [...route].filter((f) => isUseClientModule(f));
  const client = reachableFrom(clientRoots, { packages: true, ...stopAtServer });
  for (const f of [...client]) if (isUseServerModule(f)) client.delete(f);
  return client;
}

// ==========================================================================
// WHICH IMPORTED NAMES ARE SERVER ACTIONS
// ==========================================================================

const DEFAULT_EXPORT_RE = /\bexport\s+default\b/;
const DECLARED_EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const LIST_EXPORT_RE = /\bexport\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/g;
const STAR_EXPORT_RE = /\bexport\s+\*\s+from\s*["']([^"']+)["']/g;

function splitList(list: string): Array<{ imported: string; local: string; type: boolean }> {
  const out: Array<{ imported: string; local: string; type: boolean }> = [];
  for (const raw of list.split(",")) {
    let part = raw.trim();
    if (!part) continue;
    const type = part.startsWith("type ");
    if (type) part = part.slice(5).trim();
    const [imported, alias] = part.split(/\s+as\s+/);
    out.push({ imported: imported!.trim(), local: (alias ?? imported!).trim(), type });
  }
  return out;
}

const actionExportCache = new Map<string, Set<string>>();

/**
 * The names under which `file` exports a server action ("default" included):
 * every value export of a "use server" module, and every name another module
 * re-exports from one (`export { a } from`, `export * from`, or an import
 * that is then exported). Empty for a module that exports no action.
 */
export function actionExportsOf(file: string, visiting: Set<string> = new Set()): Set<string> {
  const cached = actionExportCache.get(file);
  if (cached) return cached;
  if (visiting.has(file)) return new Set();
  visiting.add(file);
  const code = read(file);
  const names = new Set<string>();
  if (isUseServerModule(file)) {
    if (DEFAULT_EXPORT_RE.test(code)) names.add("default");
    for (const m of code.matchAll(DECLARED_EXPORT_RE)) names.add(m[1]!);
    for (const m of code.matchAll(LIST_EXPORT_RE)) {
      if (m[1] || m[3]) continue;
      for (const p of splitList(m[2]!)) if (!p.type) names.add(p.local);
    }
  } else {
    const importedActions = actionImports(file, code, visiting).names;
    for (const m of code.matchAll(LIST_EXPORT_RE)) {
      if (m[1]) continue;
      const from = m[3] ? resolveModule(file, m[3]) : null;
      const sourceExports = from ? actionExportsOf(from, visiting) : null;
      for (const p of splitList(m[2]!)) {
        if (p.type) continue;
        if (sourceExports ? sourceExports.has(p.imported) : importedActions.includes(p.imported)) names.add(p.local);
      }
    }
    for (const m of code.matchAll(STAR_EXPORT_RE)) {
      const from = resolveModule(file, m[1]!);
      if (!from) continue;
      for (const n of actionExportsOf(from, visiting)) if (n !== "default") names.add(n);
    }
  }
  visiting.delete(file);
  actionExportCache.set(file, names);
  return names;
}

export type ActionImports = {
  /** Local names bound to a server action. */
  names: string[];
  /** [start, end) of each import statement that brought one in. */
  spans: Array<[number, number]>;
  /** Namespace (`* as x`) and dynamic (`import()`) imports of a module that exports an action. */
  namespaceImports: string[];
};

const STATIC_IMPORT_RE =
  /import\s+(type\s+)?(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([A-Za-z_$][\w$]*))?\s*from\s*["']([^"']+)["']\s*;?/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * The local names `file` binds to server actions: named, aliased, default and
 * mixed imports, from a "use server" module directly or through a module that
 * re-exports one. `code` has its comments stripped.
 */
export function actionImports(file: string, code: string, visiting: Set<string> = new Set()): ActionImports {
  const names: string[] = [];
  const spans: Array<[number, number]> = [];
  const namespaceImports: string[] = [];
  for (const m of code.matchAll(STATIC_IMPORT_RE)) {
    const [whole, typeOnly, def, list, ns, spec] = m;
    if (!def && list === undefined && !ns) continue; // a side-effect import
    const target = resolveModule(file, spec!);
    if (!target) continue;
    const exports = actionExportsOf(target, visiting);
    if (exports.size === 0) continue;
    spans.push([m.index!, m.index! + whole.length]);
    if (typeOnly) continue; // import type { ... }
    if (def && exports.has("default")) names.push(def);
    if (list !== undefined) {
      for (const p of splitList(list)) if (!p.type && exports.has(p.imported)) names.push(p.local);
    }
    if (ns) namespaceImports.push(ns);
  }
  for (const m of code.matchAll(DYNAMIC_IMPORT_RE)) {
    const target = resolveModule(file, m[1]!);
    if (target && actionExportsOf(target, visiting).size > 0) namespaceImports.push(`import("${m[1]}")`);
  }
  return { names, spans, namespaceImports };
}
