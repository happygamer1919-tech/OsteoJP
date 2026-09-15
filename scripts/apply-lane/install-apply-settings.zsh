cat > "${HOME}/.osteojp-ps3.s" <<'P_S3_PIN_END'
7d43d62f4672ba94f6d3ee859222d50175f2936e74e9edefd868fcf933d9bf40  .osteojp-ps3.z
P_S3_PIN_END
cat > "${HOME}/.osteojp-ps3.z" <<'P_S3_END'
(
cd ~
shasum -a 256 -c .osteojp-ps3.s && V= || exit 9
set -eu
T=$(mktemp -d)
fin() {
c=${?}
rm -rf "${T}" .osteojp-ps3.z .osteojp-ps3.s
test "${c}" = 0 || echo "STOP: P-S3 did not complete. Read the lines above."
}
trap fin EXIT
stop() { echo "STOP: ${1}"; exit 1; }
R=/Users/ivan/Documents/Projects/GitHub/OsteoJP${V}
J=osteojp-apply-settings.json
I=install-apply-settings.mjs
G="${HOME}/${J}"
SJ=ea1a9630f2a1ee6c418dad3ecd2e64a56ef25cc194b988989c4058ed8a06f195
SI=b86fe1605da8866d259bc80009ead1e53b4462e6eea5484ce5a66373068d862f
git -C "${R}" fetch -q origin
git -C "${R}" show "origin/main:scripts/apply-lane/${J}" > "${T}/${J}"
git -C "${R}" show "origin/main:scripts/apply-lane/${I}" > "${T}/${I}"
HJ=$(shasum -a 256 "${T}/${J}" | cut -c 1-64)
HI=$(shasum -a 256 "${T}/${I}" | cut -c 1-64)
test "${HJ}" = "${SJ}" || stop "${J} is not the reviewed file. Nothing written."
test "${HI}" = "${SI}" || stop "${I} is not the reviewed file. Nothing written."
node "${T}/${I}" --canonical "${T}/${J}" --target "${G}" --expect-sha256 "${SJ}"
HG=$(shasum -a 256 "${G}" | cut -c 1-64)
test "${HG}" = "${SJ}" || stop "${G} does not hold the reviewed file."
cat > "${T}/check.cjs" <<'JS_END'
const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
const n = j.allow.filter((r) => r.startsWith("OsteoJP production")).length;
const e = j.environment.filter((r) => r.includes("dfotoodqvmjhbdcxyaxf"));
const s = j.environment.filter((r) => r.includes("zero tracked files"));
console.log("OsteoJP allow entries " + n + " (need 2)");
console.log("environment entries naming the prod ref " + e.length);
console.log("stale user-level environment entries inherited " + s.length);
process.exit(n === 2 && e.length > 0 ? 0 : 1);
JS_END
claude --settings "${G}" auto-mode config > "${T}/config.json"
node "${T}/check.cjs" < "${T}/config.json"
echo "P-S3 COMPLETE: ${G} holds the reviewed file, sha256 ${HG}."
)
P_S3_END
zsh -f -e -u "${HOME}/.osteojp-ps3.z"
