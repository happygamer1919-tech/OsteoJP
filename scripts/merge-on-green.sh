#!/usr/bin/env bash
# Arm a pull request for auto-merge, so GitHub squash-merges it once every
# REQUIRED check is green. This script does not wait for green and does not
# merge by itself. GitHub is the watcher: rule R2 in CLAUDE.md has every PR
# armed at open with `gh pr merge --auto --squash`, and nothing polls in a loop.
#
# WHY IT ARMS INSTEAD OF POLLING. Until 2026-09-26 this script read the required
# contexts from branch protection, polled `gh pr checks` every 20 seconds, exited
# 1 on the first red required check and merged only when all were green. It
# never armed. Once the E2E check is red BY DESIGN on an unarmed PR until the PR
# is armed (the CI-minutes change, #1446), that loop can only ever read red, so
# /ship would fail on every ordinary PR. Arming is what starts the E2E run, so
# the only order that works is: arm first, and let GitHub merge on green.
#
# WHO DECIDES "GREEN" NOW. GitHub does, from branch protection, when the
# auto-merge fires. That is the same authority the old script read (and it read
# it because a hardcoded list had drifted), but it is now applied by the thing
# that performs the merge, so there is no list here to drift. A check that has
# not reported is pending to GitHub too; auto-merge never fires on it.
#
# WHAT IT REFUSES, WITHOUT ARMING. Each refusal has its own exit code below.
#   - a PR that is not OPEN. `gh pr merge` on an already-merged PR prints "was
#     already merged" and EXITS 0; an earlier version of this script reported
#     that as its own merge. A false green, so the state is checked first.
#   - a draft PR. It is not ready, and GitHub refuses auto-merge on a draft.
#   - a PR labelled `held-for-apply`. A held migration or data-op PR arms only
#     after its apply is proven, and the label comes off BEFORE it arms
#     (CLAUDE.md). While the label is on, arming it here could merge it ahead of
#     its apply. It goes to the owner and the apply lane, unarmed.
#   - a PR whose title starts with `GATE-CHANGE`. A gate change is never armed:
#     the owner merges it by hand, and CI's "A GATE-CHANGE pull request is never
#     armed" step turns red if one is. Matched after leading spaces and in any
#     case, which is wider than CI's own match on purpose: a refusal that is too
#     wide costs a hand arm, one that is too narrow merges a gate change.
#   The label is matched in any case as well (GitHub label names are unique
#   regardless of case).
#
# HOW IT CONFIRMS. By RE-READING the PR after the arm call, never by the exit
# code of the call that was supposed to change it. It exits 0 only when that
# read shows auto-merge enabled on an OPEN PR, or the PR MERGED. The second
# happens when the checks are already green: `gh pr merge --auto` on a PR that
# can merge right now merges it at once instead of arming it. Anything else is
# exit 1, and the message says what the read showed.
#
# WHAT IT NEVER DOES. It never calls `gh pr merge` without `--auto`, never passes
# `--admin`, and never polls checks in a loop. It makes exactly one arm call.
# The PR argument must be all digits, so nothing that looks like a flag can
# reach `gh pr merge`.
#
# It does not demand GH_TOKEN. `gh` is already authenticated in the shells this
# runs in, and it honours GH_TOKEN by itself when one is set.
#
# Exit codes, so a caller can branch on them:
#   0  ARMED (auto-merge enabled, confirmed by a re-read), or MERGED at once
#   1  the arm did not take: the re-read shows neither armed nor merged
#   2  (retired: it meant "timed out polling"; this script no longer polls)
#   3  bad usage or prerequisites: no PR number, not all digits, `gh` missing or
#      not authenticated, or the PR could not be read
#   4  refused: the PR is not OPEN (already MERGED, or CLOSED)
#   5  refused: the PR is a draft
#   6  refused: the PR is labelled held-for-apply
#   7  refused: the PR title starts with GATE-CHANGE
# Every refusal (4 to 7) makes no `gh pr merge` call at all.

set -uo pipefail

usage() {
  echo "usage: merge-on-green.sh <PR_NUMBER>" >&2
  exit 3
}

PR="${1:-}"
case "$PR" in
  '' | *[!0-9]*) usage ;;
