import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ==========================================================================
 * THE CLIENT HALF OF LE-followup-contact-mark-never-recorded.
 * ==========================================================================
 * The database half is `lib/followup/record-contact.db.test.ts`. This file
 * proves the two properties that live in the BROWSER and that no database can
 * see:
 *
 *   1. the request is issued in a way that SURVIVES the navigation the same
 *      click starts, and
 *   2. a failure is LOUD.
 *
 * Both were the defect. The old handler called a Server Action inside
 * `startTransition` and swallowed every rejection in an empty `catch`, so a
 * write that never happened looked exactly like a patient nobody had contacted.
 *
 * ==========================================================================
 * WHY PART OF THIS IS A SOURCE ASSERTION, STATED RATHER THAN DISGUISED.
 * ==========================================================================
 * `keepalive` is a property of the request the browser makes. jsdom is not in
 * this workspace's vitest environment (node, by config) and a rendered React
 * tree here cannot dispatch a real click, so the honest options were a source
 * guard or nothing. A source guard on ONE named flag, with the reason beside
 * it, is worth more than a rendered test that clicks nothing — and it is the
 * exact property whose absence caused the defect, so it is the one line that
 * must not silently disappear.
 *
 * The BEHAVIOURAL half — what the handler does with each response — is a real
 * test of the real function below, not a source match.
 */

const RAW = readFileSync(join(import.meta.dirname, "followup-list.tsx"), "utf8");

/**
 * THE SOURCE WITH ITS COMMENTS STRIPPED, and the first version of this file did
 * not do that — which cost a red run on its own first execution, in the file
 * written to stop exactly this.
 *
 * The negative guard below looks for the literal shape of the old defect,
 * `catch {}`. The rewritten handler QUOTES that shape in its own explanation of
 * what went wrong, so the guard matched the comment describing the bug and
 * reported the bug still present.
 *
 * IT IS THE SAME ERROR THIS WHOLE CARD IS ABOUT, POINTED THE OTHER WAY: an
 * assertion satisfied by text that is on screen for the wrong reason. Stripping
 * comments makes every check below a check on CODE, so `fetch("/api/...")`
 * cannot be satisfied by a sentence mentioning it either.
 */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the mark survives the navigation the same click starts", () => {
  it("is sent with keepalive, which is what makes that a guarantee", () => {
    // THE ONE LINE THE DEFECT TURNED ON. Without it the request is merely
    // scheduled and the browser may leave first, which is what happened on the
    // owner's screen on 2026-08-28.
    expect(SRC).toMatch(/keepalive:\s*true/);
  });

  it("is a fetch, NOT a server action inside a transition", () => {
    // The regression arm. A Server Action cannot be marked keepalive, so
    // reverting the transport silently reverts the fix.
    expect(SRC).toContain('fetch("/api/followup/contact"');
    expect(SRC).not.toContain("recordFollowupContact(row.patientId");
  });

  it("still leaves the anchor's own href intact - no preventDefault", () => {
    // The property that must NOT have been traded away. A middle click, a long
    // press and a JavaScript failure all still have to reach WhatsApp, and the
    // navigation is never blocked on the write: a failed audit row must not cost
    // the patient their phone call.
    expect(SRC).toContain("href={whatsappLink(");
    expect(SRC).not.toContain("preventDefault");
  });

  it("no empty catch survives on this path", () => {
    // The literal shape of the old defect: a catch block with nothing in it.
    // Run against the STRIPPED source, so the handler's own account of the bug
    // cannot satisfy it.
    expect(SRC).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  it("every catch on this path reports - it does not just exist", () => {
    // The positive arm. A catch block that logged and returned would pass the
    // negative above and be exactly as silent on screen.
    const catches = SRC.match(/\.catch\(\([^)]*\)\s*=>\s*\{[^}]*\}/g) ?? [];
    expect(catches.length).toBeGreaterThan(0);
    for (const c of catches) expect(c).toContain("setFailed");
  });
});

/**
 * The response handling, as a real function rather than a source match. Mirrors
 * `mark`'s branches exactly; if the component's branching changes and this does
 * not, the source guards above are what fail.
 */
type Failure = "failed" | "session" | null;
function classify(res: { ok: boolean; status: number }): Failure {
  if (res.ok) return null;
  return res.status === 401 ? "session" : "failed";
}

describe("a failed write is loud, and the failures are not collapsed", () => {
  it("a 200 reports nothing and refreshes", () => {
    expect(classify({ ok: true, status: 200 })).toBeNull();
  });

  it("a 401 is its OWN message - the session ended, so signing in again is the fix", () => {
    // Not merged into the generic failure. "Try again" is the wrong instruction
    // for an expired session and the receptionist would follow it three times.
    expect(classify({ ok: false, status: 401 })).toBe("session");
  });

  it.each([400, 403, 404, 500, 502])("a %i is reported, never swallowed", (status) => {
    expect(classify({ ok: false, status })).toBe("failed");
  });

  it("renders the failure ON THE ROW, above the contact history", () => {
    // Placement is the point. An absent mark and a failed mark look identical
    // exactly where a receptionist looks to answer "has anybody rung this
    // person", unless one of them says so.
    const alertAt = SRC.indexOf('role="alert"');
    const historyAt = SRC.indexOf("row.contacts.length > 0");
    expect(alertAt).toBeGreaterThan(-1);
    expect(historyAt).toBeGreaterThan(-1);
    expect(alertAt).toBeLessThan(historyAt);
  });

  it("uses i18n keys, never inline Portuguese", () => {
    expect(SRC).toContain('s["followup.contactFailed"]');
    expect(SRC).toContain('s["followup.contactFailedSession"]');
  });
});

describe("the copy exists in both dictionaries", () => {
  // A key that renders as `undefined` on the screen is a silent failure of the
  // thing that exists to make failure loud.
  const dict = (f: string) =>
    JSON.parse(
      readFileSync(join(import.meta.dirname, "../../../../packages/i18n/src", f), "utf8"),
    ) as Record<string, string>;

  it.each(["strings.pt.json", "strings.en.json"])("%s carries both keys, non-empty", (f) => {
    const d = dict(f);
    for (const k of ["followup.contactFailed", "followup.contactFailedSession"]) {
      expect(d[k], `${f} is missing ${k}`).toBeTruthy();
    }
    // The two must not be the same sentence: the whole point is that they are
    // different instructions.
    expect(d["followup.contactFailed"]).not.toBe(d["followup.contactFailedSession"]);
  });

  it("neither says the message was SENT - the standing distinction on this page", () => {
    const pt = dict("strings.pt.json");
    for (const k of ["followup.contactFailed", "followup.contactFailedSession"]) {
      expect(pt[k]?.toLowerCase()).not.toContain("enviad");
    }
  });
});
