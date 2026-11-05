/**
 * closed-days-portal.test.ts - Tier C 0114 on the patient side, at the SOURCE.
 *
 * Same argument as portal-clinic-hours-parity.test.ts next door: the portal's
 * predicates are raw SQL templates, so whether a predicate is PRESENT at every
 * site is a source question, answered here on every PR without a database.
 * Whether the SQL is RIGHT (Lisbon dates, the clock change, the edges) is the
 * DB-gated half, closed-days-portal.db.test.ts, which runs the shared parity
 * table (closed-day-parity-cases.json) through the real store.
 *
 * THE RULE: the lunch closure and the dated closures are ONE fragment,
 * `closureOverlapExists`, and every call passes the closure-table flag that
 * `closedDaysOn()` answered for that query. So the slot grid, the therapist
 * list, the booking guard and the reschedule guard cannot disagree about a
 * closed day (owner C9: online booking shows no slot on a closed day).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/--[^\n]*/g, " ");
}

const STORE = stripComments(readFileSync(join(__dirname, "store.ts"), "utf8"));

/** Every CALL of closureOverlapExists (not its definition), with its argument list. */
function calls(src: string): string[] {
  const out: string[] = [];
  const re = /(?<!function\s)closureOverlapExists\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

/** The body of one store method, up to the next top-level method in the object. */
function bodyOf(name: string, src: string = STORE): string {
  const start = src.indexOf(`async ${name}(`);
  if (start === -1) throw new Error(`${name} is not in store.ts`);
  const rest = src.slice(start);
  const end = rest.indexOf("\n  },");
  return end === -1 ? rest : rest.slice(0, end);
}

const SITES = ["listOpenSlots", "listAvailableTherapists", "createBooking", "hasWindowConflict"] as const;

describe("Tier C 0114: the portal reads dated closures wherever it reads the lunch closure", () => {
  it("finds the calls (not vacuous): at least one per site, six in all", () => {
    expect(calls(STORE).length).toBeGreaterThanOrEqual(6);
    for (const site of SITES) expect(calls(bodyOf(site)).length, site).toBeGreaterThan(0);
  });

  it("every call passes the closure-table flag as its fifth argument", () => {
    for (const args of calls(STORE)) {
      const parts = args.split(",").map((p) => p.trim());
      expect(parts, args).toHaveLength(5);
      expect(parts[4], args).toBe("closedDays");
    }
  });

  it("each site asks closedDaysOn() before it builds its query", () => {
    for (const site of SITES) {
      const body = bodyOf(site);
      const ask = body.search(/const closedDays = await closedDaysOn\(\);/);
      const use = body.search(/closureOverlapExists\s*\(/);
      expect(ask, site).toBeGreaterThan(-1);
      expect(ask, site).toBeLessThan(use);
    }
  });

  it("the flag is REQUIRED, never defaulted, so a new call cannot compile without deciding", () => {
    const def = STORE.slice(STORE.indexOf("function closureOverlapExists("));
    const sig = def.slice(0, def.indexOf("): SQL"));
    expect(sig).toMatch(/closedDays:\s*boolean\s*,?\s*$/);
    expect(sig).not.toMatch(/closedDays\s*[?:][^,]*=/);
  });

  it("the flag reads the shared schema guard, on the owning connection the queries use", () => {
    const fn = STORE.slice(STORE.indexOf("async function closedDaysOn("));
    expect(fn.slice(0, fn.indexOf("\n}"))).toMatch(/locationClosedDaysSchemaPresent\(getDbAdmin\(\)\)/);
  });

  it("the dated fragment is defined once and reads location_closed_days the way the design says", () => {
    expect((STORE.match(/function closedDayOverlapExists\(/g) ?? []).length).toBe(1);
    expect((STORE.match(/from location_closed_days c/g) ?? []).length).toBe(1);
    const frag = STORE.slice(STORE.indexOf("function closedDayOverlapExists("));
    const body = frag.slice(0, frag.indexOf("\n}"));
    // Every Lisbon date the window touches, from its start's date to its end's.
    expect(body).toMatch(/generate_series\(\s*\(\(\$\{s\}\) at time zone \$\{LISBON\}\)::date,\s*\(\(\$\{e\}\) at time zone \$\{LISBON\}\)::date,\s*interval '1 day'\s*\)/);
    // Both ends of the range inclusive.
    expect(body).toMatch(/cd\.day::date between c\.starts_on and c\.ends_on/);
    // Scoped to the tenant and the clinic.
    expect(body).toMatch(/c\.tenant_id = \$\{tenantId\}/);
    expect(body).toMatch(/c\.location_id = \$\{locationId\}/);
    // Half-open overlap, start < window end and end > window start.
    expect(body).toMatch(/end\) at time zone \$\{LISBON\} < \(\$\{e\}\)/);
    expect(body).toMatch(/end\) at time zone \$\{LISBON\} > \(\$\{s\}\)/);
    // A whole day runs midnight to the NEXT midnight, in Lisbon.
    expect(body).toMatch(/then \(cd\.day::date \+ 1\)::timestamp/);
  });

  it("the lunch closure is still read, unchanged, in the same fragment", () => {
    const def = STORE.slice(STORE.indexOf("function closureOverlapExists("));
    const body = def.slice(0, def.indexOf("\n}"));
    expect(body).toMatch(/middayClosureOverlapExists\(/);
    expect(STORE).toMatch(/l\.midday_closed_from is not null/);
  });

  it("CONTROL: the argument check goes red on a call that drops the flag", () => {
    const broken = STORE.replace(
      /closureOverlapExists\(principal\.tenantId, locationId, startsAt, endsAt, closedDays\)/,
      "closureOverlapExists(principal.tenantId, locationId, startsAt, endsAt)",
    );
    expect(broken).not.toBe(STORE);
    const bad = calls(broken).filter((a) => a.split(",").map((p) => p.trim())[4] !== "closedDays");
    expect(bad.length).toBeGreaterThan(0);
  });
});
