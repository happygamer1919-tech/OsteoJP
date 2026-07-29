import { describe, expect, test } from "vitest";
import { filterBookableTherapists, isBookableTherapist } from "./therapist-bookable";

// PL-06b: "bookable" is now the explicit is_bookable flag (migration 0046), not
// a role/mapping derivation. These fixtures carry the ATTESTED flag values
// (owner-signed id-map 2026-07-28), so the named-real rows are attested, not
// fabricated: JP is is_bookable TRUE (the practising owner, role != therapist,
// zero mappings — the case the PL-05 predicate wrongly dropped); the operator
// owner (Ivan M), the admin (Lurdes), and reception are is_bookable FALSE.
// Labels match the seeded fullNames so the intent stays legible against the e2e.
const OWNER_OPERATOR = { id: "ivan", label: "Ivan M", isBookable: false };
const OWNER_PRACTITIONER = { id: "jp", label: "JP", isBookable: true };
const ADMIN = { id: "lurdes", label: "Lurdes Cruz", isBookable: false };
const THERAPIST_MAPPED = { id: "t1", label: "E2E Therapist", isBookable: true };
const THERAPIST_ZERO = { id: "t2", label: "E2E Terapeuta Sem Servicos", isBookable: true };
const RECEPTION = { id: "r", label: "E2E Reception", isBookable: false };

describe("isBookableTherapist (PL-06b)", () => {
  test("drops the operator owner and the admin - is_bookable false", () => {
    expect(isBookableTherapist(OWNER_OPERATOR)).toBe(false);
    expect(isBookableTherapist(ADMIN)).toBe(false);
  });

  test("drops reception - is_bookable false", () => {
    expect(isBookableTherapist(RECEPTION)).toBe(false);
  });

  test("keeps every bookable therapist, including one with zero service mappings", () => {
    expect(isBookableTherapist(THERAPIST_MAPPED)).toBe(true);
    expect(isBookableTherapist(THERAPIST_ZERO)).toBe(true);
  });

  test("keeps the practising owner JP - is_bookable true despite role != therapist and zero mappings", () => {
    expect(isBookableTherapist(OWNER_PRACTITIONER)).toBe(true);
  });
});

describe("filterBookableTherapists (PL-06b)", () => {
  // The raw list is what the pre-filter query returns: every active user. The
  // flag alone decides who survives — role and mapping count are irrelevant now.
  const raw = [OWNER_OPERATOR, OWNER_PRACTITIONER, ADMIN, THERAPIST_MAPPED, THERAPIST_ZERO, RECEPTION];

  test("the pre-filter source contains the owner and the admin", () => {
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

  test("INCLUSION: it keeps both therapists AND the practising owner JP", () => {
    const labels = filterBookableTherapists(raw).map((r) => r.label);
    expect(labels).toContain("E2E Therapist");
    expect(labels).toContain("E2E Terapeuta Sem Servicos");
    expect(labels).toContain("JP");
  });

  test("COUNT: exactly the 3 bookable staff survive", () => {
    expect(filterBookableTherapists(raw)).toHaveLength(3);
  });

  test("input order is preserved", () => {
    const ids = filterBookableTherapists(raw).map((r) => r.id);
    expect(ids).toEqual(["jp", "t1", "t2"]);
  });
});
