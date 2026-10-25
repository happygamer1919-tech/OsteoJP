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
 *     unless its receiver is exactly `<expr>.storage` (or `<expr>["storage"]`),
 *     or a built-in (Array, Buffer, the typed arrays, Object, Set, Map,
 *     Promise, Iterator, Readable, ReadableStream), or a call to Drizzle's
 *     `select`, `selectDistinct` or `selectDistinctOn`. Everything else is a
 *     call: a receiver ending in a NAME (`supabase.from(t)`, `sb.from(TABLE)`)
 *     and ANY other call (`createXxxClient().from(`, `serviceClient().from(`,
 *     `(await ownerClient()).from(`, `ctx.supabase().from(`). An allowlist, so
 *     a new way to obtain a client is caught without being named here;
 *   - any other read of a property named `from` where the receiver is a
 *     Supabase client: `x.from.bind(...)`, `.call(...)`, `.apply(...)` on any
 *     receiver but a built-in or Storage, and `x.from` as a value or
 *     `{ from } = x` when x is a client factory's result or a name bound to
 *     one in the same file. A client factory is any function named
 *     createXxxClient, and anything imported from @supabase/supabase-js or
 *     @supabase/ssr, under any alias. (A bare `range.from` is a date range
 *     in this code base, read in some forty places; it is not a client.)
 *   - `.rpc(` and `.schema(`, on anything;
 *   - a string holding `rest/v1` or `graphql/v1`, with or without a slash
 *     before it, in source files and in the shell scripts under scripts/;
 *   - an import of `@supabase/postgrest-js`, or the name `PostgrestClient`;
 *   - the string `postgres_changes` or the name `POSTGRES_CHANGES` (a realtime
 *     subscription to table changes).
 * OUT OF REACH, said plainly: a computed member whose key is not a literal
 * (`x[k](...)` with `k` holding "from") cannot be read from the tree.
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
const BUILT_INS = new Set([
  "Array", "Buffer", "Object", "Set", "Map", "Promise", "Iterator", "Readable", "ReadableStream",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
]);
/** The only calls a `.from(` may follow: Drizzle's query builders. */
const DRIZZLE_SELECT = new Set(["select", "selectDistinct", "selectDistinctOn"]);
const SHELL_DIRS = ["scripts/git-hooks/", "scripts/apply-lane/"];
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

/** True when `node` is exactly `<expr>.storage` or `<expr>["storage"]`. */
function isStorage(node) {
  const n = peel(node);
  if (ts.isPropertyAccessExpression(n)) return n.name.text === "storage";
  if (ts.isElementAccessExpression(n)) return ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "storage";
  return false;
}

/** The name of the function a call expression calls, or null. */
function calleeName(call) {
  const callee = peel(call.expression);
  return ts.isIdentifier(callee) ? callee.text : calledName(callee);
}

/**
 * Why a `from` on this receiver is a Data API call, or null when it is not:
 * Storage, a built-in, or a Drizzle select.
 */
function fromOn(receiverNode, isFactory) {
  const receiver = peel(receiverNode);
  if (isStorage(receiver)) return null;
  if (ts.isIdentifier(receiver) && BUILT_INS.has(receiver.text)) return null;
  if (ts.isCallExpression(receiver)) {
    const name = calleeName(receiver);
    if (name !== null && DRIZZLE_SELECT.has(name)) return null;
    return name !== null && isFactory(name) ? "on a client factory's result" : "on a call's result";
  }
  return "on a named receiver";
}

/** The Supabase client factories and the names bound to their results, in one file. */
function clientNames(source) {
  const factories = new Set();
  const clients = new Set();
  const visitImports = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier) && /^@supabase\/(supabase-js|ssr)$/.test(node.moduleSpecifier.text)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) factories.add(el.name.text);
    }
    ts.forEachChild(node, visitImports);
  };
  visitImports(source);
  const isFactory = (name) => FACTORY.test(name) || factories.has(name);
  const visitBindings = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = peel(node.initializer);
      if (ts.isCallExpression(init)) {
        const name = calleeName(init);
        if (name !== null && isFactory(name)) clients.add(node.name.text);
      }
    }
    ts.forEachChild(node, visitBindings);
  };
  visitBindings(source);
  return { isFactory, clients };
}

/** True when a receiver is a client: a factory's result, or a name bound to one. */
function isClient(receiverNode, names) {
  const r = peel(receiverNode);
  if (ts.isIdentifier(r)) return names.clients.has(r.text);
  if (ts.isCallExpression(r)) {
    const name = calleeName(r);
    return name !== null && names.isFactory(name);
  }
  return false;
}

