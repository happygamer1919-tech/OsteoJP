#!/usr/bin/env node
// THE GATE FREEZE CHECK. Required, and it fails when a gate file moves.
//
// ==========================================================================
// THE THREE RULES, AND WHAT EACH ONE STOPS
// ==========================================================================
// A. Every file in the manifest still exists and still hashes to its pin, and
//    `package.json`'s `scripts` block still hashes to its pin.
//    -> stops: editing a guard, deleting a guard, or rewriting `test:scripts`
//       to run nothing, inside an ordinary PR.
//
// B. If the MANIFEST ITSELF differs from the base branch, the pull request's
//    title must begin with `GATE-CHANGE`.
//    -> stops the obvious way round rule A: edit the guard AND regenerate the
//       manifest in the same PR. Without this rule the freeze is decoration.
//
// C. In a GATE-CHANGE pull request, every changed path must be a gate file or
//    the manifest.
//    -> stops a GATE-CHANGE PR from carrying a feature, which is how a hand
//       merge stops being a review of the gate change and becomes a review of
//       everything.
//
// Rule A runs everywhere, including locally. Rules B and C need the pull
// request's base ref and title, so they run only in CI, where both are present.
//
// ==========================================================================
// WHAT THIS CHECK DOES NOT DO, SAID PLAINLY
// ==========================================================================
// It cannot stop the OWNER changing a gate - it is not meant to. It cannot see
// branch protection, which lives in GitHub and not in this repository. And a
// brand-new gate file that no manifest entry names is NOT frozen until the next
// GATE-CHANGE regenerates the manifest: adding a guard is not weakening one, and
// the alternative would red every PR that adds a test.
//
// ADDING A FILE IS ALLOWED, MODIFYING AND DELETING ARE NOT. That asymmetry is
// deliberate and is the whole reason this is usable: of the last 60 squashed
// PRs, 9 modified a gate file and 2 only added one.

import { join } from "node:path";
import { execFileSync } from "node:child_process";

import {
  ROOT,
  MANIFEST_PATH,
  compare,
  hashAll,
  isGateFile,
  packageScriptsHash,
  readManifest,
} from "./gate-manifest.mjs";

const RED = [];
const NOTE = [];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

// --------------------------------------------------------------------------
// RULE A - the pins hold.
// --------------------------------------------------------------------------
const manifest = readManifest();
const { changed, removed, added, pkgMoved } = compare(
  manifest,
  hashAll(),
  packageScriptsHash(),
);

// --------------------------------------------------------------------------
// Is this a GATE-CHANGE pull request? Title comes from the workflow, which
// reads `github.event.pull_request.title`. Absent locally.
// --------------------------------------------------------------------------
const title = process.env.GATE_PR_TITLE ?? "";
const baseRef = process.env.GATE_BASE_REF ?? "";
const isGateChange = /^GATE-CHANGE\b/.test(title.trim());

if (changed.length || removed.length || pkgMoved) {
  if (!isGateChange) {
    RED.push(
      "A GATE FILE MOVED IN AN ORDINARY PULL REQUEST.\n" +
        [
          ...changed.map((p) => `  CHANGED  ${p}`),
          ...removed.map((p) => `  DELETED  ${p}`),
          ...(pkgMoved ? ["  CHANGED  package.json -> scripts block"] : []),
        ].join("\n") +
        "\n\n" +
        "SR-71: a lane never edits a gate to pass its own PR. It halts and cards it.\n" +
        "If this change to the gate is genuinely wanted, take it OUT of this pull\n" +
        "request and open a separate one titled `GATE-CHANGE: <what and why>` that\n" +
        "touches nothing else, leave it UNARMED, and ask the owner to merge it by hand.\n" +
        `Regenerate the pins there with: node scripts/gate-manifest.mjs --write`,
    );
  } else {
    NOTE.push(
      `GATE-CHANGE pull request: ${changed.length} changed, ${removed.length} removed` +
        `${pkgMoved ? ", package.json scripts moved" : ""}. The pins must be regenerated in ` +
        `this same PR or rule A below will still fail.`,
    );
  }
}

