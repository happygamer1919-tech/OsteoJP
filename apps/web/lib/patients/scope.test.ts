import { beforeEach, describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { patients } from "@osteojp/db";
import type { RequestContext } from "../auth/context";

vi.mock("server-only", () => ({}));
vi.mock("../auth/context", () => ({ runScoped: vi.fn() }));

/**
 * The schema probe is the one seam: whether 0098's clinic-limited helper exists
 * is a fact about a database, and this file renders SQL without one. Each test
 * says which answer it runs under; the probe's own caching is pinned in
 * care-team-reads-gate.test.ts.
 */
const gate = vi.hoisted(() => ({ present: true }));
vi.mock("./care-team-reads-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./care-team-reads-gate")>();
  return { ...actual, careTeamClinicHelperPresent: vi.fn(async () => gate.present) };
});

import { CARE_TEAM_CLINIC_HELPER, careTeamClinicHelperPresent } from "./care-team-reads-gate";
import {
  therapistPatientReadScope,
  therapistPatientScope,
  therapistPatientScopeFor,
  therapistRegistoWriteScope,
} from "./scope";

/**
 * W10-04 isolation: therapistPatientScope returns a NARROWING predicate ONLY for
 * the therapist role; owner/admin/reception are unscoped (undefined -> no extra
 * WHERE). The predicate contents (appointment-participation UNION created_by) are
 * exercised end-to-end by the negative-isolation E2E; this pins the role gate.
 */
const ctx = (role: RequestContext["role"]): RequestContext => ({
  tenantId: "00000000-0000-0000-0000-0000000000a1",
  role,
  userId: "00000000-0000-0000-0000-00000000u001",
});

describe("therapistPatientScope — role-gated patient narrowing", () => {
  it("returns a predicate for the therapist role", () => {
    expect(therapistPatientScope(ctx("therapist"), patients.id)).toBeDefined();
  });

  it("returns undefined (no narrowing) for owner, admin and reception", () => {
    expect(therapistPatientScope(ctx("owner"), patients.id)).toBeUndefined();
    expect(therapistPatientScope(ctx("admin"), patients.id)).toBeUndefined();
    expect(therapistPatientScope(ctx("reception"), patients.id)).toBeUndefined();
  });
});

/**
 * CARE-02a (0098 v2): the READ scope is the narrow scope OR the care team AT THE
 * VIEWER'S OWN CLINICS (the owner's ruling of 2026-09-27), through the same
 * clinic-limited helper RLS uses, and the narrow scope stays exactly what it
 * was. Asserted on the SQL Postgres would receive, rendered through drizzle's
 * real dialect.
 */
const render = (q: SQL | undefined) => (q ? new PgDialect().sqlToQuery(q).sql : "");
/** 0091's helper: the care team at EVERY clinic. The clinic limit must not use it. */
const UNLIMITED = "viewer_care_team_patient_ids()";
const LIMITED = `${CARE_TEAM_CLINIC_HELPER}()`;

describe("CARE-02a v2: therapistPatientReadScope adds the care team at the viewer's clinics, and only for reads", () => {
  beforeEach(() => {
    gate.present = true;
    vi.mocked(careTeamClinicHelperPresent).mockClear();
  });

  it("the read scope is the narrow scope OR the clinic-limited care-team arm, keyed on the same column", async () => {
    const narrow = render(therapistPatientScope(ctx("therapist"), patients.id));
    const read = render(await therapistPatientReadScope(ctx("therapist"), patients.id));
    expect(read).toContain(narrow);
    expect(read).toContain(`"patients"."id" = ANY (coalesce((SELECT public.${LIMITED}), '{}'::uuid[]))`);
  });

  it("the care-team arm is NOT 0091's unlimited helper (the clinic limit's own mutation)", async () => {
    // A therapist on the team of a patient at ANOTHER clinic would be shown the
    // Documentos (tenant-only RLS) of a patient whose ficha RLS refuses them.
    expect(LIMITED).not.toBe(UNLIMITED);
    expect(render(await therapistPatientReadScope(ctx("therapist"), patients.id))).not.toContain(UNLIMITED);
  });

  it("the helper is named exactly once, as an initplan, and the arm is ORed, never ANDed", async () => {
    const read = render(await therapistPatientReadScope(ctx("therapist"), patients.id));
    expect(read.split(LIMITED)).toHaveLength(2);
    expect(read).toMatch(/\)\s+OR "patients"\."id" = ANY \(coalesce\(\(SELECT public\./);
  });

  it("WITHOUT 0098 (no helper) the read scope IS the narrow scope, so no statement names a missing function", async () => {
    gate.present = false;
    const read = render(await therapistPatientReadScope(ctx("therapist"), patients.id));
    expect(read).toBe(render(therapistPatientScope(ctx("therapist"), patients.id)));
    expect(read).not.toContain(CARE_TEAM_CLINIC_HELPER);
    expect(careTeamClinicHelperPresent).toHaveBeenCalledTimes(1);
  });

  it("the NARROW scope carries no care-team arm (every write keeps it)", () => {
    const narrow = render(therapistPatientScope(ctx("therapist"), patients.id));
    expect(narrow).not.toContain(UNLIMITED);
    expect(narrow).not.toContain(CARE_TEAM_CLINIC_HELPER);
  });

  it("owner, admin and reception get no therapist predicate from either scope, and never trigger the probe", async () => {
    for (const role of ["owner", "admin", "reception"] as const) {
      expect(await therapistPatientReadScope(ctx(role), patients.id)).toBeUndefined();
      expect(await therapistPatientScopeFor(ctx(role), patients.id, "read")).toBeUndefined();
    }
    expect(careTeamClinicHelperPresent).not.toHaveBeenCalled();
  });

  it('therapistPatientScopeFor: "read" is the read scope, "write" the narrow one', async () => {
    expect(render(await therapistPatientScopeFor(ctx("therapist"), patients.id, "read"))).toBe(
      render(await therapistPatientReadScope(ctx("therapist"), patients.id)),
    );
    expect(render(await therapistPatientScopeFor(ctx("therapist"), patients.id, "write"))).toBe(
      render(therapistPatientScope(ctx("therapist"), patients.id)),
    );
  });
});

describe("CARE-02a: therapistRegistoWriteScope is clinical_records_select's therapist arm as it stood before 0098", () => {
  it("authored by the viewer OR the narrow patient scope on clinical_records.patient_id, and no care team", () => {
    const q = therapistRegistoWriteScope(ctx("therapist"));
    const rendered = new PgDialect().sqlToQuery(q!);
    expect(rendered.sql).toMatch(/^\("clinical_records"\."practitioner_id" = \$1 OR \(/);
    expect(rendered.params[0]).toBe(ctx("therapist").userId);
    expect(rendered.sql).toContain('po.id = "clinical_records"."patient_id"');
    expect(rendered.sql).not.toContain(UNLIMITED);
    expect(rendered.sql).not.toContain(CARE_TEAM_CLINIC_HELPER);
  });

  it("is undefined for owner, admin and reception", () => {
    for (const role of ["owner", "admin", "reception"] as const) {
      expect(therapistRegistoWriteScope(ctx(role))).toBeUndefined();
    }
  });
});
