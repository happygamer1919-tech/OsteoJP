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
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  EXPECTED_COUNT,
  EXPECTED_OWNER,
  evaluate,
} from "../scripts/check-security-definer-owner.mjs";
import { pairingProblems, readSecdef, readSecdefFromDir } from "./secdef-from-migrations";

/**
 * Every public SECURITY DEFINER function, by name: READ FROM THE MIGRATIONS.
 *
 * This was a hand list, first as production returned it on 2026-08-07 and then
 * grown by one line per migration (0072, 0073, 0074, 0075, 0086, 0087, 0090,
 * 0091; the reasons each function exists are in the checker's EXPECTED_COUNT
 * comment and in each migration). It stopped being enough at 0095, which does
 * not ADD a function but SWAPS one: `appointment_conflict_rows` becomes the
 * SECURITY DEFINER door and `appointment_conflicts` becomes SECURITY INVOKER
 * through CREATE OR REPLACE. Net zero, so the count holds, but a hand list is
 * right on one side of that promotion and wrong on the other.
 *
 * HOW PRODUCTION'S SET FOLLOWS FROM THE MIGRATIONS. Production is exactly the
 * migrations applied in journal order, which is file order. secdef-from-
 * migrations.ts replays every packages/db/migrations/*.sql in that order, with
 * comments removed and every quoted literal and $$ body blanked, and tracks each
 * public function's FINAL mode: a CREATE [OR REPLACE] FUNCTION makes it DEFINER
 * if the statement says SECURITY DEFINER and INVOKER otherwise (PostgreSQL's
 * default, which a replace without the clause resets to); an ALTER FUNCTION ...
 * SECURITY DEFINER|INVOKER sets it; a DROP FUNCTION removes it. What is left
 * marked DEFINER is the set `pg_proc.prosecdef` reports after the last
 * migration. Anything done to production OUTSIDE the migrations is not in the
 * files, which is why the live checker (check-security-definer-owner.mjs) still
 * reads the catalog itself; this test is the static half.
 *
 * THE COUNT STAYS A DELIBERATE ACT. EXPECTED_COUNT is still the frozen
 * checker's number, and the arm below pins the derived set to it, so a new
 * SECURITY DEFINER function still has to move that constant on purpose.
 */
// CARE-02a (0096, promoted on the held branch that carries this note): its
// migration creates `viewer_care_team_patient_ids_at_my_clinics`, the 27th,
// with its own owner-pin, and the derived set below picks it up from the
// promoted file. EXPECTED_COUNT in check-security-definer-owner.mjs moves
// 26 -> 27 in its own GATE-CHANGE (a frozen gate) that the owner merges after
// the apply, so on this branch the count arm reads derived 27 against frozen 26
// until main is merged in after that GATE-CHANGE: one red, expected.
const MIGRATIONS = readSecdefFromDir(join(__dirname, "..", "migrations"));

const EXPECTED_FUNCTIONS = MIGRATIONS.definers.map((name) => ({ name, owner: EXPECTED_OWNER }));

/**
 * The names the negative arms fabricate catalog rows with. They are SECURITY
 * DEFINER before AND after 0095 (appointment_conflicts is not after it), and a
 * positive arm below proves each one is in the derived set, so no negative arm
 * can pass on a name that has quietly left it.
 */
const PROBE = "assign_patient_number";
const PROBE_2 = "is_unconfirmed_pedido";

