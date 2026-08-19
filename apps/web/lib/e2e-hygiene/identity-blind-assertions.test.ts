import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ==========================================================================
 * ACC-identity-blind-assertions — criterion F, on the one case that was real.
 * ==========================================================================
 * THE CARD'S RULE, and it is the part worth more than its count: when writing
 * an assertion against the SHARED SEEDED DATABASE, ask whether a row this test
 * did not create could satisfy it. If yes, add identity — a run-unique name, a
 * `RUN_DAY_BASE`-derived date. Never a bare count on shared vocabulary.
 *
 * WHAT THIS GUARDS. `therapist-blocks.spec.ts` used to prove "both blocks are
 * listed" by counting the BADGE LABEL: `list.getByText("Bloqueio pontual")`
 * `.toHaveCount(1)`. Three facts make that identity-blind rather than merely
 * terse, and all three were re-derived from main rather than taken from the
 * card:
 *
 *   1. `TherapistBlocks.tsx` maps over `blocks` WHOLE — the modal lists every
 *      block the therapist has, unfiltered by date. So the population being
 *      counted is not "the blocks this test made".
 *   2. `THERAPIST_NAME` is a SHARED fixture. `agenda-blocked-time.spec.ts`
 *      creates its own `Bloqueio pontual` for that same therapist.
 *   3. Both specs run `clearBlocks()`, which deletes EVERY block that therapist
 *      has — not only the ones its own spec created.
 *
 * WHY IT MATTERS EVEN THOUGH AN EXACT COUNT USUALLY FAILS LOUDLY. Contamination
 * normally pushes a `toHaveCount(1)` to 2 and the test goes red, which is
 * harmless. The case that is not harmless is the COMPENSATING ERROR: our own
 * save silently fails WHILE a foreign pontual block is present, the count is
 * still 1, and the spec reports a block it never created as created. That is
 * the card's distinction exactly — a skipped test FAILS TO PROVE, an
 * identity-blind one PROVES SOMETHING FALSE.
 *
 * WHY THIS FILE LIVES UNDER lib/ AND NOT BESIDE THE SPEC. Playwright's projects
 * declare no `testMatch`, so they fall back to the default, which collects
 * `*.test.ts` as well as `*.spec.ts`. A guard written next to the spec would be
 * picked up by Playwright and fail on its vitest imports. Under `lib/` it is
 * collected by the existing `lib/**\/*.test.ts` include in vitest.config.ts —
 * so nothing in that config changes, and nothing previously silent is switched
 * on. The alternative (widening the vitest include to reach `e2e/`) would have
 * needed a matching `testIgnore` on every Playwright project to stay safe, and
 * a guard whose safety depends on four config lists staying in step is the kind
 * of protection that quietly stops protecting.
 */
const SPEC = readFileSync(
  join(__dirname, "..", "..", "e2e", "therapist-blocks.spec.ts"),
  "utf8",
);

/**
 * COMMENTS STRIPPED BEFORE SCANNING. The spec's own comment quotes the
 * defective call in order to explain it, and a raw text scan cannot tell a
 * description from a use — criterion F at the tooling level, which this repo
 * has now hit three times (`notes-list.timezone.test.ts` and
 * `audit-override-trace.test.ts` strip for the same reason).
 *
 * SAFE HERE, and criterion C is why that needs saying: `strip()` blanks block
 * and line comments only, not template literals. The shapes below are plain
 * call expressions, none of which hide inside a template literal in this file.
 */
const BODY = SPEC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** The shape the fix removed: a bare count over a badge label. */
const BADGE_COUNT =
  /getByText\(\s*"(Bloqueio pontual|Ausência prolongada)"\s*\)\s*\)?\s*\.toHaveCount\(/;

describe("therapist-blocks asserts on identity, not on a shared badge label", () => {
  it("VACUOUS-PASS GUARD: the spec was read, survived stripping, and still asserts on the list", () => {
    // Asserted on the STRIPPED body. If stripping ever ate the code as well as
    // the comments, every assertion below would pass over an empty string and
    // prove nothing — a guard proves a test RAN; only the assertion proves it
    // tested the right SUBJECT.
    expect(BODY.length).toBeGreaterThan(2000);
    expect(BODY).toMatch(/getByTestId\("blocks-list"\)/);
  });

  it("NEGATIVE CONTROL: the forbidden pattern really does match the old code", () => {
    // Without this, a typo in BADGE_COUNT would make the assertion below pass
    // for the wrong reason and go on passing forever. The literal here is the
    // line as it stood before the fix.
    expect(
      'await expect(list.getByText("Bloqueio pontual")).toHaveCount(1);',
    ).toMatch(BADGE_COUNT);
  });

  it("counts NO block by its badge label alone", () => {
    const hits = BODY.split("\n").filter((l) => BADGE_COUNT.test(l));
    expect(
      hits.length,
      `a block must be identified by its own run-scoped date, not by a label every block of that mode shares: ${hits.join(" | ")}`,
    ).toBe(0);
  });

  it("identifies each listed block by its own RUN_DAY_BASE-derived date", () => {
    // The rows are filtered by `ptDate(...)`, which renders the date THIS spec
    // chose in the format TherapistBlocks.tsx renders it in. RUN_DAY_BASE is
    // randomised per run, so a leftover row from an earlier run lands on a
    // different day and cannot satisfy the filter.
    // No dotall flag: the tsconfig target predates it, and the pontualRow
    // declaration is a single line anyway.
    expect(BODY).toMatch(/const pontualRow = .*filter\(\{ hasText: ptDate\(date\) \}\)/);
    expect(BODY).toMatch(/const prolongadaRow = [\s\S]*?ptDate\(futureDate\(RUN_DAY_BASE \+ 40\)\)/);
    // And the badge is still checked — INSIDE the identified row, where it
    // describes that block rather than counting the population.
    expect(BODY).toMatch(/expect\(pontualRow\)\.toContainText\("Bloqueio pontual"\)/);
    expect(BODY).toMatch(/expect\(prolongadaRow\)\.toContainText\("Ausência prolongada"\)/);
  });

  it("the ptDate helper renders the format the component renders", () => {
    // TherapistBlocks.tsx `fmtDate`: `${day}/${m}/${y}`. If the component ever
    // changes format, the filter silently matches nothing and every assertion
    // above would still pass while the spec proved nothing — so the two are
    // pinned to each other here rather than left to agree by memory.
    const component = readFileSync(
      join(__dirname, "..", "..", "app", "admin", "working-hours", "TherapistBlocks.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(component).toMatch(/return `\$\{day\}\/\$\{m\}\/\$\{y\}`/);
    expect(BODY).toMatch(/return `\$\{d\}\/\$\{m\}\/\$\{y\}`/);
  });
});
