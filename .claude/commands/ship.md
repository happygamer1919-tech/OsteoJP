---
description: Rebase current branch onto latest main, push, open a PR if none exists, then arm it with gh pr merge --auto --squash so GitHub squash-merges it once every required check is green. Refuses, unarmed, a PR labelled held-for-apply or titled GATE-CHANGE. Usage: /ship (run from any feature branch)
---

You are shipping the current branch. Follow every step in order. Stop and
report if any step fails.

## Gate rules (read before doing anything)

Branch protection decides which checks gate the merge, and GitHub applies it
itself when an armed PR's auto-merge fires. This file does not copy the list:
a copied list drifts from branch protection (this one said three checks while
branch protection required four). Vercel deployment statuses are not required
checks, so they do not gate the merge.
`db-tests.yml` and `e2e.yml` must **never** be touched.

Two kinds of PR are never armed by /ship, and step 4 refuses both: a PR
labelled `held-for-apply` and a PR titled `GATE-CHANGE`. They go to the owner
unarmed.

## Steps

### 1. Rebase onto latest main

```bash
git fetch origin
git rebase origin/main
```

If the rebase stops on a `pnpm-lock.yaml` conflict, resolve it with:

```bash
git checkout --ours pnpm-lock.yaml
pnpm install --no-frozen-lockfile
git add pnpm-lock.yaml
git rebase --continue --no-edit
```

Repeat for any further conflict stops on `pnpm-lock.yaml`. For any other
conflict, stop and report the conflicting file(s) — do not guess at a
resolution.

### 2. Push

```bash
git push --force-with-lease origin HEAD
```

(Force-with-lease is safe here: we just rebased and no one else is on the
branch.)

### 3. Open a PR if none exists

Check for an open PR against main:

```bash
gh pr list --head "$(git branch --show-current)" --state open --json number --jq '.[0].number'
```

If the output is empty, create one:

```bash
gh pr create --base main --title "<branch-description>" --body "$(cat <<'EOF'
## Summary
- <bullet points from commit messages>

## Checks
Armed at open: GitHub squash-merges this PR once every required check is green.
Vercel statuses are not required checks.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR number from the output. If a PR already exists, use that number.

### 4. Arm the PR (GitHub merges it on green)

Run, straight after step 3:

```bash
scripts/merge-on-green.sh <PR_NUMBER>
```

It arms the PR with `gh pr merge <PR_NUMBER> --auto --squash`, then re-reads
the PR to confirm. GitHub is the watcher (CLAUDE.md, rule R2): it squash-merges
the PR once every check branch protection requires is green. Nothing here
waits for the checks or polls them. If the checks are already green, arming
merges the PR at once.

Arm first, never "wait for green, then merge". Once the CI-minutes change
(#1446) is merged, the required E2E check reads red on an unarmed ordinary PR
until the PR is armed, because arming is what starts the E2E suite. Waiting for
green before arming would wait forever.

It refuses, with no merge call at all:

- a PR labelled `held-for-apply` (exit 6). A held PR arms only after its apply
  is proven and the label comes off (CLAUDE.md). Stop and report it: it goes to
  the owner unarmed.
- a PR whose title starts with `GATE-CHANGE` (exit 7), matched after leading
  spaces and in any case. A gate change is never armed; the owner merges it by
  hand. Stop and report it.
- a draft (exit 5), and a PR that is not OPEN (exit 4).

A refusal is the answer. Never route around it with a hand `gh pr merge`.

No `GH_TOKEN` needed: the script uses whatever `gh` is already authenticated
with, and `gh` picks up `GH_TOKEN` by itself when one is set. If `gh` is not
authenticated it exits 3 and says so.

Exit codes:

| code | meaning |
|---|---|
| 0 | armed, confirmed by re-reading the PR; or merged at once because every required check was already green |
| 1 | the arm did not take: the re-read shows the PR neither armed nor merged |
| 3 | bad usage (no PR number, or not all digits), `gh` missing or unauthenticated, or the PR could not be read |
| 4 | refused: the PR is not OPEN (already merged, or closed) |
| 5 | refused: the PR is a draft |
| 6 | refused: the PR is labelled `held-for-apply` |
| 7 | refused: the PR title starts with `GATE-CHANGE` |

Exit 2 ("timed out with checks still pending") is retired: the script no longer
waits, so it cannot time out.

Report the outcome to the user: armed (GitHub merges it on green), merged at
once, or refused and why. A required check that goes red after arming is a real
failure: fix it and push, then confirm the PR still reads armed with
`gh pr view <PR_NUMBER> --json autoMergeRequest`.
