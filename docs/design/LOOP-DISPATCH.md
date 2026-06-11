# Design Loop — Dispatch Prompt

Paste the block below into a fresh Claude Code terminal at the repo root to
start a loop run. Replace `<wave>` with the wave to run (e.g. `Wave 1`).

```
Run the OsteoJP design loop. Read docs/design/PLAN.md in full and follow the
"How the loop works" protocol exactly, for <wave>. Work the first unchecked
task in that wave: branch a fresh worktree off origin/main, implement strictly
per the SPEC file the task references using only docs/brand-tokens.md values,
run lint/typecheck/test/build for the affected packages until green, then run
the design-reviewer and a11y-reviewer subagents on your diff and fix every
blocker and fix finding. Open a PR titled with the task ID and tick that task's
checkbox in PLAN.md in the same PR. Do not push to main and do not merge.
Repeat for the next unchecked task. Stop when the wave has none left and report
a summary of every PR opened.
```
