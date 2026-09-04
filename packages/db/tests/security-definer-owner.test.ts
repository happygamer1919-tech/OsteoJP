/**
 * The SECURITY DEFINER ownership checker, with its NEGATIVE ARM.
 *
 * This guards a property CI STRUCTURALLY CANNOT REPRODUCE: `supabase db reset`
 * builds a database where one principal creates everything, so an owner split
 * cannot exist there. A checker whose failure path has never executed is a
 * checker nobody has tested, and this one is the only thing that would catch a
 * split before its symptom (a wrong answer, not an error) reached a patient.
 *
 * Driven with fabricated catalog rows on purpose. The thing under test is the
 * VERDICT, not the query.
 */
import { describe, expect, it } from "vitest";
import {
  EXPECTED_COUNT,
  EXPECTED_OWNER,
  evaluate,
} from "../scripts/check-security-definer-owner.mjs";

/**
 * Every public SECURITY DEFINER function, by name.
 *
 * EXPECTED_FUNCTIONS as production returned them on 2026-08-07, plus
 * `resolve_confirm_code` from migration 0072 (SR-29) - the single door to
 * `appointment_confirm_codes`, which is granted to nobody - plus
 * `viewer_location_ids` and `viewer_visible_patient_ids` from migration 0073
 * (SR-33), the two nullary helpers `patients_select` evaluates once per
 * statement instead of once per row - plus the three WRITE doors and
 * `viewer_treated_patient_ids` from migration 0074 (SR-35). The writers exist
 * because 0072 revoked the table from every application role and built only the
 * read door, so nothing in the application could mint a code at all.
 */
const EXPECTED_FUNCTIONS = [
  "appointment_conflicts",
  "assign_patient_number",
  "clinical_admin_sees_patient",
  "clinical_therapist_sees_patient",
  "custom_access_token_hook",
  "is_unconfirmed_pedido",
  "jwt_patient_id",
  "jwt_tenant_id",
  "location_in_viewer_scope",
  "merge_patients",
  "patient_appt_at_viewer_location",
  "patient_appt_treated_by_viewer",
  "resolve_confirm_code",
  "viewer_has_location_assignment",
  "viewer_location_ids",
  "viewer_visible_patient_ids",
  "consume_confirm_code",
  "issue_confirm_code",
  "withdraw_confirm_code",
  "viewer_treated_patient_ids",
  // 0075 (SR-45/OBS-04): the Twilio status callback's ONE crossing. It has no
  // session and knows only the SID, so the tenant cannot be scoped before this
  // answers - the same problem `resolve_confirm_code` solves for the confirm
  // page, bounded the same way: one argument, one column, no table grant.
  "reminder_dispatch_tenant",
].map((name) => ({ name, owner: "postgres" }));

describe("POSITIVE ARM — production as it actually is", () => {
  it("passes on the real set, all owned by postgres", () => {
    expect(evaluate(EXPECTED_FUNCTIONS)).toEqual([]);
  });

  it("the declared count matches the declared list", () => {
    // If these drift, the count assertion below is asserting the wrong number.
    expect(EXPECTED_FUNCTIONS).toHaveLength(EXPECTED_COUNT);
    expect(EXPECTED_OWNER).toBe("postgres");
  });

  it("guards against a vacuous pass: an empty catalog does NOT pass", () => {
    // A query returning nothing (wrong database, wrong schema, a typo in the
    // predicate) must fail loudly rather than read as "no problems found".
    expect(evaluate([])).not.toEqual([]);
  });
});

/**
 * THE NEGATIVE ARM. Required. Both failure modes the dispatch named.
 */
describe("NEGATIVE ARM — a wrong owner FAILS", () => {
  it("fails when ONE function has a fabricated wrong owner", () => {
    const split = EXPECTED_FUNCTIONS.map((r) =>
      r.name === "appointment_conflicts" ? { ...r, owner: "migrator" } : r,
    );
    const problems = evaluate(split);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("appointment_conflicts");
    expect(problems[0]).toContain('owned by "migrator"');
  });

  it("fails on a REALISTIC split, where the newest functions have a new owner", () => {
    // The actual shape of the failure: the applying principal changed partway,
    // so functions created after that point differ. Nothing else detects this.
    const split = EXPECTED_FUNCTIONS.map((r) =>
      ["is_unconfirmed_pedido", "appointment_conflicts"].includes(r.name)
        ? { ...r, owner: "svc_migrations" }
        : r,
    );
    expect(evaluate(split)).toHaveLength(2);
  });
});

