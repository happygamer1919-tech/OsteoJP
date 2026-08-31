import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * OSTEOJP-WEB-8 - `requireRequestContext()` NAVIGATES, so no call site may sit
 * inside something that swallows the navigation.
 *
 * WHY A STATIC GUARD. `redirect()` throws Next's NEXT_REDIRECT signal. A
 * `try { ... } catch { ... }` around the guard eats it, and the page then
 * renders as though nobody had asked to navigate - or, worse, converts a real
 * Auth outage into a silent bounce to /login. Nine call sites had exactly that
 * shape before this change, and every one of them LOOKED correct: several even
 * called `redirect("/login")` in the catch, which is why reading the diff would
 * not have caught the next one.
 *
 * A caller that genuinely wants a value rather than a navigation has
 * `getRequestContext()`, which returns null and is explicitly exempt.
 */
const ROOT = join(__dirname, "..", "..");
const SKIP = new Set(["node_modules", ".next", ".turbo", "e2e", "test-results", "playwright-report"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/** Lines calling the guard while lexically inside an open `try` block. */
function swallowedCallsites(src: string): number[] {
  const lines = src.split("\n");
  const hits: number[] = [];
  let depth = 0;
  const tryDepths: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/\btry\s*\{/.test(line)) tryDepths.push(depth);
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        while (tryDepths.length && tryDepths[tryDepths.length - 1]! >= depth) tryDepths.pop();
      }
    }
    if (/await requireRequestContext\(\)/.test(line)) {
      if (/\.catch\(/.test(line) || tryDepths.length > 0) hits.push(i + 1);
    }
  }
  return hits;
}

const FILES = walk(ROOT).filter((f) => readFileSync(f, "utf8").includes("requireRequestContext"));

describe("OSTEOJP-WEB-8 - no call site swallows the guard's redirect", () => {
  it("finds the call sites it is supposed to be guarding", () => {
    // Vacuity guard: a refactor that renames the helper must fail this test
    // loudly rather than pass by scanning nothing.
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("no requireRequestContext() sits inside a try block or a .catch()", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const line of swallowedCallsites(readFileSync(f, "utf8"))) {
        offenders.push(`${f.slice(ROOT.length + 1)}:${line}`);
      }
    }
    expect(
      offenders,
      "requireRequestContext() redirects, and these call sites would swallow it.\n" +
        "Either unwrap the try/catch, or - if the caller wants a VALUE rather than a\n" +
        "navigation, as a server action answering its own client does - call\n" +
        "getRequestContext() and branch on null.\n" +
        `Offending call site(s):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the guard still redirects, so this test is guarding something real", () => {
    /**
     * COMMENTS ARE STRIPPED FIRST, and that is not fussiness - the first draft
     * of this assertion FAILED against its own subject. context.ts documents
     * the defect it fixed, so the words `throw new Error("UNAUTHENTICATED")`
     * appear in its header prose. A substring search cannot tell an explanation
     * of the old code from the old code, which is the same trap SR-03 recorded
     * one surface over. Test the CODE.
     */
    const code = readFileSync(join(__dirname, "context.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).toMatch(/redirect\(LOGIN_PATH\)/);
    expect(code).not.toMatch(/throw new Error\("UNAUTHENTICATED"\)/);
  });
});