esac
if [ "$#" -gt 1 ]; then
  # The old second argument was a polling timeout in minutes. Nothing waits
  # here any more, so it has no meaning; say so rather than fail a caller that
  # still passes it.
  echo "note: extra arguments ignored (the old timeout argument no longer applies: this script arms and does not wait)" >&2
fi

command -v gh >/dev/null 2>&1 || { echo "gh is not installed" >&2; exit 3; }
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated. Run 'gh auth login', or set GH_TOKEN." >&2; exit 3; }

# ONE read, so the four facts below describe the same moment of the PR.
# Lines: state, isDraft, held-for-apply label present, title. Title is last so
# nothing it contains can shift the other three.
INFO="$(gh pr view "$PR" --json state,isDraft,labels,title \
  --jq '.state, .isDraft, any(.labels[]; (.name | ascii_downcase) == "held-for-apply"), .title' 2>/dev/null)"
if [ -z "$INFO" ]; then
  echo "could not read PR #$PR. Nothing armed." >&2
  exit 3
fi

STATE="$(printf '%s\n' "$INFO" | sed -n 1p)"
DRAFT="$(printf '%s\n' "$INFO" | sed -n 2p)"
HELD="$(printf '%s\n' "$INFO" | sed -n 3p)"
TITLE="$(printf '%s\n' "$INFO" | sed -n 4p)"

# Refuse a read that does not have the expected shape rather than guess at it.
case "$STATE" in OPEN | CLOSED | MERGED) ;; *)
  echo "could not read PR #$PR: unexpected state '$STATE'. Nothing armed." >&2; exit 3 ;;
esac
case "$DRAFT" in true | false) ;; *)
  echo "could not read PR #$PR: unexpected draft flag '$DRAFT'. Nothing armed." >&2; exit 3 ;;
esac
case "$HELD" in true | false) ;; *)
  echo "could not read PR #$PR: unexpected label answer '$HELD'. Nothing armed." >&2; exit 3 ;;
esac

if [ "$STATE" != "OPEN" ]; then
  echo "REFUSED: PR #$PR is $STATE, not OPEN. Nothing to arm." >&2
  exit 4
fi

if [ "$DRAFT" = "true" ]; then
  echo "REFUSED: PR #$PR is a draft. Mark it ready for review first; nothing armed." >&2
  exit 5
fi

if [ "$HELD" = "true" ]; then
  echo "REFUSED: PR #$PR is labelled held-for-apply. A held PR arms only after its apply is proven and the label comes off. It goes to the owner unarmed." >&2
  exit 6
fi

# Leading whitespace stripped, compared in upper case. Bash 3.2 (macOS) has no
# ${var^^}, hence tr.
TITLE_UP="$(printf '%s' "$TITLE" | tr '[:lower:]' '[:upper:]')"
TITLE_UP="${TITLE_UP#"${TITLE_UP%%[![:space:]]*}"}"
case "$TITLE_UP" in
  GATE-CHANGE*)
    echo "REFUSED: PR #$PR is titled GATE-CHANGE. A gate change is never armed; the owner merges it by hand." >&2
    exit 7 ;;
esac

echo "arming PR #$PR: gh pr merge $PR --auto --squash"
gh pr merge "$PR" --auto --squash
ARM_RC=$?
if [ "$ARM_RC" -ne 0 ]; then
  echo "the arm call exited $ARM_RC; reading the PR to see what actually happened" >&2
fi

# Confirmed by RE-READING the PR, not by the exit code above. Same reason the
# migration protocol verifies an apply against the database instead of trusting
# "applied successfully!".
AFTER="$(gh pr view "$PR" --json state,autoMergeRequest \
  --jq '.state, (.autoMergeRequest != null)' 2>/dev/null)"
FINAL="$(printf '%s\n' "$AFTER" | sed -n 1p)"
ARMED="$(printf '%s\n' "$AFTER" | sed -n 2p)"

if [ "$FINAL" = "MERGED" ]; then
  echo "MERGED #$PR at once: its required checks were already green."
  exit 0
fi
if [ "$FINAL" = "OPEN" ] && [ "$ARMED" = "true" ]; then
  echo "ARMED #$PR: GitHub squash-merges it when every required check is green."
  exit 0
fi
echo "NOT ARMED: after the arm call PR #$PR reads state '${FINAL:-unread}', auto-merge '${ARMED:-unread}'. Nothing will merge it." >&2
exit 1