describe("POSITIVE ARM — production as it actually is", () => {
  it("passes on the real set, all owned by postgres", () => {
    expect(evaluate(EXPECTED_FUNCTIONS)).toEqual([]);
  });

  it("the set read from the migrations has the checker's count, and the owner is postgres", () => {
    // The derived set is pinned to the frozen checker's number, so a function
    // that becomes SECURITY DEFINER (or stops being one) moves EXPECTED_COUNT on
    // purpose or reddens this arm. Not a vacuous pass: 92+ files are read.
    expect(MIGRATIONS.files.length).toBeGreaterThan(90);
    expect(EXPECTED_FUNCTIONS).toHaveLength(EXPECTED_COUNT);
    expect(EXPECTED_OWNER).toBe("postgres");
  });

  it("the probe names the negative arms use are SECURITY DEFINER in the migrations", () => {
    expect(MIGRATIONS.definers).toContain(PROBE);
    expect(MIGRATIONS.definers).toContain(PROBE_2);
  });

  it("the conflict check has exactly ONE SECURITY DEFINER door, before and after 0095", () => {
    // Before 0095 it is appointment_conflicts itself; after, appointment_conflict_rows,
    // with appointment_conflicts running as the caller. Never both, never neither:
    // neither would be a conflict check blind to appointments the caller cannot
    // read, which is a double booking.
    const doors = ["appointment_conflicts", "appointment_conflict_rows"].filter((n) =>
      MIGRATIONS.definers.includes(n),
    );
    expect(doors).toHaveLength(1);
  });

  it("guards against a vacuous pass: an empty catalog does NOT pass", () => {
    // A query returning nothing (wrong database, wrong schema, a typo in the
    // predicate) must fail loudly rather than read as "no problems found".
    expect(evaluate([])).not.toEqual([]);
  });
});

/**
 * THE NEGATIVE ARM. Required. Both failure modes the dispatch named.
 *
 * The fabricated rows use PROBE / PROBE_2, not appointment_conflicts: 0095 makes
 * that one SECURITY INVOKER, and an arm that edits a row which is not in the set
 * would change nothing and still expect a failure.
 */
