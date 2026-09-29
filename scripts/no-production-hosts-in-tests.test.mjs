// THE INCIDENT CHECK (INC-G1): NO PRODUCTION HOST IN A TEST CONFIG, A FIXTURE
// OR A TEST FILE.
//
// ==========================================================================
// WHAT HAPPENED
// ==========================================================================
// 2026-09-28 17:36 Lisbon. A review-fix test ran the guide capture tool with
// --base-url pointed at the production portal. A mutation sweep then removed
// the tool's host guard, as a mutation sweep is meant to, and one headless
// browser opened the production portal. The test was correct while the guard
// held; it was one mutation away from photographing a live clinic. Card:
// INC-G1-capture-test-loaded-the-production-portal.
//
// The lead's ruling: a CI check that refuses the production hostnames and the
// Supabase production ref in test configs and fixtures. This file is that
// check, and it also reads every test file, because the incident WAS a test
// file. It runs in the required `Lint + typecheck + test` job through
// `pnpm test:scripts`.
//
// ==========================================================================
// WHAT COUNTS AS A HIT, SAID ONCE
// ==========================================================================
// 1. THE PRODUCTION DOMAIN, AS A HOST. The apex and every name that ends in it:
//    the portal, the app, the API, the mail sender, any other subdomain. With
//    or without a scheme, inside an email address, in any letter case.
//    Anything may stand BEFORE the apex, so a subdomain, an email domain and a
//    percent-encoded URL all count; the cost is that a made-up lookalike ending
//    in the same letters counts too, and no test has a reason to write one.
//    After the apex must come a character that cannot continue a host name.
//
// 2. THE RESERVED-SUFFIX RULE. A name that continues past the apex with the
//    single label `.invalid` or `.example` is NOT a production host: RFC 2606
//    reserves both, and neither resolves. That is how a guard's own test names
//    a production-shaped host that nothing can answer (the capture test does
//    exactly this). Only those two labels, and only as a whole label: a longer
//    label (`.invalidx`, `.examples`) or any other suffix (`.test`, `.com`)
//    stays a hit. `.test` and `.localhost` are reserved too and are
//    deliberately NOT exempt: the house rule for host-guard tests names
//    `.invalid`, and one escape hatch is easier to audit than four.
//
// 3. THE SUPABASE PRODUCTION REF, as a token and as any substring. Twenty
//    random letters cannot occur by chance, and a word-boundary match would
//    miss the ref behind a percent-encoded slash; every token match is also a
//    substring match, so this is the token rule plus the encoded case.
//
// Both names are spelled in parts below. This file is itself a test file in
// scope, and with the names written whole it would find itself.
//
// ==========================================================================
// THE SCOPE: WHICH FILES ARE READ
// ==========================================================================
// Tracked files only (`git ls-files`): the check is about bytes that reach the
// repository, and CI sees nothing else. See inScope() for the exact rules:
//   CONFIG   playwright.* and vitest.* anywhere; *.config.* under a directory
//            named e2e, test, tests or __tests__.
//   FIXTURE  any path through a `fixtures` or `__fixtures__` directory;
//            apps/*/e2e/fixtures*; apps/*/e2e/seed/**; docs/guide/shots/**;
//            docs/guide/build/seed-guide.mjs; and a file whose own name says
//            fixture (fixtures.ts, guide-test-fixture.ts), Markdown excepted.
//   TEST     *.test.* and *.spec.*, and every other file under a directory
//            named e2e, test, tests or __tests__ (helpers, setup, seeders),
//            Markdown excepted: a README there runs nothing.
//
// ==========================================================================
// THE ALLOW-LIST, AND WHY IT IS A GATE FILE
// ==========================================================================
// scripts/no-production-hosts-in-tests.allow.txt, one line per allowed line:
//
//   <path>\t<sha256 of the trimmed line>\t<why this line is legitimate>
//
// An entry clears every line in that file whose trimmed text hashes the same,
// so an identical copy of an allowed line in the same file is allowed too. Any
// edit to the line changes the hash and brings it back as a hit. An entry that
// clears no line is STALE and fails the check, so the list cannot rot into a
// set of blanket permissions. The list is this check's INPUT: an entry added
// there silences a hit, exactly as a name added to `.env.example` silences the
// env guard. So it is pinned in .github/gate-manifest.json, and a new entry is
// a GATE-CHANGE the owner merges by hand. The last test below asserts that pin.
//
// ==========================================================================
// WHAT THIS CHECK CANNOT SEE, SAID PLAINLY
// ==========================================================================
// A host assembled at run time from parts (as this file does on purpose), read
// from an environment variable, or fetched from elsewhere. A production host
// in a file outside the scope (application code, docs). A host drawn inside an
// image. It is a tripwire for the committed spelling, which is what the
// incident test carried, not a proof that no test can reach production. The
// other half of that defence is the house rule for host-guard tests: reserved
// hosts only, and an empty PLAYWRIGHT_BROWSERS_PATH.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { describe } from "node:test";

