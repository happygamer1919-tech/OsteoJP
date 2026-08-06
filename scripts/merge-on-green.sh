#!/usr/bin/env bash
# Poll a pull request and squash-merge it once every REQUIRED check is green.
#
# THE REQUIRED SET IS READ FROM BRANCH PROTECTION, NEVER HARDCODED, and that is
# the whole point of this rewrite. The previous version carried a literal list of
# three contexts. On 2026-08-06 the owner made a fourth one required
# ("Validate spec + drift check") and the script did not know: it would have
# declared GREEN while that check was still pending, fired a merge GitHub then
# refused, and — if the check had gone on to fail — reported a green that was
# never true. Anything that duplicates a list branch protection owns eventually
# disagrees with it. Same defect class as the path-filtered required check fixed
# in W13-CI-03 the same day: both were facts about branch protection kept
# somewhere branch protection could not update.
#
# It also no longer demands GH_TOKEN. `gh` is already authenticated in the shells
# this runs in, and it honours GH_TOKEN by itself when one is set, so requiring
# it explicitly only produced a failure mode where a perfectly usable session was
# refused. Both paths work now; neither is mandatory.
#
# Exit codes, so a caller can branch on them:
#   0  merged
#   1  a required check failed, or the merge call was refused — NOT merged
#   2  timed out with checks still pending — NOT merged
#   3  bad usage / prerequisites missing
#
# It NEVER merges on a partial picture: a context that has not reported yet is
# PENDING, not green. That distinction is what the old script lost.

set -uo pipefail

PR="${1:-}"
if [ -z "$PR" ]; then
  echo "usage: merge-on-green.sh <PR_NUMBER> [TIMEOUT_MINUTES]" >&2
  exit 3
fi
TIMEOUT_MIN="${2:-30}"

command -v gh >/dev/null 2>&1 || { echo "gh is not installed" >&2; exit 3; }
gh auth status >/dev/null 2>&1 || {
  echo "gh is not authenticated. Run 'gh auth login', or set GH_TOKEN." >&2; exit 3; }

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# REFUSE ANYTHING THAT IS NOT OPEN, and this guard is here because the first
# version of this rewrite reported success without it. `gh pr merge` on an
# already-merged PR prints "was already merged" and EXITS 0, so the script
# announced "MERGED" for a merge it had not performed. A false green in the tool
# whose entire job is to distinguish green from not-green.
STATE="$(gh pr view "$PR" --json state --jq .state)"
if [ "$STATE" != "OPEN" ]; then
  echo "PR #$PR is $STATE, not OPEN. Nothing to merge." >&2
  exit 3
fi

BASE="$(gh pr view "$PR" --json baseRefName --jq .baseRefName)"

# The authority on what "green" means. If branch protection is unreadable, stop
# rather than guess a list — guessing is exactly what broke the last version.
REQUIRED="$(gh api "repos/$REPO/branches/$BASE/protection" \
  --jq '.required_status_checks.contexts[]' 2>/dev/null)"
if [ -z "$REQUIRED" ]; then
  echo "could not read required contexts for $REPO@$BASE." >&2
  echo "Refusing to merge on a guessed list." >&2
  exit 3
fi

echo "PR #$PR -> $REPO@$BASE"
echo "required contexts (from branch protection):"
printf '%s\n' "$REQUIRED" | sed 's/^/  - /'

DEADLINE=$(( $(date +%s) + TIMEOUT_MIN * 60 ))

while :; do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "TIMEOUT after ${TIMEOUT_MIN}m with checks still pending. NOT merged." >&2
    exit 2
  fi

  CHECKS="$(gh pr checks "$PR" 2>/dev/null)"
  verdict=GREEN
  while IFS= read -r ctx; do
    [ -z "$ctx" ] && continue
    state="$(printf '%s\n' "$CHECKS" | grep -F "$ctx" | head -1 | cut -f2)"
    case "$state" in
      pass) ;;
      fail|failure|cancelled|timed_out)
        echo "RED: '$ctx' = ${state:-missing}" >&2
        verdict=RED
        break ;;
      # Includes the empty case: a context that has not reported at all is
      # PENDING. Treating "absent" as green is how a required check that never
      # runs would slip a merge through.
      *) verdict=PENDING ;;
    esac
  done <<< "$REQUIRED"

  printf '%s %s\n' "$(date +%H:%M:%S)" "$verdict"

  case "$verdict" in
    RED)
      echo "a required check failed - NOT merging" >&2
      exit 1 ;;
    GREEN)
      echo "all required contexts green - merging"
      gh pr merge "$PR" --squash --delete-branch
      # Confirmed by RE-READING the state, not by the exit code of the call that
      # was supposed to change it. Same reason the migration protocol verifies an
      # apply against the database instead of trusting "applied successfully!".
      FINAL="$(gh pr view "$PR" --json state --jq .state)"
      if [ "$FINAL" = "MERGED" ]; then
        echo "MERGED #$PR"
        exit 0
      fi
      echo "merge did NOT land - PR is $FINAL (branch out of date, conflict, or review required)" >&2
      exit 1 ;;
  esac

  sleep 20
done