describe("NEGATIVE ARM — a wrong owner FAILS", () => {
  it("fails when ONE function has a fabricated wrong owner", () => {
    const split = EXPECTED_FUNCTIONS.map((r) =>
      r.name === PROBE ? { ...r, owner: "migrator" } : r,
    );
    const problems = evaluate(split);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(PROBE);
    expect(problems[0]).toContain('owned by "migrator"');
  });

  it("fails on a REALISTIC split, where the newest functions have a new owner", () => {
    // The actual shape of the failure: the applying principal changed partway,
    // so functions created after that point differ. Nothing else detects this.
    const split = EXPECTED_FUNCTIONS.map((r) =>
      [PROBE_2, PROBE].includes(r.name) ? { ...r, owner: "svc_migrations" } : r,
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
    const oneShort = EXPECTED_FUNCTIONS.filter((r) => r.name !== PROBE);
    expect(oneShort).toHaveLength(EXPECTED_FUNCTIONS.length - 1);
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
      ...EXPECTED_FUNCTIONS.filter((r) => r.name !== PROBE),
      { name: PROBE, owner: "migrator" },
      { name: "some_new_helper", owner: "postgres" },
    ];
    expect(evaluate(bad).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * THE PAIRING, GENERALISED FROM 0060 TO THE WHOLE MIGRATION SET, AND NOW TO A
 * SET THAT CAN SHRINK AS WELL AS GROW.
 *
 * This used to read 0060 alone, because 0060 was where all thirteen owner-pins
 * lived. Migration 0072 adds a fourteenth function AND its own
 * `ALTER FUNCTION ... OWNER TO postgres` in the same file, and 0073 adds a
 * fifteenth and a sixteenth the same way, which is exactly what the pairing is
 * supposed to require - and the 0060-only version would have failed it for
 * being in the right place.
 *
 * So the invariant is stated as what it always meant: EVERY function in the
 * final SECURITY DEFINER set has exactly ONE owner-pin somewhere in the
 * migrations, to EXPECTED_OWNER. A pin of a function that WAS SECURITY DEFINER
 * when pinned and has since been made INVOKER or dropped is HISTORICAL:
 * migrations are immutable, so 0060's pin of appointment_conflicts outlives the
 * day 0095 makes it INVOKER, and that is allowed. Any other pin (a function
 * that was never DEFINER, or a name no migration created) fails. Which file
 * carries a pin is not the property; that it exists is.
 */
describe("the migrations declare exactly the functions the checker counts", () => {
  it("one live owner-pin per SECURITY DEFINER function, no extra pins, every pin to the owner", () => {
    expect(pairingProblems(MIGRATIONS, EXPECTED_OWNER)).toEqual([]);
  });

  it("the live pins name exactly the derived set", () => {
    const live = MIGRATIONS.pins.filter((p) => p.kind === "live");
    expect(live).toHaveLength(EXPECTED_COUNT);
    expect(live.map((p) => p.name).sort()).toEqual([...MIGRATIONS.definers].sort());
  });

  it("every pin names the expected owner, not something else", () => {
    // A migration that pinned to the wrong role would pass the count check and
    // then MOVE ownership away from the role everything depends on. Historical
    // pins included: each one ran against production when it was applied.
    expect(new Set(MIGRATIONS.pins.map((p) => p.owner))).toEqual(new Set([EXPECTED_OWNER]));
  });
});

/**
 * THE READER'S OWN ARMS, on synthetic migration directories. No real migration
 * is read or touched here: each arm writes a few .sql files to a temp directory
 * and replays them, so every rule the real arms depend on has a red and a green
 * of its own.
 */
describe("the reader, on seeded migrations", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const seed = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "secdef-seed-"));
    dirs.push(dir);
    for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
    return readSecdefFromDir(dir);
  };
  const definerFn = (name: string, extra = "") =>
    `CREATE OR REPLACE FUNCTION public.${name}(p uuid)\n  RETURNS boolean\n  LANGUAGE sql\n  STABLE\n  SECURITY DEFINER\n  SET search_path = public\nAS $$ SELECT true $$;${extra}\n`;
  const invokerFn = (name: string, body = "SELECT true") =>
    `CREATE OR REPLACE FUNCTION public.${name}(p uuid)\n  RETURNS boolean\n  LANGUAGE sql\n  STABLE\nAS $$ ${body} $$;\n`;
  const pin = (name: string, owner = "postgres") =>
    `ALTER FUNCTION public.${name}(uuid) OWNER TO ${owner};--> statement-breakpoint\n`;

  it("GREEN: a DEFINER function with one pin passes", () => {
    const r = seed({ "0001_a.sql": definerFn("f") + pin("f") });
    expect(r.definers).toEqual(["f"]);
    expect(r.pins.map((p) => p.kind)).toEqual(["live"]);
    expect(pairingProblems(r, "postgres")).toEqual([]);
  });

  it("created DEFINER, then CREATE OR REPLACE'd without SECURITY DEFINER, reads INVOKER", () => {
    const r = seed({ "0001_a.sql": definerFn("f") + pin("f"), "0002_b.sql": invokerFn("f") });
    expect(r.finalMode.get("f")).toBe("INVOKER");
    expect(r.definers).toEqual([]);
  });

  it("a pin of such a function is HISTORICAL, and allowed", () => {
    const r = seed({
      "0001_a.sql": definerFn("f") + pin("f"),
      "0002_b.sql": invokerFn("f") + definerFn("g") + pin("g"),
    });
    expect(r.pins.map((p) => [p.name, p.kind])).toEqual([
      ["f", "historical"],
      ["g", "live"],
    ]);
    expect(pairingProblems(r, "postgres")).toEqual([]);
  });

  it("RED: a DEFINER function with no pin fails", () => {
    const r = seed({ "0001_a.sql": definerFn("f") + pin("f") + definerFn("g") });
    expect(pairingProblems(r, "postgres")).toEqual(["g is SECURITY DEFINER with no owner pin"]);
  });

  it("RED: a second pin of the same live function fails", () => {
    const r = seed({ "0001_a.sql": definerFn("f") + pin("f"), "0002_b.sql": pin("f") });
    const problems = pairingProblems(r, "postgres");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("f has 2 owner pins");
  });

  it("RED: a pin of a function that was never SECURITY DEFINER fails", () => {
    const r = seed({ "0001_a.sql": invokerFn("f") + pin("f") + pin("nobody_made_this") });
    expect(r.pins.map((p) => p.kind)).toEqual(["extra", "extra"]);
    expect(pairingProblems(r, "postgres")).toHaveLength(2);
  });

  it("RED: a pin to another owner fails", () => {
    const r = seed({ "0001_a.sql": definerFn("f") + pin("f", "migrator") });
    expect(pairingProblems(r, "postgres")).toEqual([
      '0001_a.sql: pin of f names "migrator", expected "postgres"',
    ]);
  });

  it("SECURITY DEFINER inside a $$ body, a $tag$ body, a COMMENT ON FUNCTION string or a comment does not count", () => {
    const r = seed({
      "0001_a.sql":
        invokerFn("in_body", "SELECT 'SECURITY DEFINER' IS NOT NULL") +
        `CREATE OR REPLACE FUNCTION public.in_tag(p uuid) RETURNS boolean LANGUAGE plpgsql AS $fn$\nBEGIN\n  -- SECURITY DEFINER\n  RETURN true;\nEND\n$fn$;\n` +
        invokerFn("in_comment") +
        `COMMENT ON FUNCTION public.in_comment(uuid) IS\n  'Not SECURITY DEFINER; it''s SECURITY INVOKER '\n  'on purpose.';--> statement-breakpoint\n` +
        `/* CREATE OR REPLACE FUNCTION public.ghost(p uuid) ... SECURITY DEFINER */\n` +
        `-- CREATE OR REPLACE FUNCTION public.ghost2(p uuid) SECURITY DEFINER AS $$ $$;\n` +
        `CREATE OR REPLACE FUNCTION public.in_line_comment(p uuid) RETURNS boolean LANGUAGE sql\n  -- SECURITY DEFINER\nAS $$ SELECT true $$;\n` +
        // The old single-quoted body form, still legal: the clause is inside a literal.
        `CREATE OR REPLACE FUNCTION public.in_quoted_body(p uuid) RETURNS text LANGUAGE sql\nAS 'SELECT ''SECURITY DEFINER''::text';\n`,
    });
    expect([...r.finalMode.keys()].sort()).toEqual([
      "in_body",
      "in_comment",
      "in_line_comment",
      "in_quoted_body",
      "in_tag",
    ]);
    expect(r.definers).toEqual([]);
  });

  it("SECURITY DEFINER AFTER the body still counts (PostgreSQL accepts it there)", () => {
    const r = seed({
      "0001_a.sql": `CREATE FUNCTION public.f(p uuid) RETURNS boolean AS $$ SELECT true $$ LANGUAGE sql SECURITY DEFINER;\n`,
    });
    expect(r.definers).toEqual(["f"]);
  });

  it("DROP removes it, and a pin from before the DROP is historical", () => {
    const r = seed({
      "0001_a.sql": definerFn("f") + pin("f"),
      "0002_b.sql": `DROP FUNCTION IF EXISTS public.f(uuid);--> statement-breakpoint\n`,
    });
    expect(r.finalMode.has("f")).toBe(false);
    expect(r.definers).toEqual([]);
    expect(r.pins.map((p) => p.kind)).toEqual(["historical"]);
    expect(pairingProblems(r, "postgres")).toEqual([]);
  });

  it("RED: dropped and re-created DEFINER needs its OWN pin (the new object has a new owner)", () => {
    const r = seed({
      "0001_a.sql": definerFn("f") + pin("f"),
      "0002_b.sql": `DROP FUNCTION public.f(uuid);\n` + definerFn("f"),
    });
    expect(pairingProblems(r, "postgres")).toEqual(["f is SECURITY DEFINER with no owner pin"]);
  });

  it("ALTER FUNCTION ... SECURITY DEFINER / INVOKER sets the mode", () => {
    const r = seed({
      "0001_a.sql": invokerFn("up") + definerFn("down"),
      "0002_b.sql":
        `ALTER FUNCTION public.up(uuid) SECURITY DEFINER;\n` +
        `ALTER FUNCTION public.down(uuid) SECURITY INVOKER;\n`,
    });
    expect(r.finalMode.get("up")).toBe("DEFINER");
    expect(r.finalMode.get("down")).toBe("INVOKER");
  });

  it("files replay in FILE order, not the order they were written", () => {
    const r = seed({ "0002_b.sql": invokerFn("f"), "0001_a.sql": definerFn("f") });
    expect(r.files).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(r.finalMode.get("f")).toBe("INVOKER");
  });

  it("FAILS CLOSED on a re-create with a different parameter list (an overload it cannot model)", () => {
    expect(() =>
      readSecdef(["0001_a.sql", "0002_b.sql"], (f) =>
        f === "0001_a.sql"
          ? definerFn("f")
          : `CREATE OR REPLACE FUNCTION public.f(p uuid, q int) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;`,
      ),
    ).toThrow(/different parameter list/);
  });

  it("FAILS CLOSED on an unqualified CREATE FUNCTION", () => {
    expect(() =>
      readSecdef(["0001_a.sql"], () => `CREATE FUNCTION f() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;`),
    ).toThrow(/unqualified/);
  });
});