import { MANIFEST_PATH, isGateFile, readManifest } from "./gate-manifest.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ALLOW_PATH = "scripts/no-production-hosts-in-tests.allow.txt";

// Spelled in parts on purpose: see the header.
const APEX = ["osteojp", "pt"].join(".");
const SUPABASE_REF = ["dfotoodq", "vmjhbdcxyaxf"].join("");
const RESERVED_SUFFIXES = ["invalid", "example"];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The apex, then a character that cannot continue a host name, then an
 * OPTIONAL reserved label. When the reserved label is there, the match is not
 * a production host. A fresh RegExp per call keeps `lastIndex` out of it.
 */
const hostRe = () =>
  new RegExp(`${escapeRe(APEX)}(?![a-z0-9-])(\\.(?:${RESERVED_SUFFIXES.join("|")})(?![a-z0-9-]))?`, "gi");
const refRe = () => new RegExp(escapeRe(SUPABASE_REF), "gi");

/** What a line carries: the production names on it, reserved ones excluded. */
export function productionNamesIn(line) {
  const found = [];
  for (const m of line.matchAll(hostRe())) if (!m[1]) found.push("host");
  for (const _ of line.matchAll(refRe())) found.push("supabase-ref");
  return found;
}

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Every hit line of one file's text: 1-based line number, trimmed text, hash, kinds. */
export function hitsIn(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kinds = productionNamesIn(lines[i]);
    if (!kinds.length) continue;
    const trimmed = lines[i].trim();
    out.push({ line: i + 1, text: trimmed, hash: sha256(trimmed), kinds });
  }
  return out;
}

const TEST_DIRS = new Set(["e2e", "test", "tests", "__tests__"]);
const FIXTURE_DIRS = new Set(["fixtures", "__fixtures__"]);

/**
 * Which class a repo-relative POSIX path falls in, or null when it is out of
 * scope. The order only decides the label; a path in any class is read.
 */
