# Design Loop — Dispatch Prompt

Paste the block below into a fresh Claude Code terminal at the repo root to
start a loop run. Replace `<wave>` with the wave to run (e.g. `Wave 1`).

```
Run the OsteoJP design loop, bound to <wave>. State the bound wave explicitly
before you begin; you will only ever tick checkboxes in that wave's section.
Read docs/design/PLAN.md in full and follow the "How the loop works" protocol
exactly, including the "Parallel loops" rules and your wave's path allowlist.
Work the first unchecked task in <wave>: branch a fresh worktree off
origin/main, implement strictly per the SPEC file the task references using only
docs/brand-tokens.md values and staying inside the path allowlist, run
lint/typecheck/test/build for the affected packages until green, then run the
design-reviewer and a11y-reviewer subagents on your diff and fix every blocker
and fix finding. Open a PR titled with the task ID and tick that task's checkbox
in PLAN.md in the same PR. Apply the "Self-merge policy" to decide whether to
merge or leave the PR open. Repeat for the next unchecked task. Stop when <wave>
has none left and report the end-of-wave summary, including every changed
route/screen with its preview URL for Max's QA pass.
```

## Chained Migration Runner

For running N committed loop files (e.g. docs/loops/0026..0028) strictly in order
from a single terminal. Each loop file is a self-contained 7-field package; the
runner sequences them and stops at the boundary.

### Runner template
N committed loop files, run strictly in numeric order. Per-loop cycle:
1. A0 isolation + clean-tree guard (verbatim below).
2. Pre-flight (below): confirm the migration ground is exactly where the loop expects.
3. Execute the loop file in full (its own 7 fields, its own DoD).
4. Merge gate (verbatim below): merge only when the gate passes, else HALT.
5. Post-merge re-sync: git fetch origin, confirm the just-merged migration is now
   latest on main, then move to the next loop file off fresh origin/main.
Stop boundary: after the last file in the chain. Do not start the next number.
Single report-back at the end covering every loop run.

### A0 ISOLATION + CLEAN-TREE GUARD (verbatim, EVERY parallel terminal, not just runners)
- Own worktree: `git worktree add ../osteojp-<name> origin/main -b osteojp-<name>`.
- Assert `git rev-parse --show-toplevel` ends in the worktree name, NOT the primary checkout.
- Assert `git status --porcelain` is empty.
- Never `git checkout -b` in a shared checkout. HALT if either assertion fails.

### MERGE GATE (verbatim)
Self-merge only when ALL hold:
- The loop file's DoD evidence is pasted.
- `gh pr checks` shows EVERY required check SUCCESS (poll until nothing is PENDING;
  never merge on local dev apply alone).
- The diff touches neither db-tests.yml nor e2e.yml.
- The PR is mergeable.
Normal squash merge only. Never `--admin`, never the bypass box. A refused merge is
a HALT, not an escalation.

### Pre-flight (before each loop file)
- The latest migration on main is exactly the previous loop's number.
- No open migration PR.
- Read the loop file in full before writing anything.

### Dev-phase caveat
Chained self-merge is a DEV-PHASE pattern only, valid because branch protection is
currently relaxed. Once protection is re-hardened (the pre-real-data gate), chained
runners open PRs and HALT for human merge. No terminal ever bypasses protection to
keep a chain alive. (See DECISIONS.md 2026-07-01.)
