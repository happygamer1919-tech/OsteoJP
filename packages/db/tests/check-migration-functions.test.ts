/**
 * The post-apply function checker's matching rule, with its NEGATIVE ARM.
 *
 * WHY THIS TEST EXISTS. `check-migration-functions.mjs` is the script that says
 * whether a `CREATE OR REPLACE FUNCTION` migration actually landed in
 * production. It is the only thing standing between "drizzle printed success"
 * and a real answer, because `drizzle-kit migrate` prints success on a no-op.
 *
 * Its first version matched the token with a bare `includes()`. That matches a
 * COMMENT as readily as a CALL, and the two mean opposite things:
 *
 *     AND NOT public.is_unconfirmed_pedido(a.id)        <- the exclusion is live
 *     -- pedido exclusion via public.is_unconfirmed_pedido, disabled for now
 *                                                        <- the exclusion is GONE
 *
 * Both bodies contain the token. The old checker would print OK for the second
 * one - a receipt for a regression, which is the same class of failure as an
 * existence check on a REPLACE.
 *
 * NO DATABASE NEEDED, and that is deliberate: the thing under test is the
 * MATCHING RULE, not the catalog read. Feeding it real `pg_get_functiondef`
 * output as a fixture tests exactly the decision that can be wrong, and runs in
 * the ordinary `pnpm test` rather than only in the DB-gated job.
 */
import { describe, expect, it } from "vitest";
import { stripSqlComments } from "../scripts/check-migration-functions.mjs";

/** The matching rule the script applies, extracted so both arms drive the same
 *  logic the CLI does. `live` is the verdict; `inert` is the diagnosis. */
function verdict(def: string, needle: string): "live" | "commented_out" | "missing" {
  if (stripSqlComments(def).includes(needle)) return "live";
  if (def.includes(needle)) return "commented_out";
  return "missing";
}

const NEEDLE = "is_unconfirmed_pedido";

/** Shaped like real `pg_get_functiondef` output: dollar-quoted body, the header
 *  comment style 0059 actually uses, and the predicate on its own line. */
const LIVE_BODY = `CREATE OR REPLACE FUNCTION public.appointment_conflicts(p_practitioner uuid)
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id
  FROM public.appointments a
  WHERE a.status NOT IN ('cancelled', 'no_show')
    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B
$function$`;

describe("POSITIVE ARM - the real 0059 body reads as live", () => {
  it("reports the call as live", () => {
    expect(verdict(LIVE_BODY, NEEDLE)).toBe("live");
  });

  it("is not passing merely because the trailing comment also names it", () => {
    // Strip the comment and the call must still be there. If this fails, the
    // positive arm was passing on the comment and the whole test is theatre.
    const stripped = stripSqlComments(LIVE_BODY);
    expect(stripped).toContain("AND NOT public.is_unconfirmed_pedido(a.id)");
    expect(stripped).not.toContain("0059: JP option B");
  });
});

/**
 * THE NEGATIVE ARM. Required, and it is the whole point of the rewrite.
 *
 * Each case replaces the CALL with a COMMENT that still mentions the same name.
 * Every one of these would have passed the old `includes()` check.
 */
describe("NEGATIVE ARM - a commented-out call must FAIL, however it is commented", () => {
  const cases: [string, string][] = [
    [
      "line comment, same line",
      LIVE_BODY.replace(
        "    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B",
        "    -- AND NOT public.is_unconfirmed_pedido(a.id)  -- 0059: temporarily disabled",
      ),
    ],
    [
      "block comment around the predicate",
      LIVE_BODY.replace(
        "    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B",
        "    /* AND NOT public.is_unconfirmed_pedido(a.id) */",
      ),
    ],
    [
      "call removed, header comment still describes it",
      LIVE_BODY.replace(
        "    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B",
        "    -- the is_unconfirmed_pedido exclusion used to be here",
      ),
    ],
    [
      "multi-line block comment mentioning it twice",
      LIVE_BODY.replace(
        "    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B",
        "    /* is_unconfirmed_pedido\n       was removed; see is_unconfirmed_pedido in 0059 */",
      ),
    ],
  ];

  for (const [label, body] of cases) {
    it(`FAILS on: ${label}`, () => {
      // The token IS still in the raw definition. This is what made the old
      // checker report OK, and asserting it keeps the case honest: if the token
      // vanished, the test would be proving something easier than the real risk.
      expect(body).toContain(NEEDLE);

      // ...and the rewritten rule refuses it anyway.
      expect(verdict(body, NEEDLE)).toBe("commented_out");
      expect(verdict(body, NEEDLE)).not.toBe("live");
    });
  }

  it("distinguishes COMMENTED OUT from a genuinely stale body", () => {
    // Different diagnoses, because they need different actions. "Commented out"
    // means the migration ran and someone disabled the call; "missing" means the
    // migration never ran. Reporting the first as the second wastes a round trip.
    const noMention = LIVE_BODY.replace(
      "    AND NOT public.is_unconfirmed_pedido(a.id)     -- 0059: JP option B",
      "    AND true",
    );
    expect(noMention).not.toContain(NEEDLE);
    expect(verdict(noMention, NEEDLE)).toBe("missing");
  });
});

describe("the stripper itself", () => {
  it("does not merge two block comments into one span", () => {
    // A greedy regex would swallow `KEEP` between them and silently delete live
    // SQL - which would turn a live call into a false STALE BODY.
    expect(stripSqlComments("/* a */ KEEP /* b */")).toContain("KEEP");
  });

  it("leaves a line comment's newline intact so following SQL survives", () => {
    const out = stripSqlComments("SELECT 1 -- note\nAND live_call()");
    expect(out).toContain("AND live_call()");
    expect(out).not.toContain("note");
  });

  it("never returns empty for a real body - a vacuous strip would fail everything closed", () => {
    expect(stripSqlComments(LIVE_BODY).trim().length).toBeGreaterThan(100);
  });
});
