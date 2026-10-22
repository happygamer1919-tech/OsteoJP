// Q-M (owner ruling, 2026-10-20) restricts the PATIENT app to therapists mapped
// to the chosen service. It says, in as many words, that the STAFF agenda is
// unchanged: PL-06a (2026-07-28) still holds there, so any therapist may be
// booked for any active service and the mapping only PRESELECTS.
//
// THIS FILE PINS THE STAFF HALF, BY SOURCE, because the risk is a well-meant
// "consistency" edit that copies the portal's filter into the agenda. Every
// staff write path in actions.ts is checked, not only createAppointment: the
// mapping may be READ in exactly one place, the preselection lookup
// (getTherapistServices), and nowhere else in this module. The preselection
// value itself is proven against Postgres in
// apps/web/lib/admin/therapist-services.db.test.ts.
//
// COMMENTS ARE STRIPPED FIRST, so prose naming the mapping cannot satisfy or
// break an arm; the self-test at the bottom pins that.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

const ACTIONS = stripComments(readFileSync(join(__dirname, "actions.ts"), "utf8"));
const DRAWER = stripComments(
  readFileSync(join(__dirname, "..", "..", "app", "agenda", "appointment-drawer.tsx"), "utf8"),
);

/** The body of one exported function, up to the next export. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

const MAPPING = /getTherapistServiceIds|therapistServices|therapist_services|deliversServiceExists/;

describe("Q-M leaves the staff agenda on PL-06a (any therapist, any service)", () => {
  it("the drawer's Servico select is every active service, never narrowed by the mapping", () => {
    expect(DRAWER).toMatch(/const serviceOptions = options\.services;/);
  });

  it("the drawer reads the mapping only to preselect the primary, ids[0]", () => {
    expect(DRAWER).toMatch(/applyDefaultService\(ids\[0\]\)/);
  });

  it("no staff write path in actions.ts consults the service mapping", () => {
    for (const name of [
      "createAppointment",
      "batchScheduleAppointments",
      "cloneAppointment",
      "updateAppointment",
      "rescheduleAppointment",
      "confirmAppointmentRequest",
    ]) {
      expect(body(ACTIONS, name), name).not.toMatch(MAPPING);
    }
  });

  it("the mapping is read in exactly one action: the preselection lookup", () => {
    expect(body(ACTIONS, "getTherapistServices")).toMatch(/getTherapistServiceIds\(/);
    expect(ACTIONS.match(/getTherapistServiceIds\(/g) ?? []).toHaveLength(1);
  });

  it("stripper self-test: a comment naming the mapping does not count", () => {
    const src = "// getTherapistServiceIds( in a comment\nexport async function f() {}\n";
    expect(stripComments(src)).not.toMatch(MAPPING);
    expect(src).toMatch(MAPPING);
  });
});
