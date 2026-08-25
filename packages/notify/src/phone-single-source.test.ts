// THERE IS EXACTLY ONE normalizePhonePT IN THIS REPOSITORY, AND THIS IS WHAT
// KEEPS IT THAT WAY.
//
// It replaces apps/web/lib/reminders/phone-parity.test.ts, which imported one
// copy of the function across the app boundary to compare it against the other.
// That test was answering the right question with the wrong instrument: it
// could only ever prove the two copies it KNEW ABOUT agreed. A third copy - the
// one the Fisiozero adapter would have needed, because packages cannot import
// from apps - would have been invisible to it.
//
// So the guard moved up a level. It no longer asks "do the copies agree"; it
// asks "is there more than one", which is the property that actually protects
// the OTP login, the reminder send path, the guest booking and the import.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every tracked file that DEFINES the function, by git rather than by walking. */
function definitionSites(): string[] {
  const out = execFileSync(
    "git",
    ["grep", "-l", "-E", "export (const|function) normalizePhonePT", "--", "*.ts", "*.tsx"],
    { cwd: REPO, encoding: "utf8" },
  );
  return out.split("\n").filter((l) => l.trim() !== "");
}

describe("normalizePhonePT has a single source of truth", () => {
  it("is DEFINED in exactly one file, and that file is in packages/notify", () => {
    const sites = definitionSites();
    assert.deepEqual(
      sites,
      ["packages/notify/src/phone.ts"],
      `normalizePhonePT must be defined once. Found: ${JSON.stringify(sites)}. ` +
        `If a consumer cannot import @osteojp/notify, add the workspace dependency - ` +
        `do not copy the function. docs/migration-notes.md 2026-07-07: ` +
        `"Reuse normalizePhonePT rather than re-deriving the rules."`,
    );
  });

  it("no file under apps/ defines it any more", () => {
    // The two former homes. Named explicitly so a revert of the move is loud
    // rather than merely failing the count above.
    const sites = definitionSites();
    expect(sites.some((s) => s.startsWith("apps/"))).toBe(false);
  });

  it("the canonical definition still behaves as both copies did", () => {
    // A positive control. Both assertions above are "there is not a second
    // one", and they would pass just as happily over a file that exports a
    // broken function - or no function at all.
    expect(normalize("912345678")).toBe("+351912345678");
    expect(normalize("+351 912-345-678")).toBe("+351912345678");
    expect(normalize("00351912345678")).toBe("+351912345678");
    expect(normalize("351912345678")).toBe("+351912345678");
    expect(normalize("212345678")).toBe("+351212345678");
    expect(normalize("+44 7700 900000")).toBeNull();
    expect(normalize("")).toBeNull();
  });
});

// Imported here rather than at the top so the source-scan tests above run even
// if the module itself fails to load.
import { normalizePhonePT as normalize } from "./phone";
