import { describe, expect, it } from "vitest";
import {
  parsePatientPrincipal,
  isPatientPrincipal,
  toPatientClaims,
  PATIENT_ROLE_CLAIM,
} from "@osteojp/auth";

// Trust-boundary unit tests for the patient principal (parsed from VERIFIED
// claims). The headline property: a STAFF token can never be read as a patient,
// and a patient_id is only ever taken from the token, never elsewhere.

const TENANT = "11111111-1111-1111-1111-111111111111";
const PATIENT = "22222222-2222-2222-2222-222222222222";
const SUB = "33333333-3333-3333-3333-333333333333";

const patientClaims = () => ({
  role: PATIENT_ROLE_CLAIM,
  tenant_id: TENANT,
  patient_id: PATIENT,
  sub: SUB,
});

describe("parsePatientPrincipal", () => {
  it("accepts a well-formed patient token", () => {
    expect(parsePatientPrincipal(patientClaims())).toEqual({
      tenantId: TENANT,
      patientId: PATIENT,
      userId: SUB,
    });
  });

  it("rejects a STAFF token (role authenticated + user_role, no patient_id)", () => {
    const staff = {
      role: "authenticated",
      user_role: "admin",
      tenant_id: TENANT,
      sub: SUB,
    };
    expect(parsePatientPrincipal(staff)).toBeNull();
    expect(isPatientPrincipal(staff)).toBe(false);
  });

  it("rejects when the role claim is not 'patient' even if patient_id is present", () => {
    // Defense: a token that smuggles a patient_id but isn't role=patient.
    expect(
      parsePatientPrincipal({ ...patientClaims(), role: "authenticated" }),
    ).toBeNull();
  });

  it("rejects a non-uuid patient_id", () => {
    expect(parsePatientPrincipal({ ...patientClaims(), patient_id: "not-a-uuid" })).toBeNull();
    expect(parsePatientPrincipal({ ...patientClaims(), patient_id: "" })).toBeNull();
  });

  it("rejects a non-uuid tenant_id", () => {
    expect(parsePatientPrincipal({ ...patientClaims(), tenant_id: "x" })).toBeNull();
  });

  it("rejects a missing sub", () => {
    const c = patientClaims() as Record<string, unknown>;
    delete c.sub;
    expect(parsePatientPrincipal(c)).toBeNull();
  });

  it("rejects null/undefined/empty claims (fail-closed)", () => {
    expect(parsePatientPrincipal(null)).toBeNull();
    expect(parsePatientPrincipal(undefined)).toBeNull();
    expect(parsePatientPrincipal({})).toBeNull();
  });
});

describe("toPatientClaims", () => {
  it("maps only tenant_id + patient_id (the RLS self-scope keys)", () => {
    const principal = parsePatientPrincipal(patientClaims())!;
    expect(toPatientClaims(principal)).toEqual({
      tenant_id: TENANT,
      patient_id: PATIENT,
    });
  });
});