export function inScope(p) {
  const parts = p.split("/");
  const base = parts[parts.length - 1];
  const dirs = parts.slice(0, -1);
  const isMarkdown = /\.md$/i.test(base);
  const underTestDir = dirs.some((d) => TEST_DIRS.has(d));

  if (/^(playwright|vitest)\./i.test(base)) return "config";
  if (underTestDir && /\.config\./i.test(base)) return "config";

  if (dirs.some((d) => FIXTURE_DIRS.has(d))) return "fixture";
  if (/^apps\/[^/]+\/e2e\/fixtures/.test(p)) return "fixture";
  if (/^apps\/[^/]+\/e2e\/seed\//.test(p)) return "fixture";
  if (p.startsWith("docs/guide/shots/")) return "fixture";
  if (p === "docs/guide/build/seed-guide.mjs") return "fixture";
  if (!isMarkdown && /(^|[-_.])fixtures?\./i.test(base)) return "fixture";

  if (/\.(test|spec)\.[^/]+$/i.test(base)) return "test";
  if (underTestDir && !isMarkdown) return "test";

  return null;
}

/**
 * Parses the allow-list. Refuses, rather than skips, anything malformed: a
 * line the parser cannot read is a line the check silently does not apply.
 */
export function parseAllowList(text) {
  const entries = [];
  const errors = [];
  const seen = new Set();
  text.split(/\r?\n/).forEach((raw, i) => {
    const where = `${ALLOW_PATH}:${i + 1}`;
    if (!raw.trim() || raw.trimStart().startsWith("#")) return;
    const fields = raw.split("\t");
    if (fields.length !== 3) {
      errors.push(`${where}: expected 3 tab-separated fields (path, sha256, reason), found ${fields.length}`);
      return;
    }
    const [path, hash, reason] = fields;
    if (!path || path !== path.trim()) errors.push(`${where}: the path is empty or padded`);
    if (!/^[0-9a-f]{64}$/.test(hash)) errors.push(`${where}: the second field is not a lowercase sha256`);
    if (!reason.trim()) errors.push(`${where}: an entry without a reason is a permission nobody signed`);
    const key = `${path}\t${hash}`;
    if (seen.has(key)) errors.push(`${where}: duplicate of an earlier entry`);
    seen.add(key);
    entries.push({ path, hash, reason, where });
  });
  return { entries, errors };
}

/** Tracked files of a repository, NUL-separated so no path is misread. */
function trackedFiles(root) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

/**
 * The whole check against one repository. Pure apart from reading `root`, so
 * the seeded arms below run it on a temporary repository end to end.
 */
export function evaluate(root, allowText) {
  const { entries, errors } = parseAllowList(allowText);
  const scoped = trackedFiles(root).filter((p) => inScope(p));
  const scopedSet = new Set(scoped);
  const allowed = new Set(entries.map((e) => `${e.path}\t${e.hash}`));
  const used = new Set();
  const offences = [];
  let allowedHits = 0;
  for (const p of scoped) {
    let text;
    try {
      text = readFileSync(join(root, p), "utf8");
    } catch (err) {
      // FAIL CLOSED: a file in scope that could not be read was not checked.
      errors.push(`${p}: tracked and in scope but unreadable (${err.code ?? err.message})`);
      continue;
    }
    for (const h of hitsIn(text)) {
      const key = `${p}\t${h.hash}`;
      if (allowed.has(key)) {
        used.add(key);
        allowedHits++;
      } else {
        offences.push({ path: p, ...h });
      }
    }
  }
  const stale = entries.filter((e) => !used.has(`${e.path}\t${e.hash}`));
  for (const e of entries) {
    if (!scopedSet.has(e.path)) errors.push(`${e.where}: ${e.path} is not a tracked file in scope`);
  }
  return { scanned: scoped.length, offences, stale, errors, allowedHits, entries: entries.length };
}

/** A failure message a person can act on: where, what, and the line to paste. */
function describeOffences(offences) {
  return offences
    .map(
      (o) =>
        `  ${o.path}:${o.line}  [${o.kinds.join(", ")}]  ${o.text.slice(0, 160)}\n` +
        `    to allow it, after a person has read it, as a GATE-CHANGE:\n` +
        `    ${o.path}\t${o.hash}\t<why this line cannot reach production>`,
    )
    .join("\n");
}

// ==========================================================================
// THE MATCHER
// ==========================================================================
describe("the matcher: a production name in any spelling is a hit", () => {
  test("the apex and its subdomains, with or without a scheme, in any case", () => {
    for (const line of [
      `const BASE = "https://portal.${APEX}";`,
      `baseURL: "http://app.${APEX}:443/agenda",`,
      `--base-url ${"api." + APEX}`,
      `"${APEX}"`,
      `https://${APEX.toUpperCase()}/r/abc`,
      `https://Portal.${APEX.replace("pt", "PT")}/`,
      `from: "reminders@send.${APEX}",`,
      `https%3A%2F%2Fportal.${APEX}%2Fx`,
      `see portal.${APEX}.`,
      `portal.${APEX}.evil.com`,
    ]) {
      assert.deepEqual(productionNamesIn(line), ["host"], line);
    }
  });

  test("the Supabase ref as a token, inside a URL, in a pooler user, encoded, in any case", () => {
    for (const line of [
      `const REF = "${SUPABASE_REF}";`,
      `https://${SUPABASE_REF}.supabase.co/rest/v1`,
      `postgresql://postgres.${SUPABASE_REF}:x@db.invalid:5432/postgres`,
      `db.${SUPABASE_REF}.supabase.co`,
      `%2F${SUPABASE_REF}%2F`,
      SUPABASE_REF.toUpperCase(),
    ]) {
      assert.deepEqual(productionNamesIn(line), ["supabase-ref"], line);
    }
  });

  test("RESERVED SUFFIX, one way: `.invalid` or `.example` after the name is not a production host", () => {
    for (const line of [
      `"https://portal.${APEX}.invalid"`,
      `http://app.${APEX}.invalid:3040/x`,
      `mail@send.${APEX}.example`,
      `portal.${APEX}.example.com`,
      `https://PORTAL.${APEX}.INVALID/`,
    ]) {
      assert.deepEqual(productionNamesIn(line), [], line);
    }
  });

  test("RESERVED SUFFIX, the other way: a longer label or any other suffix stays a hit", () => {
    for (const line of [
      `https://portal.${APEX}.invalidx`,
      `https://portal.${APEX}.examples.org`,
      `https://portal.${APEX}.test`,
      `https://portal.${APEX}.localhost`,
    ]) {
      assert.deepEqual(productionNamesIn(line), ["host"], line);
    }
    // One line, one reserved name and one real one: the real one still counts.
    assert.deepEqual(productionNamesIn(`a.${APEX}.invalid and b.${APEX}`), ["host"]);
  });

  test("CONTROL: lines that merely resemble a production name are not hits", () => {
    for (const line of [
      "const BASE = 'http://localhost:3040';",
      `osteojp-portal.invalid`,
      `${APEX.replace(".", "")}`, // the apex without its dot
      `${APEX}x.com`, // a name continues past the apex
      `portal.${APEX}-invalid`, // so does this one: its last label is not the country code
      "a twenty-letter ref that is not production: zzzzyyyyxxxxwwwwvvvv",
    ]) {
      assert.deepEqual(productionNamesIn(line), [], line);
    }
  });

  test("hitsIn() numbers lines from 1, trims before hashing, and ignores CRLF", () => {
    const hits = hitsIn(`clean\r\n   url: "https://app.${APEX}/x"   \r\nclean\n`);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].line, 2);
    assert.equal(hits[0].text, `url: "https://app.${APEX}/x"`);
    assert.equal(hits[0].hash, sha256(`url: "https://app.${APEX}/x"`));
  });
});

