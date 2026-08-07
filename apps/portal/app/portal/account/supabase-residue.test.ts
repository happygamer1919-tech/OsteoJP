/**
 * LE-portal-supabase-residue — every remaining Supabase reach in apps/portal is
 * either GONE or JUSTIFIED IN A COMMENT that names what it is for.
 *
 * That is the card's DoD verbatim, and it is asserted in source rather than
 * reviewed, because the failure mode is a dead branch that reads as live.
 * WF-08 is the precedent: `sendPatientActivation` sat inert in this tree for two
 * waves looking like a working feature, and was deleted only once someone
 * traced its callers. A grep-able invariant is what stops the next one.
 *
 * Decision D removed every patient use of Supabase auth. WF-07 goes further: it
 * REFUSES to link a patient row that already carries an auth user. So for a
 * patient there is structurally no Supabase session, and any code reading one is
 * unreachable unless it is explicitly there to clean up a PRE-Decision-D
 * browser — which is the one justification this test accepts.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PORTAL_ROOT = join(__dirname, "..", "..", "..");

/** Every .ts/.tsx under apps/portal, excluding the sanctioned client factories
 *  in lib/supabase/ (which exist to BE the seam) and test files. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full.endsWith(join("lib", "supabase"))) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Code with comments stripped. A comment DISCUSSING supabase.auth is exactly
 *  what this card asks for; counting it as a live call would make the rule
 *  self-defeating. */
const live = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * The reaches that are allowed to survive, each with the reason it survives.
 * Adding a row here is a deliberate act that shows up in review; adding a call
 * without a row fails the test.
 */
const JUSTIFIED: { file: string; why: RegExp }[] = [
  {
    // Clears a stale PRE-Decision-D cookie from a browser that still has one.
    // Becomes dead the day no such browser can exist, and the comment says so.
    file: join("app", "portal", "account", "AccountView.tsx"),
    why: /stale pre-Decision-D cookie/i,
  },
  {
    // The transport's fallback Authorization header. The portal session is tried
    // FIRST (W13-03b); this is the residual path for a session minted before
    // Decision D landed.
    file: join("lib", "api", "client.ts"),
    why: /PATIENT SESSION FIRST/i,
  },
];

describe("apps/portal reaches for Supabase auth in known places only", () => {
  const files = sourceFiles(PORTAL_ROOT);

  it("guards against a vacuous pass: the walk finds real source files", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("client.ts"))).toBe(true);
  });

  it("every live supabase.auth call is on the justified list, and says why", () => {
    const offenders: string[] = [];

    for (const full of files) {
      const src = readFileSync(full, "utf8");
      if (!/supabase\.auth\./.test(live(src))) continue;

      const rel = full.slice(PORTAL_ROOT.length + 1);
      const entry = JUSTIFIED.find((j) => rel.endsWith(j.file));
      if (!entry) {
        offenders.push(`${rel}: reaches supabase.auth and is not on the justified list`);
      } else if (!entry.why.test(src)) {
        offenders.push(`${rel}: on the justified list but its comment no longer explains why`);
      }
    }

    expect(
      offenders,
      `Unjustified Supabase auth use in apps/portal.\n` +
        offenders.map((o) => `  - ${o}`).join("\n") +
        `\n\nDecision D removed every patient use of Supabase auth, and WF-07 refuses ` +
        `to link a patient that already has an auth user - so for a patient this code ` +
        `cannot fire. Either delete it, or add it to JUSTIFIED with a comment naming ` +
        `what it is for.`,
    ).toEqual([]);
  });

  it("the ACCOUNT SCREEN no longer reads an auth user at all", () => {
    // The two removals this card shipped. Pinned by name so a future edit that
    // "restores the fallback" fails here instead of re-adding an unreachable
    // branch that reads as a working feature.
    const page = readFileSync(
      join(PORTAL_ROOT, "app", "portal", "account", "page.tsx"),
      "utf8",
    );
    expect(live(page)).not.toContain("supabase.auth");
    expect(live(page)).not.toContain("user_metadata");

    const actions = readFileSync(
      join(PORTAL_ROOT, "app", "portal", "account", "actions.ts"),
      "utf8",
    );
    expect(live(actions)).not.toContain("supabase.auth");
    expect(live(actions)).not.toContain("updateUser");
  });

  it("each justified survivor is TRANSITIONAL, not permanent", () => {
    // The distinction that keeps this list from becoming a permanent exemption:
    // both entries exist only to serve a browser or session that predates
    // Decision D, so both have a day on which they become deletable.
    for (const { file, why } of JUSTIFIED) {
      const src = readFileSync(join(PORTAL_ROOT, file), "utf8");
      expect(why.test(src), `${file} lost its justification comment`).toBe(true);
    }
  });
});
