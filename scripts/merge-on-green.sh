#!/usr/bin/env bash
set -euo pipefail
PR="${1:?usage: merge-on-green.sh <PR_NUMBER>}"
: "${GH_TOKEN:?set GH_TOKEN in the environment}"
REPO="happygamer1919-tech/OsteoJP"
while true; do
  SHA=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/pulls/$PR" | python3 -c "import sys,json;print(json.load(sys.stdin)['head']['sha'])")
  S=$(curl -s -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/commits/$SHA/check-runs" | python3 -c "
import sys,json
req={'Lint + typecheck + test','DB-gated tests (RLS isolation, seeded DB)','Playwright E2E (seeded DB)'}
r={c['name']:(c['status'],c['conclusion']) for c in json.load(sys.stdin)['check_runs']}
g={n:r.get(n) for n in req}
print('GREEN' if all(v and v[0]=='completed' and v[1]=='success' for v in g.values()) else ('RED' if any(v and v[1] in ('failure','cancelled','timed_out') for v in g.values()) else 'PENDING'))")
  echo "$SHA $S"
  [ "$S" = GREEN ] && break
  [ "$S" = RED ] && { echo "a required check failed"; exit 1; }
  sleep 20
done
curl -s -X PUT -H "Authorization: token $GH_TOKEN" -H 'Content-Type: application/json' -d '{"merge_method":"squash"}' "https://api.github.com/repos/$REPO/pulls/$PR/merge"