// ==========================================================================
// THE SCOPE
// ==========================================================================
describe("the scope: test configs, fixtures and tests are read; ordinary code is not", () => {
  test("every class the ruling and the dispatch name is in scope", () => {
    const expected = {
      "apps/web/playwright.config.ts": "config",
      "apps/web/vitest.config.ts": "config",
      "packages/db/vitest.workspace.ts": "config",
      "packages/ui/vitest.shims.d.ts": "config",
      "apps/web/e2e/global.config.ts": "config",
      "apps/web/e2e/fixtures.ts": "fixture",
      "apps/web/e2e/fixtures/test-attachment.png": "fixture",
      "apps/web/e2e/seed/seed-e2e.mjs": "fixture",
      "packages/db/tests/fixtures/fisiozero-synthetic.ts": "fixture",
      "packages/x/src/__fixtures__/a.json": "fixture",
      "packages/x/test/fixtures/b.json": "fixture",
      "docs/guide/shots/agenda.ler-a-agenda.shots.json": "fixture",
      "docs/guide/shots/text/agenda.txt": "fixture",
      "docs/guide/build/seed-guide.mjs": "fixture",
      "apps/web/lib/integrations/stripe/fixtures.ts": "fixture",
      "apps/web/lib/guide/guide-test-fixture.ts": "fixture",
      "apps/web/lib/guide/guide-capture.test.ts": "test",
      "apps/web/e2e/reminders.spec.ts": "test",
      "scripts/local-target.test.mjs": "test",
      "apps/web/app/_components/timing-panel.test.tsx": "test",
      "apps/web/e2e/helpers/confirm-code.ts": "test",
      "apps/web/e2e/auth.setup.ts": "test",
      "packages/db/tests/rls-harness.ts": "test",
      "apps/portal/test/server-only.stub.ts": "test",
    };
    for (const [p, cls] of Object.entries(expected)) assert.equal(inScope(p), cls, p);
  });

  test("CONTROL: application code, docs and a README in a test directory are not read", () => {
    for (const p of [
      "apps/web/lib/proxy/canonical-host.ts",
      "apps/web/lib/reminders/confirm-code.ts",
      "apps/portal/lib/clinics.ts",
      "docs/board/FIXTURES.md",
      "docs/recon/ACC-fixture-forbidden-state-sweep.md",
      "apps/web/e2e/README.md",
      "docs/guide/build/capture-guide.mjs",
      ".env.example",
      "apps/web/next.config.ts",
      "docs/latest-contest.md",
    ]) {
      assert.equal(inScope(p), null, p);
    }
  });

  test("the scope is not empty on this repository: each class has files in it", () => {
    const counts = { config: 0, fixture: 0, test: 0 };
    for (const p of trackedFiles(ROOT)) {
      const c = inScope(p);
      if (c) counts[c]++;
    }
    // Floors well under today's counts, so an ordinary deletion does not trip
    // them, while a scope rule that silently matched nothing would.
    assert.ok(counts.config >= 5, `configs in scope: ${counts.config}`);
    assert.ok(counts.fixture >= 20, `fixtures in scope: ${counts.fixture}`);
    assert.ok(counts.test >= 300, `tests in scope: ${counts.test}`);
  });
});

