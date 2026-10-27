// ===================================================================
// A REHEARSAL OR THROWAWAY SCRIPT REFUSES TO RUN IN THE APPLY CHECKOUT.
// ===================================================================
// Strategy R17, 2026-10-26: "every rehearsal and throwaway script refuses to
// run when its working directory resolves under osteojp-prod-apply. This is
// checked in code, not only in the prompt."
//
// WHY. The apply lane's checkout is the one directory on this Mac where a
// command is a production command. On 2026-10-25 a rehearsal of an apply
// document ran its first lines there, because the prompt did not substitute
// the document's `cd` (slip 11 of that night's report). Only a fetch ran. A
// prompt rule is enforced by whoever remembers it; this is the mechanical half.
//
// WHAT IS CHECKED, EACH RESOLVED TO ITS PHYSICAL PATH FIRST:
//   - the working directory;
//   - the script's own file, so `node <apply checkout>/scripts/x.mjs` started
//     from anywhere else is refused too (every guarded script derives its repo
//     root from its own location);
//   - a `--cwd`, `--root` or `--repo-root` argument, in either `--x v` or
//     `--x=v` form, and any extra path the caller names.
//
// HOW A PATH MATCHES. One of its segments is exactly `osteojp-prod-apply`, so
// `.../osteojp-prod-apply` and `.../osteojp-prod-apply/sub` match and
// `.../osteojp-prod-apply-x` does not. The comparison is case-sensitive, on the
// path `fs.realpathSync.native` returns. `.native` and not the JS
// `fs.realpathSync`: on the Mac's case-insensitive volume the JS version keeps
// the letter case as typed (measured 2026-10-26: `.../OSTEOJP-PROD-APPLY/sub`
// came back as typed from the JS version and as `.../osteojp-prod-apply/sub`
// from `.native`), so a typed `OSTEOJP-PROD-APPLY` would have passed it.
// Symlinks and `..` resolve away before the compare. A path that does not
// exist is resolved through its nearest existing ancestor.
//
// WHAT IT DOES ON A MATCH. One line on stderr,
//   REFUSE: <script> does not run in the production apply checkout (<path>).
// and exit 86. 86 is used by no other script in this repository, so a caller
// can tell this refusal from every other failure. The refusal is a halt
// (CLAUDE.md, "a rehearsal never gets past a guard"): the answer is a scratch
// directory, never an edit to this file.
//
// WHO CALLS IT. The rehearsal, lane, seed, measurement and local-only scripts,
// as the first statement after their imports. NOT the programs the apply lane
// runs in that checkout (verified-migrate, the pre- and post-check runners,
// the journal reader, the target guard): those must run there. Shell scripts
// carry the same check in a few lines with `/bin/pwd -P` (see
// scripts/merge-on-green.sh). Tests: scripts/refuse-prod-apply-cwd.test.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROD_APPLY_SEGMENT = "osteojp-prod-apply";
export const REFUSE_EXIT_CODE = 86;
export const PATH_FLAGS = Object.freeze(["--cwd", "--root", "--repo-root"]);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The physical path of `p`: symlinks and `..` resolved, through the nearest existing ancestor. */
export function physicalPath(p) {
  const abs = path.resolve(p);
  const tail = [];
  let head = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail);
    } catch {
      const up = path.dirname(head);
      if (up === head) return abs;
      tail.unshift(path.basename(head));
      head = up;
    }
  }
}

/** True when one segment of the physical path is exactly the apply checkout's name. */
export function isUnderProdApply(p) {
  return physicalPath(p).split(path.sep).includes(PROD_APPLY_SEGMENT);
}

/** The values of `--cwd`, `--root` and `--repo-root` in `argv`, in either form. */
export function pathArguments(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    for (const flag of PATH_FLAGS) {
      if (a === flag && i + 1 < argv.length) out.push(argv[i + 1]);
      else if (a.startsWith(flag + "=")) out.push(a.slice(flag.length + 1));
    }
  }
  return out;
}

/**
 * The first checked path that resolves under the apply checkout, physical, or
 * null. `script` is a file path or a file: URL.
 */
export function prodApplyHit({ script, cwd = process.cwd(), argv = process.argv.slice(2), paths = [] } = {}) {
  const candidates = [cwd];
  if (script) candidates.push(String(script).startsWith("file:") ? fileURLToPath(script) : script);
  candidates.push(...pathArguments(argv), ...paths);
  for (const c of candidates) {
    const real = physicalPath(c);
    if (real.split(path.sep).includes(PROD_APPLY_SEGMENT)) return real;
  }
  return null;
}

/** How the refusal names the script: repo-relative when it is inside this repository. */
function scriptLabel(script) {
  if (!script) return "this script";
  const file = String(script).startsWith("file:") ? fileURLToPath(script) : path.resolve(script);
  const rel = path.relative(REPO_ROOT, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : path.basename(file);
}

/**
 * Call first, with `import.meta.url`. Returns when nothing matches; otherwise
 * prints the REFUSE line and exits 86. `code` is for a script whose exit codes
 * are fixed by a ruling (the import tooling's 0, 1, 2: it passes 1, its
 * "FAILED or refused"). `exit` and `write` are for the tests.
 */
export function refuseProdApplyCwd(script, opts = {}) {
  const { code = REFUSE_EXIT_CODE, exit = process.exit, write = (s) => process.stderr.write(s), ...where } = opts;
  const hit = prodApplyHit({ script, ...where });
  if (hit === null) return;
  write(`REFUSE: ${scriptLabel(script)} does not run in the production apply checkout (${hit}).\n`);
  exit(code);
}
