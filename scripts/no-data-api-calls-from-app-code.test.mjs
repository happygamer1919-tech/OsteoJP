/**
 * The platform reads and writes the database only through its own server
 * (Drizzle over DATABASE_URL, packages/db). Supabase's Data API (the REST and
 * GraphQL endpoints the supabase-js client calls with `.from(table)`,
 * `.rpc(...)` and `.schema(...)`) is not used by any app, package or script.
 * Supabase-js is used for sign-in and for Storage only, and Storage
 * (`.storage.from(bucket)`) is a separate API.
 *
 * This check keeps it that way: it fails, naming the file and line, the day
 * application code starts calling the Data API, so that a dependency on it is
 * a decision and not an accident (batch item 13).
 *
 * HOW: every file is parsed by TypeScript's own parser (the root dependency
 * `typescript`), and the calls are read from the syntax tree. Comments are not
 * in the tree, and a string is a string: nothing here is a hand-written lexer.
 *
 * WHAT IS SCANNED: every tracked .ts, .tsx, .js, .mjs and .cjs file under
 * apps/, packages/, osteojp-mailbox/, tools/, scripts/ and supabase/.
 * WHAT IS NOT: Playwright specs and other tests (the e2e suites seed their
 * local stacks through the local Data API on purpose; production is never
 * their target), and this file.
 *
 * WHAT COUNTS AS A CALL:
 *   - `.from(...)`, written `x.from(` or `x["from"](`, whatever its argument,
 *     unless its receiver goes through `.storage`, or is a built-in (Array,
 *     Buffer, Uint8Array, Object, Set, Map, Promise, Iterator), or is itself
 *     a call that is not a client factory (Drizzle's `select(...).from(table)`).
 *     So a receiver that ends in a NAME is a call (`supabase.from(t)`,
 *     `sb.from(TABLE)`), and so is a factory's result used straight away
 *     (`createXxxClient().from(`, `(await createXxxClient()).from(`);
 *   - `.rpc(` and `.schema(`, on anything;
 *   - a string holding `rest/v1` or `graphql/v1`, with or without a slash
 *     before it;
 *   - an import of `@supabase/postgrest-js`, or the name `PostgrestClient`;
 *   - the string `postgres_changes` (a realtime subscription to table changes).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const SCANNED = ["apps/", "packages/", "osteojp-mailbox/", "tools/", "scripts/", "supabase/"];
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const NOT_APP_CODE = [/(^|\/)e2e\//, /(^|\/)tests?\//, /(^|\/)__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)node_modules\//];
const BUILT_INS = new Set(["Array", "Buffer", "Uint8Array", "Object", "Set", "Map", "Promise", "Iterator"]);
const FACTORY = /^create\w*Client$/;
const DATA_API_PATH = /(^|[^\w])(rest|graphql)\/v1\b/;

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JSX; // .js/.mjs/.cjs, JSX allowed
}

/** The name a call is made through: `x.name(` or `x["name"](`. */
function calledName(callee) {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
    return callee.argumentExpression.text;
  }
  return null;
}

/** Peels `(...)`, `await`, `!` and type assertions off an expression. */
function peel(node) {
  for (;;) {
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    else if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression?.(node)) node = node.expression;
    else return node;
  }
}

/** True when the chain under `node` goes through a `.storage` access. */
function throughStorage(node) {
  for (let n = node; n; ) {
    n = peel(n);
    if (ts.isPropertyAccessExpression(n)) {
      if (n.name.text === "storage") return true;
      n = n.expression;
    } else if (ts.isElementAccessExpression(n)) {
      if (ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "storage") return true;
      n = n.expression;
    } else if (ts.isCallExpression(n)) {
      n = n.expression;
    } else return false;
  }
  return false;
}

/** True for a call of a client factory: createXxxClient(...) or x.createXxxClient(...). */
function isFactoryCall(node) {
  const n = peel(node);
  if (!ts.isCallExpression(n)) return false;
  const callee = peel(n.expression);
  const name = ts.isIdentifier(callee) ? callee.text : calledName(callee);
  return name !== null && FACTORY.test(name);
}

