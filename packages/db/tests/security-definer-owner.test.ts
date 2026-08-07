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

/** The thirteen, exactly as production returned them on 2026-08-07. */
const THIRTEEN = [
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
  "viewer_has_location_assignment",
].map((name) => ({ name, owner: "postgres" }));

describe("POSITIVE ARM — production as it actually is", () => {
  it("passes on the real thirteen, all owned by postgres", () => {
    expect(evaluate(THIRTEEN)).toEqual([]);
  });

  it("the declared count matches the declared list", () => {
    // If these drift, the count assertion below is asserting the wrong number.
    expect(THIRTEEN).toHaveLength(EXPECTED_COUNT);
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
    const split = THIRTEEN.map((r) =>
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
    const split = THIRTEEN.map((r) =>
      ["is_unconfirmed_pedido", "appointment_conflicts"].includes(r.name)
        ? { ...r, owner: "svc_migrations" }
        : r,
    );
    expect(evaluate(split)).toHaveLength(2);
  });
});

describe("NEGATIVE ARM — a count of TWELVE fails", () => {
  it("fails when a function is missing, even if every owner is correct", () => {
    // This is the case an owner-only check passes: twelve correctly-owned
    // functions look perfect one at a time.
    const twelve = THIRTEEN.filter((r) => r.name !== "appointment_conflicts");
    const problems = evaluate(twelve);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("found 12");
    expect(problems[0]).toContain("missing");
    // Every remaining owner is right, so this failure comes only from the count.
    expect(twelve.every((r) => r.owner === EXPECTED_OWNER)).toBe(true);
  });

  it("fails on a FOURTEENTH that arrived correctly owned", () => {
    // The other direction, and the one the count assertion exists for: a new
    // SECURITY DEFINER function entering the schema unreviewed.
    const fourteen = [...THIRTEEN, { name: "some_new_helper", owner: "postgres" }];
    const problems = evaluate(fourteen);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("found 14");
    expect(problems[0]).toContain("without being added to 0060");
  });

  it("reports BOTH problems when owner and count are wrong together", () => {
    const bad = [
      ...THIRTEEN.slice(0, 12),
      { name: "appointment_conflicts", owner: "migrator" },
      { name: "some_new_helper", owner: "postgres" },
    ];
    expect(evaluate(bad).length).toBeGreaterThanOrEqual(2);
  });
});

describe("0060 declares exactly the functions the checker counts", () => {
  it("the migration has one ALTER per expected function, and no more", async () => {
    // The pairing that makes EXPECTED_COUNT meaningful: if these drift, the
    // number is asserting something the migration does not pin.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(
      join(__dirname, "..", "migrations", "0060_pin_security_definer_owner.sql"),
      "utf8",
    );
    const live = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
    const alters = live.match(/^ALTER FUNCTION public\.([a-z_]+)\(/gm) ?? [];
    expect(alters).toHaveLength(EXPECTED_COUNT);

    const named = alters.map((a) => /public\.([a-z_]+)\(/.exec(a)![1]).sort();
    expect(named).toEqual(THIRTEEN.map((r) => r.name).sort());
  });

  it("every ALTER pins to the expected owner, not to something else", () => {
    // A migration that pinned to the wrong role would pass the count check and
    // then MOVE ownership away from the role everything depends on.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const sql = readFileSync(
      join(__dirname, "..", "migrations", "0060_pin_security_definer_owner.sql"),
      "utf8",
    );
    const owners = [...sql.matchAll(/^ALTER FUNCTION .* OWNER TO ([a-z_]+);/gm)].map((m) => m[1]);
    expect(owners).toHaveLength(EXPECTED_COUNT);
    expect(new Set(owners)).toEqual(new Set([EXPECTED_OWNER]));
  });
});
