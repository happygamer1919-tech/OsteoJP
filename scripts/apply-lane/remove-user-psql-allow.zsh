(
set -eu
SETTINGS="${HOME}/.claude/settings.json"
node --input-type=module - "${SETTINGS}" <<'EOF'
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
const target = process.argv[2];
const RULE = "Bash(psql:*)";
const no = (x) => x === false;
function stop(why) {
  console.error("STOP: " + why);
  console.error("STOP: " + target + " was not changed.");
  process.exit(1);
}
const ser = (x) => JSON.stringify(x, null, 2) + "\n";
const serOut = ser;
let raw;
try { raw = fs.readFileSync(target, "utf8"); } catch (e) { stop("cannot read it (" + (e.code || e.message) + ")."); }
let before;
try { before = JSON.parse(raw); } catch (e) { stop("it is not valid JSON (" + e.message + ")."); }
if (no(ser(before) === raw)) stop("it is not in the 2-space JSON form Claude Code writes, so rewriting it would change more than one entry.");
const allow = before.permissions && Array.isArray(before.permissions.allow) ? before.permissions.allow : [];
const others = allow.filter((r) => (r === RULE ? false : /^Bash\(\s*psql(\s|:|\)|$)/.test(r)));
if (others.length > 0) stop("it also holds " + JSON.stringify(others) + ", which this command does not remove. Decide on those first.");
if (no(allow.includes(RULE))) {
  console.log("ABSENT: " + RULE + " is not in permissions.allow in " + target + ". Nothing to do.");
  process.exit(0);
}
const after = structuredClone(before);
after.permissions.allow = allow.filter((r) => (r === RULE ? false : true));
const text = serOut(after);
let reparsed;
try { reparsed = JSON.parse(text); } catch (e) { stop("the produced JSON does not parse (" + e.message + ")."); }
if (no(isDeepStrictEqual(reparsed, after))) stop("the produced JSON does not round-trip.");
const a = structuredClone(before);
const b = structuredClone(reparsed);
delete a.permissions.allow;
delete b.permissions.allow;
if (no(isDeepStrictEqual(a, b))) stop("more than permissions.allow would change.");
if (reparsed.permissions.allow.includes(RULE)) stop("the rule is still in the produced JSON.");
const mode = fs.statSync(target).mode & 0o777;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const backup = target + ".bak-" + stamp;
try {
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(backup, mode);
} catch (e) {
  stop("could not write the backup " + backup + " (" + e.message + ").");
}
const tmp = target + ".tmp-" + process.pid;
try {
  fs.writeFileSync(tmp, text, { flag: "wx", mode });
  if (no(fs.readFileSync(tmp, "utf8") === text)) throw new Error("the temp file did not read back");
  fs.renameSync(tmp, target);
} catch (e) {
  fs.rmSync(tmp, { force: true });
  stop("could not replace it (" + e.message + "). The backup is at " + backup + ".");
}
console.log("REMOVED: " + RULE + " from permissions.allow in " + target + ".");
console.log("Backup of the previous file: " + backup);
console.log("permissions.allow is now: " + JSON.stringify(reparsed.permissions.allow));
EOF
)
