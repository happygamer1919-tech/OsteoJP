// INTAKE-01. THE ARTICLE 9 GUARD: NO INTAKE ANSWER REACHES A LOG, AN ERROR STRING
// OR A URL, IN THE PORTAL FLOW OR THE API ROUTE.
//
// WHAT IS GUARDED. The guest clinical intake (docs/design/SPEC-guest-clinical-intake.md,
// section 6.3) is special-category health data under GDPR Article 9, about a person
// who may never become a patient. The spec's four rules: never in a URL, never in a
// query string, never in a log line, never in an error message. Each holds on the
// day it is written and breaks silently later - a console.error added while
// debugging, an error that starts interpolating a value, a `?step=` added for
// convenience. Nothing else in the repository checks any of them, so this does,
// over the SOURCE, the way scripts/pack-sessions-remaining-is-frozen.test.mjs does
// for its column.
//
// THE SCOPE is every non-test source file of the flow, by directory, so a file
// added to the flow later is covered on arrival:
//   apps/portal/app/marcacao/          the five-step form, its action and state
//   apps/portal/lib/guest/             the portal's server-to-server client
//   apps/api/app/api/v1/booking/guest/ the write route and the catalog
//   apps/api/lib/guest-intake/         validation, the transactional write, and the
//                                      patient's own read (patient-read.ts)
//   packages/db/src/guest-intake.ts    the detector and the INSERT
//   apps/api/app/api/v1/patient/intake/ the patient's read-only route (fork B)
//   apps/portal/app/portal/forms/intake/ the patient's read-only page (fork B)
//
// THE VOCABULARY is read from the wire contract itself (GUEST_INTAKE_WIRE_KEYS in
// apps/api/lib/guest-intake/validate.ts), in camelCase and snake_case, so a field
// added to the wire is guarded without anyone remembering this file. To it are
// added the names the flow uses for whole containers of answers (`intake`,
// `values`, `body`, ...): logging the container logs every answer in it.
//
// THE METHOD. Each file is run through a small lexer that separates CODE from
// COMMENTS and STRING TEXT, so prose about a field ("the pacemaker answer is
// required") never matches, and a real reference inside `${...}` always does. A
// file the lexer cannot read to a clean end state FAILS rather than passing
// unread. Every rule has a negative control below, run against a snippet that
// breaks it, so a rule that has stopped matching anything is red, not green.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCOPE_DIRS = [
  "apps/portal/app/marcacao",
  "apps/portal/lib/guest",
  "apps/api/app/api/v1/booking/guest",
  "apps/api/lib/guest-intake",
  // INTAKE-01 fork B: the patient's read-only view. It returns the answers
  // themselves, so the same four rules hold on its way out.
  "apps/api/app/api/v1/patient/intake",
  "apps/portal/app/portal/forms/intake",
];
const SCOPE_FILES = ["packages/db/src/guest-intake.ts"];

/** Files that must be in scope. If one moves, this fails instead of the guard
 *  quietly watching nothing. */
const MUST_COVER = [
  "apps/api/app/api/v1/booking/guest/route.ts",
  "apps/api/app/api/v1/booking/guest/catalog/route.ts",
  "apps/api/lib/guest-intake/validate.ts",
  "apps/api/lib/guest-intake/write.ts",
  "packages/db/src/guest-intake.ts",
  "apps/portal/app/marcacao/actions.ts",
  "apps/portal/app/marcacao/GuestBookingForm.tsx",
  "apps/portal/app/marcacao/state.ts",
  "apps/portal/lib/guest/api.ts",
  "apps/api/lib/guest-intake/patient-read.ts",
  "apps/api/app/api/v1/patient/intake/route.ts",
  "apps/portal/app/portal/forms/intake/page.tsx",
];

/** Names that hold MANY answers at once in this flow. */
const CONTAINERS = ["intake", "values", "body", "formData", "form", "input", "parsed", "row"];

/** The API's closed error vocabulary on these routes. A new member is a
 *  deliberate edit here, never an interpolated string. `unauthorized` is the
 *  patient read's 401 (apps/api/app/api/v1/patient/intake), the same literal
 *  every patient route in this API answers with. */
