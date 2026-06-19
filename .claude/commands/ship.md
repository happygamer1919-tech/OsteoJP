---
description: Rebase current branch onto latest main, push, open a PR if none exists, then poll until the 3 required GitHub Actions checks go green and squash-merge. Usage: /ship (run from any feature branch)
---

You are shipping the current branch. Follow every step in order. Stop and
report if any step fails.

## Gate rules (read before doing anything)

Only three GitHub Actions checks gate the merge:

1. `Lint + typecheck + test`
2. `DB-gated tests (RLS isolation, seeded DB)`
3. `Playwright E2E (seeded DB)`

Vercel deployment statuses are **ignored** — they do not gate the merge.
`db-tests.yml` and `e2e.yml` must **never** be touched.

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
Only the 3 GitHub Actions checks gate this merge. Vercel statuses are ignored.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR number from the output. If a PR already exists, use that number.

### 4. Merge on green

Run:

```bash
GH_TOKEN="$GH_TOKEN" scripts/merge-on-green.sh <PR_NUMBER>
```

`GH_TOKEN` must be set in the environment. If it is not set, stop and tell
the user: "Set GH_TOKEN and re-run /ship."

The script polls every 20 seconds. It exits 0 on a successful squash-merge
and exits 1 if any required check fails. Report the outcome to the user.
