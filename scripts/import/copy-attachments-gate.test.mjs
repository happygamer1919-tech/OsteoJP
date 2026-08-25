// THE BYTE-COPY PRODUCTION GATE.
//
// The three paths the dispatch names - prod without the phrase refused, prod
// with the phrase proceeds, non-prod proceeds untouched - plus the blocklist
// integrity arms, which are the ones that would fail silently.
//
// NO NETWORK, NO BUCKET. The storage client is a mock that records calls, so
// "nothing was uploaded" is provable rather than asserted.

import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { CONFIRM_PHRASE, gateOnTarget, readPhraseFromStdin, copyAttachments } from "./copy-attachments.mjs";
import { isProdSupabaseUrl, readProdRefs, refFromSupabaseUrl, SEED_GUARD_PATH } from "./prod-refs.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROD = "dfotoodqvmjhbdcxyaxf";
const RETIRED = "jaxmkwoxjcgzkwxgbayx";
const FAKE = "abcdefghijklmnopqrst";
const url = (ref) => `https://${ref}.supabase.co`;

const silent = () => {};
const feed = (s) => () => Promise.resolve(s);

/* ====================================================================== */
/* THE BLOCKLIST IS READ, NEVER COPIED                                     */
/* ====================================================================== */

test("the refs come from seed-guard.ts, and this file holds no copy of them", () => {
  const refs = readProdRefs();
  assert.ok(refs.includes(PROD));
  assert.ok(refs.includes(RETIRED));
  const src = fs.readFileSync(path.join(REPO, "scripts/import/prod-refs.mjs"), "utf8");
  for (const r of refs) {
    assert.ok(!src.includes(r), `prod-refs.mjs must not hardcode ${r}`);
  }
  const job = fs.readFileSync(path.join(REPO, "scripts/import/copy-attachments.mjs"), "utf8");
  for (const r of refs) {
    assert.ok(!job.includes(r), `copy-attachments.mjs must not hardcode ${r}`);
  }
});

test("an EMPTY blocklist THROWS - it never reads as 'not production'", () => {
  // The exact state SEC-seed-guard-prod-blocklist was carded for. A parser that
  // returned [] here would make every includes() false and pass everything.
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sg-")), "seed-guard.ts");
  fs.writeFileSync(f, "export const PROD_REFS: string[] = [];\n");
  assert.throws(() => readProdRefs(f), /EMPTY/);
});

test("a MISSING declaration THROWS rather than defaulting to open", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sg2-")), "seed-guard.ts");
  fs.writeFileSync(f, "export const SOMETHING_ELSE = 1;\n");
  assert.throws(() => readProdRefs(f), /NOT FOUND/);
});

test("an unreadable file THROWS", () => {
  assert.throws(() => readProdRefs("/no/such/seed-guard.ts"), /unreadable/);
});

test("it parses the DECLARATION, not the whole file", () => {
  // A whole-file scan would also match the refs named in the surrounding
  // COMMENTS - so an emptied declaration would still look populated.
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sg3-")), "seed-guard.ts");
  fs.writeFileSync(
    f,
    `// dfotoodqvmjhbdcxyaxf is production, jaxmkwoxjcgzkwxgbayx is retired\nexport const PROD_REFS: string[] = [];\n`,
  );
  assert.throws(() => readProdRefs(f), /EMPTY/);
});

test("SEED_GUARD_PATH resolves to the real file regardless of cwd", () => {
  assert.ok(fs.existsSync(SEED_GUARD_PATH));
  assert.match(SEED_GUARD_PATH, /packages\/db\/seed\/seed-guard\.ts$/);
});

/* ====================================================================== */
/* RESOLVING THE REF FROM SUPABASE_URL                                     */
/* ====================================================================== */

test("the storage endpoint shape resolves - the shape seed-guard's parser cannot", () => {
  assert.equal(refFromSupabaseUrl(url(PROD)), PROD);
  assert.equal(refFromSupabaseUrl(url(FAKE)), FAKE);
  assert.equal(refFromSupabaseUrl(""), null);
  assert.equal(refFromSupabaseUrl(undefined), null);
});

test("a prod ref reached by any other URL shape is still caught", () => {
  // Custom domain, pooler string in the wrong variable, path suffix. Substring
  // cannot under-match, and that asymmetry is deliberate.
  for (const u of [
    `https://storage.example.com/${PROD}/objects`,
    `postgresql://postgres.${PROD}:pw@aws-0.pooler.supabase.com:6543/postgres`,
    `https://${PROD}.supabase.co:443/storage/v1`,
  ]) {
    assert.equal(isProdSupabaseUrl(u).prod, true, u);
  }
});

test("the RETIRED prod ref is refused too, not only the live one", () => {
  assert.equal(isProdSupabaseUrl(url(RETIRED)).prod, true);
});

/* ====================================================================== */
/* THE THREE PATHS THE DISPATCH NAMES                                      */
/* ====================================================================== */

