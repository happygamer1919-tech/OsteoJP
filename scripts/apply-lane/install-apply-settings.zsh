(
set -eu
REPO=/Users/ivan/Documents/Projects/GitHub/OsteoJP
TARGET="${HOME}/osteojp-apply-settings.json"
T=$(mktemp -d)
trap 'rm -rf "${T}"' EXIT
git -C "${REPO}" fetch -q origin
git -C "${REPO}" show origin/main:scripts/apply-lane/osteojp-apply-settings.json > "${T}/osteojp-apply-settings.json"
git -C "${REPO}" show origin/main:scripts/apply-lane/install-apply-settings.mjs > "${T}/install-apply-settings.mjs"
test "$(shasum -a 256 "${T}/install-apply-settings.mjs" | cut -d ' ' -f 1)" = "b86fe1605da8866d259bc80009ead1e53b4462e6eea5484ce5a66373068d862f" || { echo "STOP: install-apply-settings.mjs on origin/main is not the reviewed file. Nothing was written."; exit 1; }
node "${T}/install-apply-settings.mjs" --canonical "${T}/osteojp-apply-settings.json" --target "${TARGET}" --expect-sha256 ea1a9630f2a1ee6c418dad3ecd2e64a56ef25cc194b988989c4058ed8a06f195
claude --settings "${TARGET}" auto-mode config | node -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); const n = j.allow.filter((r) => r.startsWith("OsteoJP production")).length; const e = j.environment.filter((r) => r.includes("dfotoodqvmjhbdcxyaxf")).length; const s = j.environment.filter((r) => r.includes("zero tracked files")).length; console.log("classifier config with this file: OsteoJP allow entries " + n + " (need 2), environment entries naming the prod ref " + e + ", stale user-level environment entries still inherited " + s); process.exit(n === 2 && e > 0 ? 0 : 1)'
)
