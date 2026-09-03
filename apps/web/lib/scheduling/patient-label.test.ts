/**
 * patient-label.test.ts — SEC-appointment-vanishes-with-patient-scope.
 *
 * Two things, and the second is the one that will earn its keep.
 *
 * 1. The label says the slot is TAKEN. That is the ruling, and it is a claim
 *    about wording rather than about types, so it is asserted rather than left
 *    to a reviewer.
 *
 * 2. THE COMMENT IN `data.ts` IS PINNED AGAINST THE MIGRATIONS. That comment
 *    says `users` and `locations` may stay INNER JOINs because their policies
 *    are tenant-only and have never been narrowed per row. If that ever stops
 *    being true, the agenda starts losing rows again for a second reason and
 *    nothing else in the repository would notice - the row would simply not be
 *    there, which is the whole shape of this defect. So the claim is checked
 *    against the migration files it is a claim about, the way
 *    `handover-counts-match-the-render.test.mjs` pins the renderer's filter.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isPatientWithheld, patientLabel } from "./patient-label";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "../../../../packages/db/migrations");

describe("the withheld label", () => {
  it("passes a real name straight through", () => {
    expect(patientLabel("Maria Silva")).toBe("Maria Silva");
    expect(isPatientWithheld("Maria Silva")).toBe(false);
  });

  it("says a booking is THERE, not that a name is missing", () => {
    // "Sem nome" or "—" would describe the data. The receptionist needs the
    // slot described: something is booked here and it is not yours to read.
    expect(patientLabel(null)).toBe("Marcação reservada");
    expect(isPatientWithheld(null)).toBe(true);
  });

  it("never returns an empty string, which would read as a rendering fault", () => {
    expect(patientLabel(null).trim().length).toBeGreaterThan(0);
  });
});

describe("the two joins that stay INNER are still safe to leave inner", () => {
  const sqlFiles = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, body: readFileSync(join(MIGRATIONS, f), "utf8") }));

  /** Every CREATE POLICY on the named table, across every migration. */
  const policiesOn = (table: string) =>
    sqlFiles.flatMap(({ name, body }) =>
      [...body.matchAll(
        new RegExp(
          String.raw`CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.${table}\b([\s\S]*?);`,
          "gi",
        ),
      )].map((m) => ({ file: name, policy: m[1] as string, sql: m[0] as string })),
    );

  for (const table of ["users", "locations"]) {
    it(`every policy on ${table} is tenant-only, so the inner join cannot drop a row`, () => {
      const found = policiesOn(table);
      // A table with no policy at all would silently pass a "none of them
      // narrow" check, so the count is asserted first.
      expect(found.length).toBeGreaterThan(0);

      for (const { file, policy, sql } of found) {
        // The narrowing this guard is about is the per-row kind 0073/0074
        // introduced for patients: a viewer-scoped set, or a per-row helper.
        // `auth_admin_read_users` (0002) is the supabase auth hook's own
        // read, not an `authenticated` policy, and it is allowed to differ.
        if (policy === "auth_admin_read_users") continue;
        const narrowing = [
          "viewer_visible_patient_ids",
          "viewer_treated_patient_ids",
          "viewer_location_ids",
          "location_in_viewer_scope",
          "viewer_has_location_assignment",
        ].filter((fn) => sql.includes(fn));
        expect(
          narrowing,
          `${file}: policy "${policy}" on ${table} narrows per row (${narrowing.join(", ")}). ` +
            `baseAppointmentQuery INNER JOINs ${table} on the strength of it not doing that - ` +
            `make it a LEFT JOIN and give the field the same withheld treatment patientName has.`,
        ).toEqual([]);
      }
    });
  }

  it("patients IS narrowed per row, which is why it is the one that had to move", () => {
    // The positive control. Without it the loop above would pass just as well
    // against a repository where nothing is narrowed anywhere - and it would
    // then be proving that the regexes do not match, not that the policies are
    // tenant-only.
    const patientPolicies = policiesOn("patients");
    const narrowed = patientPolicies.filter(
      (p) =>
        p.sql.includes("viewer_visible_patient_ids") ||
        p.sql.includes("viewer_treated_patient_ids"),
    );
    expect(narrowed.length).toBeGreaterThan(0);
  });
});
