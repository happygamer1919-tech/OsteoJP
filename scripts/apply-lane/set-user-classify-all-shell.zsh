cat > "${HOME}/.osteojp-pu1.s" <<'PU1_PIN_END'
15282c7d59c05b0f47f031757f8533d0f0923440f74b7be3066ec359ab094157  .osteojp-pu1.z
PU1_PIN_END
cat > "${HOME}/.osteojp-pu1.z" <<'PU1_END'
(
cd ~
shasum -a 256 -c .osteojp-pu1.s && V= || exit 9
set -eu
fin() {
c=${?}
rm -f .osteojp-pu1.z .osteojp-pu1.s
test "${c}" = 0 || echo "STOP: PU-1 did not complete. Read the lines above."
}
trap fin EXIT
test -z "${CLAUDE_CONFIG_DIR:-}" || echo "STOP: CLAUDE_CONFIG_DIR is set."
test -z "${CLAUDE_CONFIG_DIR:-}"
S="${HOME}/.claude/settings.json${V}"
node --input-type=module - "${S}" <<'JS_END'
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
const target = process.argv[2];
const no = (x) => x === false;
const isObj = (v) => typeof v === "object" && no(v === null);
function stop(why) {
  console.error("STOP: " + why);
  console.error("STOP: " + target + " was not changed.");
  process.exit(1);
}
const ser = (x) => JSON.stringify(x, null, 2) + "\n";
const serOut = ser;
let raw;
try {
  raw = fs.readFileSync(target, "utf8");
} catch (e) {
  stop("cannot read it (" + (e.code || e.message) + ").");
}
let before;
try {
  before = JSON.parse(raw);
} catch (e) {
  stop("it is not valid JSON (" + e.message + ").");
}
if (no(isObj(before)) || Array.isArray(before)) {
  stop("it is not a JSON object.");
}
if (no(ser(before) === raw)) {
  stop("it is not in the 2-space JSON form Claude Code writes.");
}
const auto = before.autoMode;
if (no(auto === undefined) && (no(isObj(auto)) || Array.isArray(auto))) {
  stop("autoMode is not an object.");
}
const had = no(auto === undefined) && Object.hasOwn(auto, "classifyAllShell");
if (had && auto.classifyAllShell === true) {
  console.log("ALREADY SET: autoMode.classifyAllShell is true. No change.");
  process.exit(0);
}
if (had) {
  stop("autoMode.classifyAllShell is present and not true. Decide first.");
}
if (auto && Array.isArray(auto.environment)) {
  const n = auto.environment.length;
  console.log("NOTE: autoMode.environment still holds " + n + " entries.");
  console.log("NOTE: claude auto-mode reset deletes the WHOLE autoMode");
  console.log("NOTE: section, classifyAllShell included. Reset BEFORE this.");
}
const after = structuredClone(before);
after.autoMode = { ...(auto || {}), classifyAllShell: true };
const text = serOut(after);
let back;
try {
  back = JSON.parse(text);
} catch (e) {
  stop("the produced JSON does not parse (" + e.message + ").");
}
if (no(isDeepStrictEqual(back, after))) {
  stop("the produced JSON does not round-trip.");
}
const rest = structuredClone(back);
delete rest.autoMode.classifyAllShell;
if (auto === undefined) delete rest.autoMode;
if (no(isDeepStrictEqual(rest, before))) {
  stop("more than autoMode.classifyAllShell would change.");
}
const mode = fs.statSync(target).mode & 0o777;
const stamp = new Date().toISOString().replace(/[-:]/g, "");
const backup = target + ".bak-" + stamp.replace(/\.\d+Z$/, "Z");
try {
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, mode);
} catch (e) {
  stop("could not write the backup " + backup + " (" + e.message + ").");
}
const tmp = target + ".tmp-" + process.pid;
try {
  fs.writeFileSync(tmp, text, { flag: "wx", mode });
  if (no(fs.readFileSync(tmp, "utf8") === text)) {
    throw new Error("the temp file did not read back");
  }
  fs.renameSync(tmp, target);
} catch (e) {
  fs.rmSync(tmp, { force: true });
  stop("could not replace it (" + e.message + "). Backup: " + backup);
}
const check = JSON.parse(fs.readFileSync(target, "utf8"));
if (no(check.autoMode.classifyAllShell === true)) {
  console.error("STOP: the file was written but the key does not read true.");
  console.error("STOP: the previous file is at " + backup);
  process.exit(1);
}
console.log("SET: autoMode.classifyAllShell = true in " + target);
console.log("Backup of the previous file: " + backup);
JS_END
echo "PU-1 COMPLETE: classifyAllShell is on. It applies to NEW sessions only."
)
PU1_END
zsh -f -e -u "${HOME}/.osteojp-pu1.z"