// ==========================================================================
// THE ALLOW-LIST PARSER
// ==========================================================================
describe("the allow-list parser refuses what it cannot read", () => {
  const H = "a".repeat(64);

  test("a well-formed entry, comments and blank lines parse cleanly", () => {
    const r = parseAllowList(`# a comment\n\nx.test.ts\t${H}\tthe guard's own test\n`);
    assert.deepEqual(r.errors, []);
    assert.equal(r.entries.length, 1);
  });

  test("a missing field, a bad hash, an empty reason and a duplicate are each refused", () => {
    assert.match(parseAllowList(`x.test.ts\t${H}\n`).errors.join("\n"), /expected 3 tab-separated fields/);
    assert.match(parseAllowList(`x.test.ts\t${H.toUpperCase()}\twhy\n`).errors.join("\n"), /not a lowercase sha256/);
    assert.match(parseAllowList(`x.test.ts\t${H}\t  \n`).errors.join("\n"), /without a reason/);
    assert.match(parseAllowList(`x.test.ts\t${H}\twhy\nx.test.ts\t${H}\twhy again\n`).errors.join("\n"), /duplicate/);
  });
});

// ==========================================================================
// SEEDED ARMS: THE WHOLE CHECK, ON A TEMPORARY REPOSITORY
// ==========================================================================
describe("seeded arms: the whole check run end to end on a temporary repository", () => {
  /** Builds a throwaway repository with these tracked files. */
  function seedRepo(files) {
    const root = mkdtempSync(join(tmpdir(), "no-prod-hosts-"));
    execFileSync("git", ["-c", "init.defaultBranch=main", "init", "-q"], { cwd: root });
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), body);
    }
    execFileSync("git", ["add", "-A"], { cwd: root });
    return root;
  }

  const CLEAN = {
    "apps/demo/e2e/helpers/clean.ts": "export const BASE = 'http://localhost:3040';\n",
    "apps/demo/lib/thing.test.ts": "it('works', () => {});\n",
  };

  test("ARM: a planted production hostname in a temporary fixture FAILS", () => {
    const planted = `  "baseUrl": "https://portal.${APEX}/agenda"`;
    const root = seedRepo({ ...CLEAN, "apps/demo/e2e/fixtures/planted.json": `{\n${planted}\n}\n` });
    try {
      const r = evaluate(root, "");
      assert.deepEqual(r.errors, []);
      assert.equal(r.offences.length, 1);
      assert.equal(r.offences[0].path, "apps/demo/e2e/fixtures/planted.json");
      assert.equal(r.offences[0].line, 2);
      assert.deepEqual(r.offences[0].kinds, ["host"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ARM: a planted Supabase production ref in a temporary test FAILS", () => {
    const root = seedRepo({ ...CLEAN, "packages/demo/src/target.test.ts": `const REF = "${SUPABASE_REF}";\n` });
    try {
      const r = evaluate(root, "");
      assert.deepEqual(r.errors, []);
      assert.deepEqual(
        r.offences.map((o) => [o.path, o.line, o.kinds]),
        [["packages/demo/src/target.test.ts", 1, ["supabase-ref"]]],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ARM: a planted hostname in a test CONFIG FAILS", () => {
    const root = seedRepo({ ...CLEAN, "apps/demo/playwright.config.ts": `use: { baseURL: "https://app.${APEX}" },\n` });
    try {
      assert.equal(evaluate(root, "").offences.length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("CONTROL: an allow-listed line PASSES, and an edit to that line brings it back", () => {
    const line = `expect(maskEmail("x@${APEX}")).toBe("x@${APEX}");`;
    const root = seedRepo({ ...CLEAN, "apps/demo/lib/mask.test.ts": `  ${line}  \n` });
    try {
      const allow = `apps/demo/lib/mask.test.ts\t${sha256(line)}\tasserts a pure masking function's output\n`;
      const r = evaluate(root, allow);
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.offences, []);
      assert.deepEqual(r.stale, []);
      assert.equal(r.allowedHits, 1);

      // The same entry does not cover an edited line.
      writeFileSync(join(root, "apps/demo/lib/mask.test.ts"), `  ${line} // edited\n`);
      const edited = evaluate(root, allow);
      assert.equal(edited.offences.length, 1);
      assert.equal(edited.stale.length, 1, "and the old entry is now stale");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ARM: a stale allow-list entry FAILS, even with no hit anywhere", () => {
    const root = seedRepo(CLEAN);
    try {
      const allow = `apps/demo/lib/thing.test.ts\t${sha256("a line that is not there")}\twas legitimate once\n`;
      const r = evaluate(root, allow);
      assert.deepEqual(r.offences, []);
      assert.equal(r.stale.length, 1);
      assert.equal(r.stale[0].path, "apps/demo/lib/thing.test.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ARM: an entry for a file outside the scope is refused, not silently kept", () => {
    const root = seedRepo({ ...CLEAN, "apps/demo/lib/app.ts": `const HOST = "app.${APEX}";\n` });
    try {
      const allow = `apps/demo/lib/app.ts\t${sha256(`const HOST = "app.${APEX}";`)}\tapplication code\n`;
      const r = evaluate(root, allow);
      assert.match(r.errors.join("\n"), /not a tracked file in scope/);
      assert.equal(r.stale.length, 1, "it clears nothing, because that file is never read");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("CONTROL: a reserved .invalid or .example name in a fixture PASSES, and the same name without it FAILS", () => {
    const root = seedRepo({
      ...CLEAN,
      "apps/demo/e2e/fixtures/reserved.ts": `export const A = "https://portal.${APEX}.invalid";\nexport const B = "app.${APEX}.example";\n`,
    });
    try {
      const r = evaluate(root, "");
      assert.deepEqual(r.errors, []);
      assert.deepEqual(r.offences, [], "reserved names are not production hosts");

      writeFileSync(join(root, "apps/demo/e2e/fixtures/reserved.ts"), `export const A = "https://portal.${APEX}";\n`);
      assert.equal(evaluate(root, "").offences.length, 1, "the same fixture without the suffix");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("ARM: a tracked file in scope that cannot be read FAILS CLOSED instead of passing unread", () => {
    const root = seedRepo({ ...CLEAN, "apps/demo/lib/gone.test.ts": `const G = "https://app.${APEX}";\n` });
    try {
      rmSync(join(root, "apps/demo/lib/gone.test.ts"));
      const r = evaluate(root, "");
      assert.match(r.errors.join("\n"), /apps\/demo\/lib\/gone\.test\.ts: tracked and in scope but unreadable/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("CONTROL: a production host in an out-of-scope file and in an UNTRACKED file is not read", () => {
    const root = seedRepo({ ...CLEAN, "docs/runbook.md": `Open https://portal.${APEX}\n` });
    try {
      writeFileSync(join(root, "apps/demo/lib/untracked.test.ts"), `const U = "https://app.${APEX}";\n`);
      const r = evaluate(root, "");
      assert.deepEqual(r.offences, []);
      assert.equal(r.scanned, 2, "only the two tracked in-scope files");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ==========================================================================
// THIS REPOSITORY
// ==========================================================================
describe("this repository", () => {
  const allowText = readFileSync(join(ROOT, ALLOW_PATH), "utf8");

  test("no production host or Supabase production ref in a test config, fixture or test, outside the allow-list", () => {
    const r = evaluate(ROOT, allowText);
    assert.deepEqual(r.errors, [], `the allow-list or the scan is broken:\n${r.errors.join("\n")}`);
    assert.ok(r.scanned > 300, `scanned ${r.scanned} files, which is too few to be the real scope`);
    assert.ok(
      r.offences.length === 0,
      `${r.offences.length} line(s) name a production host or the Supabase production ref ` +
        `(INC-G1: a test once loaded the production portal). Use a reserved name ` +
        `(portal.<domain>.invalid) instead. Only a line that cannot reach production, such as ` +
        `a guard's own refusal test or an assertion on a pure URL builder, belongs on the allow-list:\n` +
        describeOffences(r.offences),
    );
  });

  test("no allow-list entry is stale: each one still clears a line", () => {
    const r = evaluate(ROOT, allowText);
    assert.deepEqual(
      r.stale.map((e) => `${e.where}  ${e.path}`),
      [],
      "these entries clear no line any more; delete them in a GATE-CHANGE",
    );
  });

  test("the allow-list is a gate file and is pinned, so adding an entry is a GATE-CHANGE", () => {
    assert.ok(isGateFile(ALLOW_PATH), `${ALLOW_PATH} must be in GATE_GLOBS`);
    assert.ok(isGateFile("scripts/no-production-hosts-in-tests.test.mjs"), "and so is this file");
    const pinned = Object.keys(readManifest().files);
    assert.ok(pinned.includes(ALLOW_PATH), `${ALLOW_PATH} must be pinned in ${MANIFEST_PATH}`);
    assert.ok(pinned.includes("scripts/no-production-hosts-in-tests.test.mjs"), `this file must be pinned in ${MANIFEST_PATH}`);
  });
});
