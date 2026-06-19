# Dispatch Queue and Loop Protocol

This file is the job board for looped terminal-Claude dispatches. A looped
dispatch finishes its task, comes back here, marks its task done, and either
continues to the next task or stops for a human.

## How the loop runs

After a task's PR is merged, the terminal reads the next unchecked item under
"Queue" below.

- Item tagged `LOOP`: start it. Run `git checkout main && git pull origin main`,
  create a new branch, do the work, open a PR per
  `.github/PULL_REQUEST_TEMPLATE.md`, wait for CI, merge (squash), then move the
  item to "Done" with its PR number and repeat this protocol on the next item.
- Item tagged `GATE`: STOP. Print the task line and its required conditions. Do
  not start it. Do not weld it onto the current work. Hand back to a human.

If a `LOOP` task is already done or cannot be done cleanly, mark it `[x]` with a
note `skipped: <reason>` and move to the next item. Never invent scope and never
force a PR just to have something to merge.

## Hard exclusions (the loop never touches these)

- The Fisiozero archiver and the full enumeration / data-migration chain
- Normalization or staging-ledger writes (migration 0014, FisiozeroSource adapter)
- Production Supabase, DB schema design, RLS, or any security-critical code
- Any production merge

These are Ivan's domain or require explicit human sign-off. The loop only does
Max's domain: content, i18n, copy, QA scaffolding, Storybook, UI components,
docs, seed data, test scenarios.

## Queue

- [ ] GATE  Fisiozero full enumeration  (needs: 8-patient hand review signed off by Max, AND Ivan confirms the Frankfurt Supabase bucket as the EU-resident target)
- [ ] LOOP  REPLACE ME with a real open task in Max's domain
- [ ] LOOP  REPLACE ME with a real open task in Max's domain

## Done

(completed LOOP tasks move here, each with its PR number)
