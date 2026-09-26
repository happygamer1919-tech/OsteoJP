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
#   - a draft PR. A draft is not ready for review, so it is not ready to merge.
#   - a PR labelled `held-for-apply`. A held migration or data-op PR arms only
#     after its apply is proven, and the label comes off BEFORE it arms
#     (CLAUDE.md). While the label is on, arming it here could merge it ahead of
#     its apply. It goes to the owner and the apply lane, unarmed.
#   - a PR whose title starts with `GATE-CHANGE`. A gate change is never armed:
#     the owner merges it by hand, and CI's "A GATE-CHANGE pull request is never
#     armed" step turns red if one is. Matched after leading spaces and in any
#     case, which is wider than CI's own match on purpose: a refusal that is too
#     wide sends an ordinary PR to the owner, one that is too narrow merges a
#     gate change.
#   The label is matched in any case as well, for the same reason.
#   A held or GATE-CHANGE PR can already be armed (by hand, before the label
#   went on or against the order CLAUDE.md sets). Labels do not stop auto-merge,
#   so GitHub merges it on green anyway. The first read therefore takes the
#   auto-merge state too, and such a PR gets its own exit code and an ALREADY
#   ARMED message, never "unarmed". This is checked before the draft refusal,
#   so a draft that reads armed is reported as armed, not only as a draft. The
#   script still makes no merge call: it reports, and the caller disarms.
#
# HOW IT CONFIRMS. By RE-READING the PR after the arm call, never by the exit
# code of the call that was supposed to change it. It exits 0 only when that
# read shows auto-merge enabled on an OPEN PR, or the PR MERGED. The second
# happens when the checks are already green: `gh pr merge --auto` on a PR that
# can merge right now merges it at once instead of arming it. A read that
# shows the PR open and unarmed, or closed, is exit 1, and the message says
# what the read showed. A re-read that fails, or comes back in a shape it does
# not expect, proves nothing either way: the arm may have taken. That is exit
# 9, UNKNOWN, never "not armed".
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
#   6  refused: the PR is labelled held-for-apply (and is not armed)
#   7  refused: the PR title starts with GATE-CHANGE (and is not armed)
#   8  refused, and ALREADY ARMED: a held-for-apply or GATE-CHANGE PR already
#      has auto-merge enabled, so GitHub merges it on green unless it is
#      disarmed (`gh pr merge <PR> --disable-auto`)
#   9  UNKNOWN: the arm call ran but the re-read failed or had an unexpected
#      shape, so whether the PR is armed is not known. It may merge on green.
# Every refusal (4 to 8) makes no `gh pr merge` call at all.

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

# ONE read, so the five facts below describe the same moment of the PR.
# Lines: state, isDraft, held-for-apply label present, auto-merge already
# enabled, title. Title is last so nothing it contains can shift the others.
INFO="$(gh pr view "$PR" --json state,isDraft,labels,autoMergeRequest,title \
  --jq '.state, .isDraft, any(.labels[]; (.name | ascii_downcase) == "held-for-apply"), (.autoMergeRequest != null), .title' 2>/dev/null)"
if [ -z "$INFO" ]; then
  echo "could not read PR #$PR. Nothing armed." >&2
  exit 3
fi

STATE="$(printf '%s\n' "$INFO" | sed -n 1p)"
DRAFT="$(printf '%s\n' "$INFO" | sed -n 2p)"
HELD="$(printf '%s\n' "$INFO" | sed -n 3p)"
ARMED_BEFORE="$(printf '%s\n' "$INFO" | sed -n 4p)"
TITLE="$(printf '%s\n' "$INFO" | sed -n 5p)"

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
case "$ARMED_BEFORE" in true | false) ;; *)
  echo "could not read PR #$PR: unexpected auto-merge answer '$ARMED_BEFORE'. Nothing armed." >&2; exit 3 ;;
esac

if [ "$STATE" != "OPEN" ]; then
  echo "REFUSED: PR #$PR is $STATE, not OPEN. Nothing to arm." >&2
  exit 4
fi

# Leading whitespace stripped, compared in upper case. Bash 3.2 (macOS) has no
# ${var^^}, hence tr.
TITLE_UP="$(printf '%s' "$TITLE" | tr '[:lower:]' '[:upper:]')"
TITLE_UP="${TITLE_UP#"${TITLE_UP%%[![:space:]]*}"}"
GATE=false
case "$TITLE_UP" in GATE-CHANGE*) GATE=true ;; esac

# A PR this script must never arm that is armed ALREADY. Before the draft
# refusal on purpose: what matters here is the auto-merge state, draft or not.
if [ "$ARMED_BEFORE" = "true" ] && { [ "$HELD" = "true" ] || [ "$GATE" = "true" ]; }; then
  if [ "$HELD" = "true" ] && [ "$GATE" = "true" ]; then
    WHY="is labelled held-for-apply and titled GATE-CHANGE"
  elif [ "$HELD" = "true" ]; then
    WHY="is labelled held-for-apply"
  else
    WHY="is titled GATE-CHANGE"
  fi
  echo "REFUSED, AND ALREADY ARMED: PR #$PR $WHY, and auto-merge is ALREADY enabled on it. GitHub squash-merges it as soon as its required checks are green, labels do not stop it. This script made no merge call. Disarm it now: gh pr merge $PR --disable-auto" >&2
  exit 8
fi

if [ "$DRAFT" = "true" ]; then
  echo "REFUSED: PR #$PR is a draft. Mark it ready for review first; nothing armed." >&2
  exit 5
fi

if [ "$HELD" = "true" ]; then
  echo "REFUSED: PR #$PR is labelled held-for-apply. A held PR arms only after its apply is proven and the label comes off. It goes to the owner unarmed." >&2
  exit 6
fi

if [ "$GATE" = "true" ]; then
  echo "REFUSED: PR #$PR is titled GATE-CHANGE. A gate change is never armed; the owner merges it by hand." >&2
  exit 7
fi

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

# A failed or malformed re-read shows nothing about the arm, which may have
# taken. Say so; never report it as "not armed".
case "$FINAL:$ARMED" in OPEN:true | OPEN:false | CLOSED:true | CLOSED:false | MERGED:true | MERGED:false) ;; *)
  echo "UNKNOWN: the arm call exited $ARM_RC, and PR #$PR could not be re-read after it (state '${FINAL:-unread}', auto-merge '${ARMED:-unread}'). It may be armed, and then GitHub merges it on green. Read it before reporting: gh pr view $PR --json state,autoMergeRequest" >&2
  exit 9 ;;
esac

if [ "$FINAL" = "MERGED" ]; then
  echo "MERGED #$PR at once: its required checks were already green."
  exit 0
fi
if [ "$FINAL" = "OPEN" ] && [ "$ARMED" = "true" ]; then
  echo "ARMED #$PR: GitHub squash-merges it when every required check is green."
  exit 0
fi
echo "NOT ARMED: after the arm call PR #$PR reads state '$FINAL', auto-merge '$ARMED'. Nothing will merge it." >&2
exit 1
