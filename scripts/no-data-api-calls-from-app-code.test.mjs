/**
 * The platform reads and writes the database only through its own server
 * (Drizzle over DATABASE_URL, packages/db). Supabase's Data API (the REST and
 * GraphQL endpoints the supabase-js client calls with `.from("table")`,
 * `.rpc(...)` and `.schema(...)`) is not used by any app, package or script.
 * Supabase-js is used for sign-in and for Storage only, and Storage
 * (`.storage.from(bucket)`) is a separate API.
 *
 * This check keeps it that way: it fails, naming the file and line, the day
 * application code starts calling the Data API, so that a dependency on it is
 * a decision and not an accident (batch item 13).
 *
 * WHAT IS SCANNED: every tracked .ts, .tsx, .js, .mjs and .cjs file under
 * apps/, packages/, osteojp-mailbox/, tools/ and scripts/.
 * WHAT IS NOT: Playwright specs and other tests (the e2e suites seed their
 * local stacks through the local Data API on purpose; production is never
 * their target), and this file.
 *
 * WHAT COUNTS AS A CALL, matched on the source with line breaks inside a
 * call chain folded away:
 *   - `.from("...")` with a quoted name, unless the receiver is a built-in
 *     (Buffer, Array, Uint8Array, Object, Set, Map, Iterator) or the chain
 *     goes through `.storage`;
 *   - `.from(...)` straight after a client factory call
 *     (`createXxxClient(...).from(`) without `.storage`;
 *   - `.rpc(` and `.schema(` on anything;
 *   - a `/rest/v1` or `/graphql/v1` path in a string;
 *   - an import of `@supabase/postgrest-js` or a `PostgrestClient`;
 *   - a realtime subscription to table changes (`postgres_changes`).
 * KNOWN LIMIT: `.from(TABLE)` on a client held in a variable, with the name
 * in a constant, is not told apart from a Storage bucket or a Drizzle table
 * here. The arms below pin what is caught.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const SCANNED = ["apps/", "packages/", "osteojp-mailbox/", "tools/", "scripts/"];
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const NOT_APP_CODE = [/(^|\/)e2e\//, /(^|\/)tests?\//, /(^|\/)__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)node_modules\//];
const BUILT_IN = /(^|[^\w$.])(Buffer|Array|Uint8Array|Object|Set|Map|Iterator)$/;

/**
 * Folds `\n   .method(` into `.method(` so a call chain reads as one line, and
 * maps an index in the folded text back to a line of the original.
 */
function fold(text) {
  // No leading [ \t]* here: on a long run of spaces it backtracks once per
  // starting position (quadratic). Spaces left before the folded dot are
  // harmless: a receiver read backwards stops at them.
  const joint = /\n\s*\./g;
  // Each piece: where it starts in the folded text and in the original.
  const pieces = [{ at: 0, from: 0 }];
  let folded = "";
  let last = 0;
  for (const m of text.matchAll(joint)) {
    folded += text.slice(last, m.index) + ".";
    last = m.index + m[0].length;
    pieces.push({ at: folded.length, from: last });
  }
  folded += text.slice(last);
  const newlines = [];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) newlines.push(i);
  const lineOf = (index) => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].at <= index) lo = mid;
      else hi = mid - 1;
    }
    const original = pieces[lo].from + (index - pieces[lo].at);
    let a = 0;
    let b = newlines.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      if (newlines[mid] < original) a = mid + 1;
      else b = mid;
    }
    return a + 1;
  };
  return { folded, lineOf };
}

