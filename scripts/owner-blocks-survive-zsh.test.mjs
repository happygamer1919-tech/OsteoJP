// AN OWNER-RUN BLOCK IS PASTED INTO zsh, SO IT MUST MEAN THE SAME THING IN zsh.
//
// WHAT HAPPENED, 2026-09-11. The owner pasted docs/migration-apply-0085.md's
// stage 1 into his terminal at 17:27:42Z and stage 2 at 17:28:24Z. Both stopped
// on "STOP: the pre-check is not on origin/main", and the file IS on main. The
// line was
//
//   git show $CHECKS:scripts/0085-precheck.sql > /tmp/0085-precheck.sql
//
// In zsh, `$NAME:x` applies a MODIFIER to the parameter, even unbraced and even
// inside double quotes. `:s` is substitute, so `$CHECKS:scripts/0085-precheck.sql`
// expands to `<sha>k.sql`; git exits 128 and the redirect leaves a zero-byte
// file. In bash the same line is a path. The block had been rehearsed end to end,
// under bash, which is why the rehearsal passed and the sitting did not.
//
// THE RULE. Inside a fenced block of a document the owner pastes into a
// production shell, a parameter followed by a colon is written with braces:
// `${NAME}:`. zsh leaves the braced form alone, and so does bash.
//
// A static check and not a rehearsal, on purpose: every future block is covered
// the moment it is written, including the ones nobody rehearses.
//
// Run: pnpm test:scripts   (node --test, wired into the REQUIRED CI quality job)

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The documents whose fenced blocks are pasted into the owner's shell. */
function ownerBlockDocs() {
  const docs = join(ROOT, "docs");
  const applies = readdirSync(docs)
    .filter((f) => /^migration-apply-\d{4}\.md$/.test(f))
    .map((f) => join("docs", f));
  // A DATA operation is pasted into the same shell as a migration apply, and
  // until 2026-09-16 the glob above could not see one: it matches
  // `migration-apply-NNNN.md` only, and a data op has no migration number to be
  // named after. `docs/data-op-*.md` closes that hole for every future one
  // rather than for the first one written.
  const dataOps = readdirSync(docs)
    .filter((f) => /^data-op-[a-z0-9-]+\.md$/.test(f))
    .map((f) => join("docs", f));
  // A POST-CHECK document is pasted into the same shell as an apply, and the
  // glob above could not see one either: `migration-postcheck-0089.md` is named
  // for the migration it VERIFIES, not for a migration it applies, so
  // `migration-apply-NNNN.md` misses it. It carries the same shape of block -
  // a `${PIN}` checkout, a `shasum` comparison, a `psql` run - and therefore the
  // same hazard. Added for every future one rather than for the first.
  const postchecks = readdirSync(docs)
    .filter((f) => /^migration-postcheck-\d{4}\.md$/.test(f))
    .map((f) => join("docs", f));
  const others = ["docs/runbook-prod-migrations.md", "docs/import/PROD-RUN.md", "docs/import/REHEARSAL.md"].filter(
    (f) => existsSync(join(ROOT, f)),
  );
  return [...applies, ...dataOps, ...postchecks, ...others].sort();
}

/** `$NAME:` unbraced. Comment lines are skipped: the shell never expands them. */
const UNBRACED_BEFORE_COLON = /\$[A-Za-z_][A-Za-z0-9_]*:/;

export function offendingLines(markdown) {
  const out = [];
  const lines = markdown.split("\n");
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence || /^\s*#/.test(line)) return;
    if (UNBRACED_BEFORE_COLON.test(line)) out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

test("the scan covers the apply documents, so an empty glob cannot pass it", () => {
  const files = ownerBlockDocs();
  assert.ok(
    files.filter((f) => f.startsWith("docs/migration-apply-")).length >= 15,
    `expected at least 15 apply documents, found ${files.length}: ${files.join(", ")}`,
  );
});

test("the scan covers the POST-CHECK documents, so the new class cannot be silently uncovered", () => {
  const files = ownerBlockDocs();
  const postchecks = files.filter((f) => f.startsWith("docs/migration-postcheck-"));
  // AN EMPTY GLOB MUST NOT PASS. `migration-postcheck-0089.md` exists on main
  // and carries a pasted block; if this list is ever empty the glob has stopped
  // matching and the guard would be reporting safety it never checked.
  assert.ok(
    postchecks.length >= 1,
    `expected at least one post-check document in the scan, found: ${files.join(", ")}`,
  );
  assert.ok(
    postchecks.includes("docs/migration-postcheck-0089.md"),
    `the 0089 post-check must be scanned; scanned: ${postchecks.join(", ")}`,
  );
});

test("NEGATIVE CONTROL: a violation planted in a post-check document is caught", () => {
  // The guard is only worth its green if it can go red. This is the exact shape
  // a post-check block takes - a pinned checkout feeding `git show` - with the
  // braces removed, which is what zsh reads as a `:s` modifier.
  const planted = [
    "# 0089 post-check",
    "",
    "```",
    "(",
    "set -eo pipefail",
    "PIN=$(git rev-parse origin/main)",
    "git show $PIN:scripts/db/postcheck-0089-readonly.sql > /tmp/x.sql",
    ")",
    "```",
    "",
  ].join("\n");
  const found = offendingLines(planted);
  assert.equal(found.length, 1, `expected the planted line to be caught, got ${JSON.stringify(found)}`);
  assert.match(found[0].text, /\$PIN:scripts/);

  // ...and the braced form of the same line is clean, so the rule discriminates
  // rather than flagging every post-check block on sight.
  const fixed = planted.replace("$PIN:scripts", "${PIN}:scripts");
  assert.deepEqual(offendingLines(fixed), []);
});

test("the detector catches the exact line that stopped 0085, and passes its braced form", () => {
  const fence = (body) => "```\n" + body + "\n```\n";
  assert.equal(offendingLines(fence("git show $CHECKS:scripts/0085-precheck.sql > /tmp/0085-precheck.sql")).length, 1);
  assert.equal(offendingLines(fence('echo "STOP: $PIN: not a commit"')).length, 1);
  assert.equal(offendingLines(fence("git show ${CHECKS}:scripts/0085-precheck.sql > /tmp/0085-precheck.sql")).length, 0);
  assert.equal(offendingLines(fence('echo "STOP: $PIN does not resolve to a commit"')).length, 0);
  assert.equal(offendingLines(fence("# git show $CHECKS:scripts/x.sql is a comment")).length, 0);
  assert.equal(offendingLines("prose outside a fence: $CHECKS:scripts/x.sql\n").length, 0);
});

test("no owner-run block writes a parameter followed by a colon without braces", () => {
  const found = [];
  for (const f of ownerBlockDocs()) {
    for (const o of offendingLines(readFileSync(join(ROOT, f), "utf8"))) found.push(`${f}:${o.line}: ${o.text}`);
  }
  assert.deepEqual(
    found,
    [],
    "In zsh `$NAME:` applies a modifier to the parameter (`:s` substitutes, `:h` takes the head),\n" +
      "so the line does something different from what bash does with it. Write `${NAME}:`.\n" +
      found.join("\n"),
  );
});