const API_ERROR_CODES = new Set(["invalid_input", "service_unavailable", "unauthorized"]);

/** Calls that sanitise an error down to something that cannot hold a value. */
const SANITISERS = ["sqlStateOf"];

// ---------------------------------------------------------------------------
// The lexer.
// ---------------------------------------------------------------------------

/**
 * Splits source into:
 *   code     comments removed, string literals blanked to "", regex literals to
 *            /r/, template literals reduced to their ${} expressions in parens.
 *   kept     comments removed, everything else verbatim.
 *   strings  the text of every string literal and template literal (with ${}
 *            where an expression sat).
 *   clean    false when the file did not end in plain code (an unterminated
 *            string, template or comment): the guard then refuses the file.
 */
export function lex(src) {
  let code = "";
  let kept = "";
  const strings = [];
  const stack = []; // { kind: "tpl", text } | { kind: "expr", depth }
  let mode = "code";
  let prevSig = "";
  let clean = true;
  let failedAt = -1;
  let i = 0;
  // Where a "/" can open a regex literal. NOT after "}" or "<": in TSX those are
  // a JSX attribute's closing brace before "/>" and a closing tag "</".
  const REGEX_AFTER = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", ";", "+", "-", "*", "%", "~", "^"]);

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "tpl") {
      const frame = stack[stack.length - 1];
      if (c === "\\") {
        frame.text += c + (n ?? "");
        kept += c + (n ?? "");
        i += 2;
        continue;
      }
      if (c === "`") {
        stack.pop();
        strings.push(frame.text);
        code += ")";
        kept += c;
        prevSig = ")";
        mode = "code";
        i += 1;
        continue;
      }
      if (c === "$" && n === "{") {
        frame.text += "${}";
        kept += "${";
        stack.push({ kind: "expr", depth: 0, openAt: i });
        mode = "code";
        prevSig = "{";
        i += 2;
        continue;
      }
      frame.text += c;
      kept += c;
      i += 1;
      continue;
    }

    // mode === "code"
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      code += " ";
      kept += " ";
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) {
        clean = false;
        failedAt = i;
        break;
      }
      i = end + 2;
      code += " ";
      kept += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      // A quote straight after an identifier character is JSX TEXT ("Don't"),
      // not a string: no JavaScript string literal can follow an identifier.
      if (/[A-Za-z0-9_$)\]]/.test(prevSig)) {
        code += c;
        kept += c;
        i += 1;
        continue;
      }
      let j = i + 1;
      let text = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\n") break;
        if (src[j] === "\\") {
          text += src[j] + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        text += src[j];
        j += 1;
      }
      if (src[j] !== c) {
        clean = false;
        failedAt = i;
        break;
      }
      strings.push(text);
      code += '""';
      kept += c + text + c;
      prevSig = '"';
      i = j + 1;
      continue;
    }
    if (c === "`") {
      stack.push({ kind: "tpl", text: "", openAt: i });
      code += "(";
      kept += c;
      mode = "tpl";
      i += 1;
      continue;
    }
    if (c === "/" && n !== ">" && REGEX_AFTER.has(prevSig)) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\n") break;
        if (d === "\\") {
          j += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        j += 1;
      }
      if (src[j] !== "/") {
        clean = false;
        failedAt = i;
        break;
      }
      j += 1;
      while (j < src.length && /[a-z]/.test(src[j])) j += 1;
      code += "/r/";
      kept += src.slice(i, j);
      prevSig = "/";
      i = j;
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && top.kind === "expr") {
      if (c === "{") top.depth += 1;
      if (c === "}") {
        if (top.depth === 0) {
          stack.pop();
          code += ",";
          kept += c;
          mode = "tpl";
          i += 1;
          continue;
        }
        top.depth -= 1;
      }
    }
    code += c;
    kept += c;
    if (!/\s/.test(c)) prevSig = c;
    i += 1;
  }
  if (mode !== "code" || stack.length !== 0) {
    clean = false;
    if (failedAt === -1) failedAt = stack[0]?.openAt ?? i;
  }
  const failedLine = failedAt === -1 ? 0 : src.slice(0, failedAt).split("\n").length;
  return { code, kept, strings, clean, failedLine };
}