describe("NEGATIVE ARM — a count of TWELVE fails", () => {
  it("fails when a function is missing, even if every owner is correct", () => {
    // This is the case an owner-only check passes: correctly-owned functions
    // look perfect one at a time.
    //
    // COUNT-RELATIVE, NOT HARD-CODED. This asserted "found 12" and broke the day
    // a further function landed - which is a test failing for arithmetic
    // rather than for the property it names. The property is "one fewer than
    // expected is reported as missing", and that is what it says now.
    const oneShort = EXPECTED_FUNCTIONS.filter((r) => r.name !== "appointment_conflicts");
    const problems = evaluate(oneShort);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`found ${EXPECTED_COUNT - 1}`);
    expect(problems[0]).toContain("missing");
    // Every remaining owner is right, so this failure comes only from the count.
    expect(oneShort.every((r) => r.owner === EXPECTED_OWNER)).toBe(true);
  });

  it("fails on ONE MORE than expected, even if it arrived correctly owned", () => {
    // The other direction, and the one the count assertion exists for: a new
    // SECURITY DEFINER function entering the schema unreviewed.
    const oneOver = [...EXPECTED_FUNCTIONS, { name: "some_new_helper", owner: "postgres" }];
    const problems = evaluate(oneOver);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`found ${EXPECTED_COUNT + 1}`);
    expect(problems[0]).toContain("without being added to 0060");
  });

  it("reports BOTH problems when owner and count are wrong together", () => {
    const bad = [
      // One short of the expected set, then a wrongly-owned one and an
      // unreviewed one - so the total is one OVER and one owner is wrong.
      ...EXPECTED_FUNCTIONS.filter((r) => r.name !== "appointment_conflicts"),
      { name: "appointment_conflicts", owner: "migrator" },
      { name: "some_new_helper", owner: "postgres" },
    ];
    expect(evaluate(bad).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * THE PAIRING, GENERALISED FROM 0060 TO THE WHOLE MIGRATION SET.
 *
 * This used to read 0060 alone, because 0060 was where all thirteen owner-pins
 * lived. Migration 0072 adds a fourteenth function AND its own
 * `ALTER FUNCTION ... OWNER TO postgres` in the same file, and 0073 adds a
 * fifteenth and a sixteenth the same way, which is exactly what the pairing is
 * supposed to require - and the 0060-only version would have failed it for
 * being in the right place.
 *
 * So the invariant is stated as what it always meant: EVERY SECURITY DEFINER
 * function the checker counts has an owner-pin SOMEWHERE in the migrations, and
 * there are no pins for functions nobody counts. Which file carries it is not
 * the property; that it exists is.
 */
describe("the migrations declare exactly the functions the checker counts", () => {
  const altersAcrossMigrations = async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(__dirname, "..", "migrations");
    const out: { name: string; owner: string }[] = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const live = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const m of live.matchAll(
        /^ALTER FUNCTION public\.([a-z_]+)\([^)]*\)\s+OWNER TO ([a-z_]+);/gm,
      )) {
        out.push({ name: m[1]!, owner: m[2]! });
      }
    }
    return out;
  };

  it("one owner-pin per expected function, and no more", async () => {
    const alters = await altersAcrossMigrations();
    expect(alters).toHaveLength(EXPECTED_COUNT);
    expect(alters.map((a) => a.name).sort()).toEqual(
      EXPECTED_FUNCTIONS.map((r) => r.name).sort(),
    );
  });

  it("every pin names the expected owner, not something else", async () => {
    // A migration that pinned to the wrong role would pass the count check and
    // then MOVE ownership away from the role everything depends on.
    const alters = await altersAcrossMigrations();
    expect(new Set(alters.map((a) => a.owner))).toEqual(new Set([EXPECTED_OWNER]));
  });
});