/** The calls found in one file's text, each as { line, what }. */
export function dataApiCalls(text, file = "snippet.ts") {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const found = [];
  const at = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = calledName(callee);
      if (name === "rpc" || name === "schema") {
        found.push({ line: at(ts.isPropertyAccessExpression(callee) ? callee.name : callee), what: `.${name}()` });
      } else if (name === "from") {
        const receiver = peel(callee.expression);
        const where = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
        if (throughStorage(receiver)) {
          // Storage: a separate API.
        } else if (ts.isIdentifier(receiver) && BUILT_INS.has(receiver.text)) {
          // Array.from, Buffer.from and the like.
        } else if (ts.isCallExpression(receiver)) {
          if (isFactoryCall(receiver)) found.push({ line: at(where), what: ".from() on a client factory's result" });
          // Any other call: Drizzle's select(...).from(table) and its kind.
        } else {
          found.push({ line: at(where), what: ".from() on a named receiver" });
        }
      }
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const m = DATA_API_PATH.exec(node.text);
      if (m) found.push({ line: at(node), what: `a ${m[2]}/v1 path` });
      if (node.text === "postgres_changes") found.push({ line: at(node), what: "a realtime table subscription" });
      if (node.text === "@supabase/postgrest-js") found.push({ line: at(node), what: "the PostgREST client" });
    } else if (ts.isIdentifier(node) && node.text === "PostgrestClient") {
      found.push({ line: at(node), what: "the PostgREST client" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // One report per line and kind: `import { PostgrestClient } from "@supabase/postgrest-js"` is one finding.
  const seen = new Set();
  return found.filter((f) => {
    const k = `${f.line}:${f.what}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
      for (const hit of dataApiCalls(readFileSync(join(ROOT, f), "utf8"), f)) offenders.push(`${f}:${hit.line} ${hit.what}`);
    }
    assert.deepEqual(offenders, [], `Data API calls found:\n${offenders.join("\n")}`);
  });

  it("the scan reaches Storage callers and Drizzle's .from(table), so a zero is not a scan that saw nothing", () => {
    let storage = 0;
    let drizzle = 0;
    for (const f of trackedAppFiles()) {
      const text = readFileSync(join(ROOT, f), "utf8");
      if (/\.storage\b/.test(text)) storage += 1;
      if (/\.select\([\s\S]{0,200}?\)\s*\.from\(/.test(text)) drizzle += 1;
    }
    assert.ok(storage >= 5, `only ${storage} Storage callers seen`);
    assert.ok(drizzle >= 20, `only ${drizzle} Drizzle readers seen`);
  });

  it("a call written over several lines is reported on the line of the call", () => {
    const hits = dataApiCalls('const c = make();\nconst { data } = await c\n  .from("patients")\n  .select("id");\n');
    assert.deepEqual(hits, [{ line: 3, what: ".from() on a named receiver" }]);
  });

  // Each arm is a snippet the scan must catch (a seeded real failure), or one
  // it must let through.
  const caught = [
    ['supabase.from("patients").select("id")', ".from() on a named receiver"],
    ["const { data } = await client\n  .from('appointments')\n  .select('*')", ".from() on a named receiver"],
    ["supabase.from(tableName).select()", ".from() on a named receiver"],
    ["const sb = await createSupabaseServerClient();\nsb.from(TABLE).select()", ".from() on a named receiver"],
    ["(await createSupabaseServerClient()).from(TABLE)", ".from() on a client factory's result"],
    ["createSupabaseAdminClient().from(TABLE).select()", ".from() on a client factory's result"],
    ['supabase["from"]("x")', ".from() on a named receiver"],
    ['supabase.from ("x")', ".from() on a named receiver"],
    ["this.client.from(t)", ".from() on a named receiver"],
    ['await admin.rpc("resolve_confirm_code", { code })', ".rpc()"],
    ['supabase.schema("private").from(t)', ".schema()"],
    ['fetch(`${url}/rest/v1/patients?select=id`)', "a rest/v1 path"],
    ['fetch(url + "/graphql/v1")', "a graphql/v1 path"],
    ['new URL("rest/v1/patients", base)', "a rest/v1 path"],
    ["const p = `graphql/v1`;", "a graphql/v1 path"],
    ['import { PostgrestClient } from "@supabase/postgrest-js";', "the PostgREST client"],
    ['channel.on("postgres_changes", { table: "appointments" }, cb)', "a realtime table subscription"],
    // A comment marker inside a string hides nothing: the call after it is still read.
    ['const glob = "src/**/*.ts"; supabase.from("patients")', ".from() on a named receiver"],
    ['const u = "http://x//y"; supabase.rpc("f")', ".rpc()"],
  ];
  for (const [snippet, what] of caught) {
    it(`caught: ${what} in ${JSON.stringify(snippet).slice(0, 70)}`, () => {
      const hits = dataApiCalls(snippet);
      assert.ok(hits.some((h) => h.what === what), `not caught: ${JSON.stringify(hits)}`);
    });
  }

  const allowed = [
    "admin.storage.from(ATTACHMENTS_BUCKET).upload(path, bytes)",
    "await admin.storage\n  .from(BUCKET)\n  .createSignedUrl(path, 60)",
    'supabase.storage.from("clinical-attachments").remove([p])',
    "(await createSupabaseServerClient()).storage.from(BUCKET)",
    'supabase["storage"].from(BUCKET)',
    'Buffer.from("abc", "utf8")',
    "Array.from(new Set(ids))",
    "await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, id))",
    "db.select().from(users).innerJoin(roles, eq(users.roleId, roles.id))",
    "await supabase.auth.getUser()",
    "// a comment that says supabase.rpc() is not used\nconst x = 1;",
    '/* supabase.from("x") in a block comment */ const y = 2;',
    'const note = "call supabase.from(t) here";',
  ];
  for (const snippet of allowed) {
    it(`allowed: ${JSON.stringify(snippet).slice(0, 70)}`, () => {
      assert.deepEqual(dataApiCalls(snippet), []);
    });
  }
});