/** The balanced argument text of the call whose "(" is at `open` in `code`. */
function argsAt(code, open) {
  let depth = 0;
  for (let j = open; j < code.length; j += 1) {
    if (code[j] === "(") depth += 1;
    else if (code[j] === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, j);
    }
  }
  return code.slice(open + 1);
}

/** The first top-level argument of an argument list. */
function firstArg(args) {
  let depth = 0;
  for (let j = 0; j < args.length; j += 1) {
    const ch = args[j];
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth -= 1;
    else if (ch === "," && depth === 0) return args.slice(0, j);
  }
  return args;
}

function calls(code, pattern) {
  const found = [];
  const re = new RegExp(pattern.source, "g");
  let m;
  while ((m = re.exec(code)) !== null) {
    const open = m.index + m[0].length - 1;
    found.push({ callee: m[0].slice(0, -1).trim(), args: argsAt(code, open) });
  }
  return found;
}

const snake = (k) => k.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
const wordRe = (names) => new RegExp(`(?<![\\w$])(${names.join("|")})(?![\\w$])`);

const LOG_CALL = /\b(?:console\.(?:log|info|warn|error|debug|trace)|logger\.\w+|Sentry\.\w+|captureException|captureMessage|log[A-Z]\w*)\s*\(/;
const ERROR_CALL = /\bnew\s+\w*Error\s*\(/;
const URL_FIRST_ARG_CALL = /\b(?:redirect|permanentRedirect|router\.push|router\.replace|fetch|new\s+URL)\s*\(/;
const URL_ALL_ARGS_CALL = /\b(?:new\s+URLSearchParams|searchParams\.(?:set|append))\s*\(/;

/**
 * Every violation in one file's source. `server` is true for API and database
 * files, where an error object carries SQL parameters and a failing row, so its
 * message, stack and the caught error itself are also refused in a log.
 */
export function violations(src, { fields, server }) {
  const out = [];
  const lexed = lex(src);
  if (!lexed.clean) {
    return [`the lexer could not read this file to a clean end state (stopped at line ${lexed.failedLine})`];
  }
  const { code, kept, strings } = lexed;

  const allFields = [...new Set([...fields, ...fields.map(snake)])];
  const answer = wordRe([...allFields, ...CONTAINERS]);
  const catchVars = [...code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const serverOnly = server
    ? [/\.(?:message|stack)\b/, ...(catchVars.length ? [wordRe(catchVars)] : [])]
    : [];
  const errorInternals = /JSON\.stringify|\.(?:detail|cause|params)\b/;

  // RULE 1 - LOGS.
  for (const { callee, args } of calls(code, LOG_CALL)) {
    let a = args;
    for (const s of SANITISERS) a = a.replace(new RegExp(`\\b${s}\\s*\\([^()]*\\)`, "g"), "0");
    const hit = a.match(answer);
    if (hit) out.push(`log call ${callee}(...) references \`${hit[1]}\``);
    if (errorInternals.test(a)) out.push(`log call ${callee}(...) serialises an object or an error's internals`);
    for (const re of serverOnly) {
      const m = a.match(re);
      if (m) out.push(`log call ${callee}(...) references \`${m[1] ?? m[0]}\` (an error's text can carry the values)`);
    }
  }

  // RULE 2 - ERROR STRINGS.
  for (const { args } of calls(code, ERROR_CALL)) {
    const hit = args.match(answer);
    if (hit) out.push(`an Error is built from \`${hit[1]}\``);
    if (/JSON\.stringify/.test(args)) out.push("an Error is built from JSON.stringify(...)");
  }
  for (const m of code.matchAll(/\bthrow\s+([^;\n]+)/g)) {
    const hit = m[1].match(answer);
    if (hit) out.push(`a throw carries \`${hit[1]}\``);
  }
  if (server) {
    for (const m of kept.matchAll(/\berror\s*:\s*([^,}\n]+)/g)) {
      const v = m[1].trim();
      const lit = v.match(/^"([a-z_]+)"$|^'([a-z_]+)'$/);
      const codeName = lit ? lit[1] ?? lit[2] : null;
      if (!codeName || !API_ERROR_CODES.has(codeName)) {
        out.push(`an API error value is not a closed-vocabulary literal: error: ${v}`);
      }
    }
  }

  // RULE 3 - URLS AND QUERY STRINGS.
  const queryKey = new RegExp(`[?&](${[...allFields, "step"].join("|")})=`);
  for (const s of strings) {
    const m = s.match(queryKey);
    if (m) out.push(`a URL or query string names \`${m[1]}\``);
  }
  for (const { callee, args } of calls(code, URL_FIRST_ARG_CALL)) {
    const hit = firstArg(args).match(answer);
    if (hit) out.push(`${callee}(...) builds its URL from \`${hit[1]}\``);
  }
  for (const { callee, args } of calls(code, URL_ALL_ARGS_CALL)) {
    const hit = args.match(answer);
    if (hit) out.push(`${callee}(...) puts \`${hit[1]}\` in a query string`);
  }
  if (/\bmethod\s*=\s*\{?\s*["']get["']/i.test(kept)) {
    out.push("a form posts with method GET, which puts every field in the URL");
  }

  return out;
}

// ---------------------------------------------------------------------------
// The scope and the vocabulary.
// ---------------------------------------------------------------------------

function scopeFiles() {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(e) && !/\.(test|spec)\./.test(e)) files.push(full);
    }
  };
  for (const d of SCOPE_DIRS) {
    const full = join(ROOT, d);
    if (existsSync(full)) walk(full);
  }
  for (const f of SCOPE_FILES) {
    const full = join(ROOT, f);
    if (existsSync(full)) files.push(full);
  }
  return files.map((f) => f.slice(ROOT.length + 1)).sort();
}

function wireFields() {
  const src = readFileSync(join(ROOT, "apps/api/lib/guest-intake/validate.ts"), "utf8");
  const block = src.match(/export const GUEST_INTAKE_WIRE_KEYS = \[([\s\S]*?)\] as const/);
  if (!block) return [];
  return [...block[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
}

const isServer = (rel) => rel.startsWith("apps/api/") || rel.startsWith("packages/db/");

// ---------------------------------------------------------------------------
// The guard.
// ---------------------------------------------------------------------------

test("the vocabulary is read from the wire contract and is not empty", () => {
  const fields = wireFields();
  assert.ok(fields.length >= 8, `GUEST_INTAKE_WIRE_KEYS yielded ${fields.length} keys`);
  for (const k of ["dateOfBirth", "reason", "pacemaker", "pregnancy"]) {
    assert.ok(fields.includes(k), `the wire vocabulary lost \`${k}\``);
  }
});

test("the scope covers the whole flow, and every file in it lexes cleanly", () => {
  const files = scopeFiles();
  for (const must of MUST_COVER) {
    assert.ok(files.includes(must), `${must} is not in the guard's scope`);
  }
  const unreadable = files
    .map((f) => [f, lex(readFileSync(join(ROOT, f), "utf8"))])
    .filter(([, l]) => !l.clean)
    .map(([f, l]) => `${f} (stopped at line ${l.failedLine})`);
  assert.deepEqual(unreadable, [], "files the lexer could not read cleanly");
});

test("NO intake answer reaches a log, an error string or a URL in the flow", () => {
  const fields = wireFields();
  const offenders = [];
  for (const rel of scopeFiles()) {
    const found = violations(readFileSync(join(ROOT, rel), "utf8"), { fields, server: isServer(rel) });
    for (const v of found) offenders.push(`${rel}: ${v}`);
  }
  assert.deepEqual(
    offenders,
    [],
    "Article 9 (SPEC-guest-clinical-intake section 6.3): intake answers must never reach a log, " +
      "an error string or a URL. Log names and codes, never values.",
  );
});

test("the portal's error vocabulary is a closed union of literals", () => {
  // SPEC section 6.3: no server value ever reaches the visitor's screen as text,
  // because every error is one of these members rendered from the dictionary. A
  // new member is fine; a `string` member would let a value through.
  const src = readFileSync(join(ROOT, "apps/portal/app/marcacao/state.ts"), "utf8");
  const m = src.match(/export type GuestError =([\s\S]*?)(?:\n\n|\nexport )/);
  assert.ok(m, "GuestError is no longer declared in apps/portal/app/marcacao/state.ts");
  const members = m[1].split("|").map((s) => s.trim()).filter(Boolean);
  assert.ok(members.length >= 5, `GuestError has ${members.length} members`);
  for (const member of members) {
    assert.match(member, /^'[a-z_]+'$/, `GuestError member ${member} is not a string literal`);
  }
});

// ---------------------------------------------------------------------------
// Negative controls: each rule, shown firing on a snippet that breaks it.
// ---------------------------------------------------------------------------

const F = ["dateOfBirth", "reason", "healthConditions", "pacemaker", "pregnancy"];
const fires = (src, server = true) => violations(src, { fields: F, server });

test("CONTROL: every rule fires on the thing it forbids", () => {
  const cases = [
    ["console.error(`bad ${intake.reason}`)", "a log interpolating an answer"],
    ["console.warn('x', values)", "a log of the whole form values"],
    ["logUnavailable('submit', body)", "a log wrapper given the body"],
    ["console.error(JSON.stringify(x))", "a log serialising an object"],
    ["try { a() } catch (e) { console.error(e) }", "a server log of the raw caught error"],
    ["try { a() } catch (err) { console.error(`x ${err.message}`) }", "a server log of an error message"],
    ["console.error(`x ${e.cause}`)", "a log of an error's cause"],
    ["console.info(date_of_birth)", "a log naming a snake_case field"],
    ["throw new Error(`refused ${pacemaker}`)", "an error built from an answer"],
    ["throw intake", "throwing the container"],
    ["return NextResponse.json({ error: `bad ${x}` }, { status: 400 })", "an interpolated API error"],
    ["return NextResponse.json({ error: 'pacemaker_missing' }, { status: 400 })", "an API error outside the vocabulary"],
    ["redirect(`/marcacao?step=5`)", "a step in the URL"],
    ["const u = '/x?pregnancy=sim'", "a field as a query key"],
    ["redirect(`/done/${values.reason}`)", "an answer in a redirect path"],
    ["fetch(`${base}/x/${intake.dateOfBirth}`, { method: 'POST' })", "an answer in a fetch URL"],
    ["new URLSearchParams(values)", "the form values as a query string"],
    ["url.searchParams.set('k', healthConditions)", "an answer set on a URL"],
    ['<form method="get">', "a GET form"],
  ];
  for (const [src, what] of cases) {
    assert.ok(fires(src).length > 0, `the guard did NOT fire on ${what}: ${src}`);
  }
});

test("CONTROL: the rules do not fire on what the flow legitimately does", () => {
  const clean = [
    "console.error(`[guest-booking] write failed (sqlstate ${sqlStateOf(e)}); nothing was stored.`)",
    "console.warn(`refused: service ${serviceId} at ${locationId}`)",
    "// console.error(intake.reason) is forbidden, and this comment says so",
    "const s = 'the pacemaker answer is required'",
    "fetch(`${apiBase()}/api/v1/booking/guest`, { method: 'POST', body })",
    "return NextResponse.json({ error: \"invalid_input\" }, { status: 400 })",
    "const x = a / b; const re = /^\\d{4}-\\d{2}-\\d{2}$/",
  ];
  for (const src of clean) {
    assert.deepEqual(fires(src), [], `the guard fired on legitimate code: ${src}`);
  }
  // The portal may log a fetch error's message (it is undici's, not the body's).
  assert.deepEqual(
    fires("function logUnavailable(where, e) { console.error(`[guest] ${where}: ${e.message}`) }", false),
    [],
  );
});

test("CONTROL: a file the lexer cannot finish is refused, not passed", () => {
  assert.deepEqual(fires("const s = 'unterminated\nconsole.error(intake)"), [
    "the lexer could not read this file to a clean end state (stopped at line 1)",
  ]);
});

test("CONTROL: JSX text with an apostrophe does not blind the lexer", () => {
  // "Don't" in JSX text must not open a string that swallows the log after it.
  const src = "const a = <p>Don't</p>\nconsole.error(values.reason)\n";
  assert.ok(fires(src, false).length > 0);
});

test("CONTROL: a self-closing JSX tag after an attribute brace is not read as a regex", () => {
  // `value={x} />` once opened a "regex" at the slash and swallowed the rest of
  // the file; the log after it must still be seen.
  const src = "const a = <input value={values[k]} />\nconsole.error(values.reason)\n";
  const found = fires(src, false);
  assert.ok(found.length > 0, "the log after the tag was not seen");
  assert.ok(!found.some((v) => v.startsWith("the lexer")), found.join("; "));
});

// ---------------------------------------------------------------------------
// Negative controls on the REAL files of the patient's read-only view (fork B).
// A scope entry proves nothing unless the guard, run over that exact file, can
// go red: each control injects an intake field into the file's real source and
// requires a violation, after first requiring the untouched file to be clean.
// ---------------------------------------------------------------------------

/** Replace `anchor` once, and refuse if it is not there: an injection that
 *  matched nothing would leave the control testing the clean file. */
function inject(src, anchor, replacement) {
  assert.equal(src.split(anchor).length - 1, 1, `the anchor is not in the file exactly once: ${anchor}`);
  const out = src.replace(anchor, replacement);
  assert.notEqual(out, src);
  return out;
}

const ROUTE = "apps/api/app/api/v1/patient/intake/route.ts";
const PAGE = "apps/portal/app/portal/forms/intake/page.tsx";

test("CONTROL: the patient intake route is clean as written, and the guard fires on an intake field injected into its log", () => {
  const fields = wireFields();
  const src = readFileSync(join(ROOT, ROUTE), "utf8");
  assert.deepEqual(violations(src, { fields, server: true }), [], "the route as written");
  const logged = inject(
    src,
    'console.error("[patient-intake] read failed; nothing was returned.");',
    'console.error(`[patient-intake] read failed for ${result.intakes[0].reason}`);',
  );
  const found = violations(logged, { fields, server: true });
  assert.ok(
    found.some((v) => v.startsWith("log call console.error(...) references")),
    `the guard did NOT fire on an intake field logged by the route: ${found.join("; ")}`,
  );
});

test("CONTROL: the guard fires on an intake answer injected into the route's error body", () => {
  const fields = wireFields();
  const src = readFileSync(join(ROOT, ROUTE), "utf8");
  const echoed = inject(
    src,
    '{ error: "service_unavailable" }',
    "{ error: `refused ${pacemaker}` }",
  );
  const found = violations(echoed, { fields, server: true });
  assert.ok(
    found.some((v) => v.startsWith("an API error value is not a closed-vocabulary literal")),
    `the guard did NOT fire on an answer echoed in the route's error: ${found.join("; ")}`,
  );
});

test("CONTROL: the patient intake page is clean as written, and the guard fires on an answer injected into a URL", () => {
  const fields = wireFields();
  const src = readFileSync(join(ROOT, PAGE), "utf8");
  assert.deepEqual(violations(src, { fields, server: false }), [], "the page as written");
  const leaked = inject(
    src,
    "if (!enabled) notFound()",
    "if (!enabled) redirect(`/portal/forms?reason=${intakes[0].reason}`)",
  );
  const found = violations(leaked, { fields, server: false });
  assert.ok(
    found.some((v) => v.includes("names `reason`") || v.includes("builds its URL from")),
    `the guard did NOT fire on an answer put in a URL by the page: ${found.join("; ")}`,
  );
});