test("PROD ref WITHOUT the phrase is REFUSED", async () => {
  const r = await gateOnTarget({
    supabaseUrl: url(PROD),
    readPhrase: feed("import fisiozero into production"), // wrong case
    log: silent,
    err: silent,
  });
  assert.equal(r.ok, false);
  assert.equal(r.prod, true);
  assert.equal(r.ref, PROD);
});

test("PROD ref WITH the exact phrase PROCEEDS", async () => {
  const r = await gateOnTarget({
    supabaseUrl: url(PROD),
    readPhrase: feed(CONFIRM_PHRASE),
    log: silent,
    err: silent,
  });
  assert.equal(r.ok, true);
  assert.equal(r.prod, true);
});

test("NON-PROD ref PROCEEDS and is never asked for a phrase", async () => {
  // The asymmetry that keeps the gate meaningful: the rehearsal is run
  // repeatedly, and a prompt on it would be trained away.
  let asked = false;
  const r = await gateOnTarget({
    supabaseUrl: url(FAKE),
    readPhrase: () => {
      asked = true;
      return Promise.resolve("");
    },
    log: silent,
    err: silent,
  });
  assert.equal(r.ok, true);
  assert.equal(r.prod, false);
  assert.equal(asked, false, "a non-prod target must not prompt");
});

test("an EMPTY phrase on a prod target is refused", async () => {
  const r = await gateOnTarget({ supabaseUrl: url(PROD), readPhrase: feed(""), log: silent, err: silent });
  assert.equal(r.ok, false);
});

test("near-miss phrases are all refused", async () => {
  for (const near of [
    "IMPORT FISIOZERO INTO PRODUCAO",
    "IMPORT  FISIOZERO  INTO  PRODUCTION",
    "IMPORT FISIOZERO INTO PRODUCTION!",
    "import fisiozero into production",
  ]) {
    const r = await gateOnTarget({ supabaseUrl: url(PROD), readPhrase: feed(near), log: silent, err: silent });
    assert.equal(r.ok, false, near);
  }
});

test("surrounding whitespace is trimmed, so a trailing space is not a refusal", async () => {
  const r = await readPhraseFromStdin(Readable.from([`  ${CONFIRM_PHRASE}  \n`]));
  assert.equal(r, CONFIRM_PHRASE);
});

/* ====================================================================== */
/* NOTHING LEAKS, AND NOTHING UPLOADS ON A REFUSAL                         */
/* ====================================================================== */

test("the expected phrase is NEVER printed, on any path", async () => {
  const out = [];
  await gateOnTarget({
    supabaseUrl: url(PROD),
    readPhrase: feed("wrong"),
    log: (m) => out.push(m),
    err: (m) => out.push(m),
  });
  const joined = out.join("\n");
  assert.ok(!joined.includes(CONFIRM_PHRASE), "printing it turns a refusal into a copy-paste prompt");
  assert.ok(!joined.includes("wrong"), "the typed value must never be echoed");
});

test("a refused gate uploads NOTHING - proven against a recording mock", async () => {
  // The gate returns before `supabaseStorageClient()` is even built. This pins
  // the property the gate exists for: on a refusal, no object is created, read
  // or overwritten.
  const calls = [];
  const storage = {
    exists: async (p) => {
      calls.push(["exists", p]);
      return false;
    },
    upload: async (p) => {
      calls.push(["upload", p]);
      return 1;
    },
  };
  const gate = await gateOnTarget({
    supabaseUrl: url(PROD),
    readPhrase: feed("nope"),
    log: silent,
    err: silent,
  });
  assert.equal(gate.ok, false);
  if (gate.ok) await copyAttachments({ source: { names: () => [], open: () => null }, mapping: {}, checkpointFile: "/dev/null", storage });
  assert.deepEqual(calls, [], "a refused run must touch storage zero times");
});

test("the gate is called BEFORE the storage client is built", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts/import/copy-attachments.mjs"), "utf8");
  // Match the CALL SITE, not the function definition or the comment that
  // mentions it - both appear earlier in the file and would invert this.
  const gateAt = src.indexOf("gate = await gateOnTarget()");
  const clientAt = src.indexOf("const storage = supabaseStorageClient()");
  assert.ok(gateAt > -1, "the gate call site was not found");
  assert.ok(clientAt > -1, "the storage client call site was not found");
  assert.ok(gateAt < clientAt, "a refusal must not even build a client");
});

test("a thrown blocklist error exits 2, and is not swallowed into a pass", () => {
  const src = fs.readFileSync(path.join(REPO, "scripts/import/copy-attachments.mjs"), "utf8");
  const block = src.slice(src.indexOf("gate = await gateOnTarget()"), src.indexOf("const storage ="));
  assert.match(block, /catch/);
  assert.match(block, /process\.exit\(2\)/);
  assert.ok(!/gate\s*=\s*\{\s*ok:\s*true/.test(block), "a catch must never default to ok");
});
