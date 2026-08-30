import { describe, expect, it, vi } from "vitest";

// `actions.ts` pulls in `server-only` transitively. The repo convention for
// unit-testing a server module under the node environment is to stub it; see
// app/r/[token]/rate-limit.test.ts and app/horarios/horarios-roster-scope.test.ts.
vi.mock("server-only", () => ({}));
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * INC-13 / Sentry OSTEOJP-WEB-2, error E352: a "use server" module exporting a
 * non-async value.
 *
 * WHY A TEST AND NOT JUST THE FIX. The defect is invisible until a request hits
 * the route: `POSTPONE_WEEKS` sat exported from `actions.ts` for as long as the
 * feature has existed, typechecked cleanly the whole time, and announced itself
 * only as a digest-only production error. A guard is the only thing that stops
 * the next value export walking back in beside a legitimate action.
 *
 * THE RULE, and it is Next.js's, not ours: every export of a "use server"
 * module becomes a callable server-action endpoint, so every export must be an
 * async function. A `const`, a `class`, a sync function or a re-export has no
 * endpoint to become.
 *
 * TYPE EXPORTS ARE FINE and are deliberately allowed below: `export type` is
 * erased before the directive means anything.
 */

const FEATURE_DIRS = [
  join(__dirname),
  join(__dirname, "..", "..", "app", "recuperacao"),
];

function collect(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name))
    .map((e) => join(dir, e.name));
}

const files = FEATURE_DIRS.flatMap(collect);

/** A file is a server-action module only when the directive is the FIRST
 *  statement. A mention inside a comment is not a directive, and treating it as
 *  one is how `scope.ts` looked like a suspect during the INC-13 triage. */
const isUseServer = (src: string) => /^\s*(["'])use server\1\s*;?/.test(src);

describe("INC-13 - no 'use server' module exports a non-async value", () => {
  it("finds the server-action modules it is supposed to be guarding", () => {
    const found = files.filter((f) => isUseServer(readFileSync(f, "utf8")));
    // Vacuity guard: if the feature is refactored so this test scans nothing,
    // it must fail loudly rather than pass by finding no work to do.
    expect(found.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!isUseServer(src)) continue;

    it(`${file.split("/").slice(-3).join("/")} exports only async functions`, () => {
      const offenders: string[] = [];
      for (const line of src.split("\n")) {
        const m = /^export\s+(.*)$/.exec(line.trim());
        if (!m) continue;
        const rest = m[1]!;
        if (rest.startsWith("type ") || rest.startsWith("interface ")) continue;
        if (rest.startsWith("async function ")) continue;
        offenders.push(line.trim());
      }
      expect(
        offenders,
        `A "use server" module may export ONLY async functions (and types).\n` +
          `Move plain values to a neighbouring plain module, as INC-13 did with\n` +
          `POSTPONE_WEEKS -> lib/followup/postpone-weeks.ts.\n` +
          `Offending export(s):\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});

describe("INC-13 - the actions still load, and the closed set is shared", () => {
  it("actions.ts imports without throwing and exposes both actions", async () => {
    const mod = await import("./actions");
    expect(typeof mod.postponeFollowup).toBe("function");
    expect(typeof mod.revokeFollowupPostponement).toBe("function");
    expect(mod.postponeFollowup.constructor.name).toBe("AsyncFunction");
    expect(mod.revokeFollowupPostponement.constructor.name).toBe("AsyncFunction");
  });

  it("the postpone set has ONE definition, and no file re-declares the literal", async () => {
    const { POSTPONE_WEEKS, isPostponeWeeks } = await import("./postpone-weeks");
    expect([...POSTPONE_WEEKS]).toEqual([2, 4, 8, 12]);
    expect(isPostponeWeeks(4)).toBe(true);
    expect(isPostponeWeeks(5)).toBe(false);
    expect(isPostponeWeeks(0)).toBe(false);

    const list = readFileSync(
      join(__dirname, "..", "..", "app", "recuperacao", "followup-list.tsx"),
      "utf8",
    );
    // The client screen must derive its buttons from the shared set, never from
    // a second literal. Before INC-13 it carried its own [2, 4, 8, 12].
    expect(list).toContain("POSTPONE_WEEKS");
    expect(list).not.toMatch(/=\s*\[2,\s*4,\s*8,\s*12\]/);
  });
});