/** The calls found in one file's text, each as { line, what }. */
export function dataApiCalls(text, file = "snippet.ts") {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const found = [];
  const at = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const names = clientNames(source);

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = calledName(callee);
      if (name === "rpc" || name === "schema") {
        found.push({ line: at(ts.isPropertyAccessExpression(callee) ? callee.name : callee), what: `.${name}()` });
      } else if (name === "from") {
        const why = fromOn(callee.expression, names.isFactory);
        if (why) found.push({ line: at(ts.isPropertyAccessExpression(callee) ? callee.name : callee), what: `.from() ${why}` });
      }
    } else if (
      (ts.isPropertyAccessExpression(node) && node.name.text === "from") ||
      (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "from")
    ) {
      // A read of `from` that is not the callee of a call.
      const isCallee = ts.isCallExpression(node.parent) && node.parent.expression === node;
      if (!isCallee) {
        const p = node.parent;
        const rebound = ts.isPropertyAccessExpression(p) && p.expression === node && ["bind", "call", "apply"].includes(p.name.text);
        const why = fromOn(node.expression, names.isFactory);
        if (why && (rebound || isClient(node.expression, names))) found.push({ line: at(node), what: `a read of .from ${why}` });
      }
    } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
      // Destructuring: const { from } = x, const { from: f } = x.
      const key = node.propertyName ?? node.name;
      if ((ts.isIdentifier(key) || ts.isStringLiteralLike(key)) && key.text === "from") {
        const decl = node.parent.parent;
        const init = ts.isVariableDeclaration(decl) ? decl.initializer : undefined;
        const why = init ? fromOn(init, names.isFactory) : null;
        if (why && isClient(init, names)) found.push({ line: at(node), what: `a read of .from ${why}` });
      }
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const m = DATA_API_PATH.exec(node.text);
      if (m) found.push({ line: at(node), what: `a ${m[2]}/v1 path` });
      if (node.text === "postgres_changes") found.push({ line: at(node), what: "a realtime table subscription" });
      if (node.text === "@supabase/postgrest-js") found.push({ line: at(node), what: "the PostgREST client" });
    } else if (ts.isIdentifier(node) && node.text === "PostgrestClient") {
      found.push({ line: at(node), what: "the PostgREST client" });
    } else if (ts.isIdentifier(node) && node.text === "POSTGRES_CHANGES") {
      found.push({ line: at(node), what: "a realtime table subscription" });
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

/** The rest/v1 and graphql/v1 paths in a shell script, as { line, what }. */
export function shellDataApiPaths(text) {
  const found = [];
  text.split("\n").forEach((line, i) => {
    const m = DATA_API_PATH.exec(line);
    if (m) found.push({ line: i + 1, what: `a ${m[2]}/v1 path` });
  });
  return found;
}

/** Shell scripts under scripts/: .sh and .zsh files, and every file in the hook and apply-lane folders that is not source. */
function trackedShellFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--", "scripts/"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\0")
    .filter(Boolean)
    .filter((f) => /\.(sh|zsh)$/.test(f) || (SHELL_DIRS.some((d) => f.startsWith(d)) && !/\.[a-z]+$/.test(f.split("/").pop())));
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

  it("the shell scripts under scripts/: no rest/v1 or graphql/v1 path", () => {
    const files = trackedShellFiles();
    assert.ok(files.includes("scripts/git-hooks/pre-push") && files.includes("scripts/merge-on-green.sh"), `shell list is wrong: ${files.join(", ")}`);
    const offenders = [];
    for (const f of files) for (const hit of shellDataApiPaths(readFileSync(join(ROOT, f), "utf8"))) offenders.push(`${f}:${hit.line} ${hit.what}`);
    assert.deepEqual(offenders, []);
  });

  it("shell: a path is caught, a plain URL is not", () => {
    assert.deepEqual(shellDataApiPaths('curl "$SUPABASE_URL/rest/v1/patients"\necho ok'), [{ line: 1, what: "a rest/v1 path" }]);
    assert.deepEqual(shellDataApiPaths("curl https://example.invalid/graphql/v1"), [{ line: 1, what: "a graphql/v1 path" }]);
    assert.deepEqual(shellDataApiPaths("gh api repos/x/y/pulls"), []);
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
    ["serviceClient().from(TABLE)", ".from() on a call's result"],
    ["(await ownerClient()).from(TABLE)", ".from() on a call's result"],
    ["getSupabase().from(\"patients\")", ".from() on a call's result"],
    ["ctx.supabase().from(t)", ".from() on a call's result"],
    ["import { createClient as mk } from \"@supabase/supabase-js\";\nmk(url, key).from(\"x\")", ".from() on a client factory's result"],
    ["import { createServerClient as mk } from \"@supabase/ssr\";\nconst c = mk(u, k, o);\nconst { from } = c;", "a read of .from on a named receiver"],
    ["const supabase = createSupabaseServerClient();\nconst { from } = supabase;\nfrom(\"patients\")", "a read of .from on a named receiver"],
    ["const { from: q } = createSupabaseAdminClient();", "a read of .from on a client factory's result"],
    ["const supabase = await createSupabaseServerClient();\nconst q = supabase.from;", "a read of .from on a named receiver"],
    ["const q = createSupabaseAdminClient().from;", "a read of .from on a client factory's result"],
    ["supabase.from.bind(supabase)(\"x\")", "a read of .from on a named receiver"],
    ["supabase.from.call(supabase, \"x\")", "a read of .from on a named receiver"],
    ["supabase.storage.schema.from(t)", ".from() on a named receiver"],
    ["x.storage.client.from(t)", ".from() on a named receiver"],
    ["supabase.storage().from(t)", ".from() on a call's result"],
    ["channel.on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES, cfg, cb)", "a realtime table subscription"],
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
    "Uint16Array.from(xs)",
    "Float64Array.from(xs)",
    "Readable.from(chunks)",
    "ReadableStream.from(iter)",
    "const f = Array.from;",
    "db.selectDistinct({ id: t.id }).from(t)",
    "db.selectDistinctOn([t.id]).from(t)",
    // A date range named `from`: not a client.
    "const { from, to } = range;",
    "const start = filters.from;",
    "const days = rangeOf(view).from;",
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
