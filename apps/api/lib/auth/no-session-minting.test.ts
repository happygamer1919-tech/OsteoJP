/**
 * W13-03 / WF-08 (R5) — NO PATH MINTS A PATIENT SESSION EXCEPT A VERIFIED OTP.
 *
 * This is the refusal-style test the ruling required, "per the Decision B
 * precedent". It is deliberately NOT a test of `sendPatientActivation`, because
 * that function is gone: after a deletion there is no function left to assert
 * on, so the enforceable artefact is the PROPERTY the deletion protected. That
 * property outlives the code it was written about, which is the whole point —
 * a test that died with its subject would have protected nothing.
 *
 * WHAT WAS DELETED AND WHY (owner ruling WF-08, 2026-08-05).
 * `apps/api/lib/auth/activation.ts` minted a Supabase RECOVERY link and
 * delivered it by SMS. A recovery link is a session grant. Decision D
 * (WAVE-13.md §1.4) permits no session from anything but a verified 6-digit
 * SMS OTP: "No password, no magic link, no session minted from any other
 * artefact." The module was dead — every one of its nine exports was checked
 * across apps/ and packages/ and none had a caller outside the module and its
 * own test — so it was deleted rather than left dormant. Dead code that grants
 * a session is one route handler away from live code that grants a session, and
 * it was only inert because the notification registry happened to gate it.
 *
 * WHY A SOURCE SCAN RATHER THAN A BEHAVIOURAL TEST. The property is "no code
 * path does X". A behavioural test can only prove that the paths it thought to
 * call do not do X, which is exactly the assurance that failed here: the
 * registry gate made activation unreachable, and it still sat in the tree for
 * two waves as a working session-minting primitive. A scan asserts absence
 * across the whole app, including paths nobody remembered to test.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const API_ROOT = join(__dirname, "..", "..");

/**
 * The Supabase surface that mints or resets a credential. Storage and database
 * admin calls are NOT here: `admin.storage` is a legitimate service-role use
 * (apps/api/lib/patient/download.ts) and has nothing to do with sessions.
 */
const SESSION_MINTING = [
  "auth.admin.generateLink",
  "generateLink",
  "resetPasswordForEmail",
  "signInWithPassword",
  "signInWithOtp",
  "signInWithOAuth",
  "setSession",
  "admin.createUser",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Comments are stripped: this file and others DISCUSS the forbidden names. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("Decision D: no patient session is minted outside a verified OTP", () => {
  const files = sourceFiles(API_ROOT);

  it("finds source files to scan (the scan is not vacuously passing)", () => {
    // A scan over an empty file list passes and proves nothing. This is the
    // guard on the guard.
    expect(files.length).toBeGreaterThan(20);
  });

  for (const symbol of SESSION_MINTING) {
    it(`no file in apps/api calls ${symbol}`, () => {
      const offenders = files.filter((f) => code(f).includes(symbol));
      expect(offenders.map((f) => f.replace(`${API_ROOT}/`, ""))).toEqual([]);
    });
  }

  it("the deleted activation module is really gone, not merely unexported", () => {
    const names = files.map((f) => f.replace(`${API_ROOT}/`, ""));
    expect(names).not.toContain("lib/auth/activation.ts");
    // And nothing still references it, which would be a broken import anyway
    // but fails here with a clearer reason.
    const referencing = files.filter((f) => code(f).includes("auth/activation"));
    expect(referencing.map((f) => f.replace(`${API_ROOT}/`, ""))).toEqual([]);
  });
});

describe("the api approval ledger is empty, and that is fail-closed", () => {
  it("registers no template, so no body can be sent through any channel", async () => {
    const { API_TEMPLATES, apiRegistry } = await import("../notify/registry");
    expect(API_TEMPLATES).toEqual([]);
    // resolveApproved treats an unknown id as unapproved, so an empty registry
    // refuses everything rather than permitting everything.
    const { resolveApproved } = await import("@osteojp/notify");
    expect(resolveApproved(apiRegistry, "patient.activation.sms", "sms")).toBeFalsy();
    expect(resolveApproved(apiRegistry, "anything.at.all", "email")).toBeFalsy();
  });
});
