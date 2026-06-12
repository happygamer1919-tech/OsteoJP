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
