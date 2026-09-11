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
  const others = ["docs/runbook-prod-migrations.md", "docs/import/PROD-RUN.md", "docs/import/REHEARSAL.md"].filter(
    (f) => existsSync(join(ROOT, f)),
  );
  return [...applies, ...others].sort();
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
