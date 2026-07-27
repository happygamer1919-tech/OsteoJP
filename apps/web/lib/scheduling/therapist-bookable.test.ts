import { describe, expect, test } from "vitest";
import { filterBookableTherapists, isBookableTherapist } from "./therapist-bookable";

// Mirrors the seeded roster (seed-e2e.mjs) PLUS the practising-owner (JP) case,
// which has no seed row: role=owner WITH a service mapping. Labels match the
// seeded fullNames so the intent is legible against the e2e.
const OWNER_OPERATOR = { id: "ivan", label: "Ivan M", roleSlug: "owner", serviceCount: 0 };
const OWNER_PRACTITIONER = { id: "jp", label: "JP", roleSlug: "owner", serviceCount: 3 };
const ADMIN = { id: "lurdes", label: "Lurdes Cruz", roleSlug: "admin", serviceCount: 0 };
const THERAPIST_MAPPED = { id: "t1", label: "E2E Therapist", roleSlug: "therapist", serviceCount: 2 };
const THERAPIST_ZERO = { id: "t2", label: "E2E Terapeuta Sem Servicos", roleSlug: "therapist", serviceCount: 0 };
const RECEPTION = { id: "r", label: "E2E Reception", roleSlug: "reception", serviceCount: 0 };

describe("isBookableTherapist (PL-05)", () => {
  test("drops the operator owner and the admin - no service mappings", () => {
    expect(isBookableTherapist(OWNER_OPERATOR)).toBe(false);
    expect(isBookableTherapist(ADMIN)).toBe(false);
  });

  test("drops reception", () => {
    expect(isBookableTherapist(RECEPTION)).toBe(false);
  });

  test("keeps every therapist, even one with zero service mappings", () => {
    expect(isBookableTherapist(THERAPIST_MAPPED)).toBe(true);
    expect(isBookableTherapist(THERAPIST_ZERO)).toBe(true);
  });

  test("keeps the practising owner - role=owner WITH a mapping (the JP case)", () => {
    expect(isBookableTherapist(OWNER_PRACTITIONER)).toBe(true);
  });
});

describe("filterBookableTherapists (PL-05)", () => {
  // The raw list is what the pre-fix query returned: every active non-reception
  // user, so the operator owner and the admin ARE present. reception is included
  // here to prove the predicate drops it too.
  const raw = [OWNER_OPERATOR, OWNER_PRACTITIONER, ADMIN, THERAPIST_MAPPED, THERAPIST_ZERO, RECEPTION];

  test("the pre-fix source contains the owner and the admin (the reported bug)", () => {
    const labels = raw.map((r) => r.label);
    expect(labels).toContain("Ivan M");
    expect(labels).toContain("Lurdes Cruz");
  });

  test("EXCLUSION: the bookable list drops owner-operator + admin + reception", () => {
    const labels = filterBookableTherapists(raw).map((r) => r.label);
    expect(labels).not.toContain("Ivan M");
    expect(labels).not.toContain("Lurdes Cruz");
    expect(labels).not.toContain("E2E Reception");
  });

  test("INCLUSION: it keeps both therapists AND the practising owner", () => {
    const labels = filterBookableTherapists(raw).map((r) => r.label);
    expect(labels).toContain("E2E Therapist");
    expect(labels).toContain("E2E Terapeuta Sem Servicos");
    expect(labels).toContain("JP");
  });

  test("COUNT: exactly the 3 practitioners survive", () => {
    expect(filterBookableTherapists(raw)).toHaveLength(3);
  });

  test("input order is preserved", () => {
    const ids = filterBookableTherapists(raw).map((r) => r.id);
    expect(ids).toEqual(["jp", "t1", "t2"]);
  });
});