/** The calls found in one file's text, each as { line, what }. */
export function dataApiCalls(text) {
  const found = [];
  const { folded, lineOf } = fold(text);

  // The receiver of a call: the chain of names, dots and brackets just before
  // it, read backwards (at most 200 characters, so a long line costs little).
  const receiverBefore = (index) => {
    let i = index;
    while (i > 0 && index - i < 200 && /[\w$.()[\]?!"'`]/.test(folded[i - 1])) i -= 1;
    return folded.slice(i, index);
  };
  for (const m of folded.matchAll(/\.from\(\s*["'`]/g)) {
    const chain = receiverBefore(m.index);
    if (/(^|\.)storage(\.|$)/.test(chain) || /\.storage\b/.test(chain)) continue;
    if (BUILT_IN.test(chain) || /^(Buffer|Array|Uint8Array|Object|Set|Map|Iterator)$/.test(chain)) continue;
    // m.index + 1: the name after the dot, on the line the call is written.
    found.push({ line: lineOf(m.index + 1), what: ".from() with a quoted table name" });
  }
  // A client factory's result used straight away: createXxxClient(...)<chain>.from(
  // The parentheses are balanced by hand (no nested quantifier), over at most
  // 400 characters.
  for (const m of folded.matchAll(/create\w*Client\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    const stop = Math.min(folded.length, i + 400);
    let chain = "";
    while (i < stop && depth > 0) {
      if (folded[i] === "(") depth += 1;
      else if (folded[i] === ")") depth -= 1;
      i += 1;
    }
    while (i < stop) {
      const step = /^\.(\w+)/.exec(folded.slice(i, i + 64));
      if (!step) break;
      if (step[1] === "from" && folded[i + step[0].length] === "(") {
        if (!/\.storage\b/.test(chain)) found.push({ line: lineOf(m.index), what: ".from() on a client factory's result" });
        break;
      }
      chain += step[0];
      i += step[0].length;
      if (folded[i] === "(") {
        let d = 0;
        do {
          if (folded[i] === "(") d += 1;
          else if (folded[i] === ")") d -= 1;
          i += 1;
        } while (i < stop && d > 0);
      }
    }
  }
  for (const m of folded.matchAll(/\.(rpc|schema)\(/g)) {
    found.push({ line: lineOf(m.index + 1), what: `.${m[1]}()` });
  }
  for (const m of text.matchAll(/["'`][^"'`\n]*\/(rest|graphql)\/v1\b/g)) {
    found.push({ line: text.slice(0, m.index).split("\n").length, what: `a /${m[1]}/v1 path` });
  }
  for (const m of text.matchAll(/@supabase\/postgrest-js|\bPostgrestClient\b/g)) {
    found.push({ line: text.slice(0, m.index).split("\n").length, what: "the PostgREST client" });
  }
  for (const m of text.matchAll(/postgres_changes/g)) {
    found.push({ line: text.slice(0, m.index).split("\n").length, what: "a realtime table subscription" });
  }
  return found;
}

/**
 * Comments are prose: a sentence about `.rpc()` is not a call. A comment is
 * removed down to its line breaks, so line numbers still match the file.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (_c, p) => p);
}

function trackedAppFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...SCANNED], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((f) => SOURCE.test(f) && f !== SELF && !NOT_APP_CODE.some((re) => re.test(f)));
}

describe("no app, package or script calls Supabase's Data API", () => {
  it("the repository: zero calls", () => {
    const files = trackedAppFiles();
    assert.ok(files.length > 500, `only ${files.length} files scanned: the file list is wrong, and an empty scan is not a pass`);
    const offenders = [];
    for (const f of files) {
      for (const hit of dataApiCalls(stripComments(readFileSync(join(ROOT, f), "utf8")))) {
        offenders.push(`${f}:${hit.line} ${hit.what}`);
      }
    }
    assert.deepEqual(offenders, [], `Data API calls found:\n${offenders.join("\n")}`);
  });

  it("the scan reaches Storage callers, so a zero is not a scan that saw nothing", () => {
    const withStorage = trackedAppFiles().filter((f) => /\.storage\b/.test(readFileSync(join(ROOT, f), "utf8")));
    assert.ok(withStorage.length >= 5, `only ${withStorage.length} Storage callers seen`);
  });

  // Each arm is a snippet the scan must catch (a seeded real failure), or one
  // it must let through.
  const caught = [
    ['supabase.from("patients").select("id")', ".from() with a quoted table name"],
    ["const { data } = await client\n  .from('appointments')\n  .select('*')", ".from() with a quoted table name"],
    ["createSupabaseAdminClient().from(TABLE).select()", ".from() on a client factory's result"],
    ['await admin.rpc("resolve_confirm_code", { code })', ".rpc()"],
    ['supabase.schema("private").from(t)', ".schema()"],
    ['fetch(`${url}/rest/v1/patients?select=id`)', "a /rest/v1 path"],
    ['fetch(url + "/graphql/v1")', "a /graphql/v1 path"],
    ['import { PostgrestClient } from "@supabase/postgrest-js";', "the PostgREST client"],
    ['channel.on("postgres_changes", { table: "appointments" }, cb)', "a realtime table subscription"],
  ];
  it("a call written over several lines is reported on the line of the call", () => {
    const hits = dataApiCalls("const c = make();\nconst { data } = await c\n  .from(\"patients\")\n  .select(\"id\");\n");
    assert.deepEqual(hits, [{ line: 3, what: ".from() with a quoted table name" }]);
  });

  for (const [snippet, what] of caught) {
    it(`caught: ${what} in ${JSON.stringify(snippet).slice(0, 60)}`, () => {
      const hits = dataApiCalls(stripComments(snippet));
      assert.ok(hits.some((h) => h.what === what), `not caught: ${JSON.stringify(hits)}`);
    });
  }

  const allowed = [
    "admin.storage.from(ATTACHMENTS_BUCKET).upload(path, bytes)",
    "await admin.storage\n  .from(BUCKET)\n  .createSignedUrl(path, 60)",
    'supabase.storage.from("clinical-attachments").remove([p])',
    'Buffer.from("abc", "utf8")',
    "Array.from(new Set(ids))",
    "await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, id))",
    "await supabase.auth.getUser()",
    "// a comment that says supabase.rpc() is not used",
    "/* .from(\"x\") in a block comment */",
  ];
  for (const snippet of allowed) {
    it(`allowed: ${JSON.stringify(snippet).slice(0, 60)}`, () => {
      assert.deepEqual(dataApiCalls(stripComments(snippet)), []);
    });
  }
});