if (added.length) {
  NOTE.push(
    `${added.length} gate file(s) exist that the manifest does not name. This is ` +
      `ALLOWED - adding a guard is not weakening one - and they are unfrozen until the ` +
      `next GATE-CHANGE regenerates the manifest:\n` +
      added.map((p) => `  NEW  ${p}`).join("\n"),
  );
}

// --------------------------------------------------------------------------
// RULES B and C - CI only, because they need the base ref and the PR title.
// --------------------------------------------------------------------------
if (baseRef) {
  let changedPaths = [];
  try {
    changedPaths = git(["diff", "--name-only", `origin/${baseRef}...HEAD`])
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    // FAIL CLOSED. A check that cannot see the diff has not performed the
    // check, and reporting success would be the exact defect this repository
    // keeps shipping. `fetch-depth: 0` is what makes the three-dot diff work.
    RED.push(
      "COULD NOT DIFF AGAINST THE BASE BRANCH, so rules B and C were not performed.\n" +
        `  base: origin/${baseRef}\n  ${String(err).split("\n")[0]}\n` +
        "The checkout needs `fetch-depth: 0`. This is a failure, not a skip.",
    );
  }

  const manifestMoved = changedPaths.includes(MANIFEST_PATH);

  // RULE B
  if (manifestMoved && !isGateChange) {
    RED.push(
      `THE MANIFEST ITSELF WAS EDITED IN A PULL REQUEST NOT TITLED GATE-CHANGE.\n` +
        `  ${MANIFEST_PATH}\n` +
        `  title: ${title || "(empty)"}\n\n` +
        "This is the way round rule A - change the guard and re-pin it in one PR - and\n" +
        "it is refused. The manifest moves only in a PR titled `GATE-CHANGE`.",
    );
  }

  // RULE C
  //
  // THE FREEZE'S OWN README IS NOT A STRAY. It decides no verdict, so it is
  // deliberately NOT in the manifest (2026-09-22: the set holds only files that
  // decide a required check's verdict). But it documents the protocol, and a
  // rule that forbids a GATE-CHANGE PR from carrying its own documentation
  // means the protocol can never be explained in the change that alters it.
  // Measured: this exact PR tripped on it before the allowance existed.
  //
  // ONE PATH, NOT A PATTERN. `scripts/*.md` would let any new markdown ride
  // along; this is the single file and nothing else.
  const GATE_DOCS = new Set(["scripts/GATE-FREEZE-README.md"]);
  if (isGateChange && changedPaths.length) {
    const strays = changedPaths.filter(
      (p) => p !== MANIFEST_PATH && !isGateFile(p) && !GATE_DOCS.has(p),
    );
    if (strays.length) {
      RED.push(
        "A GATE-CHANGE PULL REQUEST MUST TOUCH NOTHING ELSE.\n" +
          strays.map((p) => `  STRAY  ${p}`).join("\n") +
          "\n\nThe owner merges these by hand, and a hand merge is only a review of the\n" +
          "gate change if the gate change is all that is in it. Move the rest to its own PR.",
      );
    }
  }
} else {
  NOTE.push(
    "GATE_BASE_REF is not set, so rules B (the manifest moved) and C (a GATE-CHANGE " +
      "carries nothing else) were NOT checked. That is expected on a local run and is " +
      "NOT expected in CI - if you are reading this in a CI log, the workflow is wrong.",
  );
}

// --------------------------------------------------------------------------
for (const n of NOTE) console.log(`note: ${n}\n`);

if (RED.length) {
  console.error("GATE FREEZE: FAILED\n");
  for (const r of RED) console.error(r + "\n");
  process.exitCode = 1;
} else {
  const n = Object.keys(manifest.files ?? {}).length;
  console.log(
    `GATE FREEZE: ${n} gate files match their pins` +
      `${isGateChange ? " (GATE-CHANGE pull request)" : ""}, package.json scripts unchanged.`,
  );
}
