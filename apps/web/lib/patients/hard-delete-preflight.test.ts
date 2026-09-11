import { describe, expect, it } from "vitest";
import { getStrings } from "@osteojp/i18n";

import {
  blockingCounts,
  cascadingCounts,
  CASCADES,
  classLabel,
  HARD_DELETE_CLASSES,
  PERMANENT,
  presentCounts,
  refusal,
  type HardDeleteCount,
} from "./hard-delete-preflight";

const pt = getStrings("pt");
const c = (key: HardDeleteCount["key"], count: number): HardDeleteCount => ({ key, count });

/**
 * The clinic's complaint was not "the delete failed". It was that a patient
 * could not be deleted and NOTHING SAID WHY - `hardDeletePatient` sums ten
 * classes and returns one word for all of them. These tests are about the split
 * being faithful, and about the module not promising a cascade the database
 * would refuse.
 */
describe("hard-delete preflight", () => {
  it("names all ten classes hardDeletePatient counts", () => {
    expect(HARD_DELETE_CLASSES).toHaveLength(10);
    expect(HARD_DELETE_CLASSES).toContain("appointmentNotes");
    expect(HARD_DELETE_CLASSES).toContain("patientNoteRevisions");
  });

  it("every class has a pt-PT label, and none is the raw key", () => {
    for (const key of HARD_DELETE_CLASSES) {
      const label = classLabel(key);
      expect(label, `${key} has no label`).toBeTruthy();
      expect(label).not.toBe(key);
    }
  });

  it("drops zero counts — a class with no rows is not in anybody's way", () => {
    const counts = [c("appointments", 0), c("appointmentNotes", 1), c("invoices", 0)];
    expect(presentCounts(counts)).toEqual([c("appointmentNotes", 1)]);
  });

  /**
   * THE LOAD-BEARING CASE UNTIL 0084 IS APPLIED. A note is present, and it is a
   * BLOCKER rather than something the delete is about to destroy. If CASCADES
   * ever gains a class while the policy is still missing, this reddens - which
   * is exactly when a screen would otherwise start promising a delete that the
   * database refuses at zero rows.
   */
  it("promises no cascade while CASCADES is empty: a note BLOCKS, it does not get destroyed", () => {
    expect(CASCADES).toHaveLength(0);
    const counts = [c("appointmentNotes", 1)];
    expect(cascadingCounts(counts)).toEqual([]);
    expect(blockingCounts(counts)).toEqual([c("appointmentNotes", 1)]);
    expect(refusal(counts)).toEqual({ blocked: true, permanent: false });
  });

  it("reproduces the clinic's case exactly: notes alone still refuse the delete", () => {
    // Measured on a lane database: a patient whose ONLY remaining reference is
    // one note still returns has_references.
    const counts = HARD_DELETE_CLASSES.map((k) => c(k, k === "appointmentNotes" ? 1 : 0));
    expect(refusal(counts).blocked).toBe(true);
    expect(blockingCounts(counts)).toEqual([c("appointmentNotes", 1)]);
  });

  it("a clinical record is refused PERMANENTLY, and that is a different sentence", () => {
    // Not a severity label: a locked record can never be removed, so no amount
    // of tidying makes the patient deletable. Telling somebody to go and clear
    // it would waste their afternoon.
    expect(PERMANENT).toEqual(["clinicalRecords"]);
    expect(refusal([c("clinicalRecords", 2)])).toEqual({ blocked: true, permanent: true });
    expect(refusal([c("appointments", 3)])).toEqual({ blocked: true, permanent: false });
    expect(pt["patients.hardDeleteBlockedPermanently"]).toBeTruthy();
  });

  it("nothing present means nothing blocks", () => {
    const counts = HARD_DELETE_CLASSES.map((k) => c(k, 0));
    expect(refusal(counts)).toEqual({ blocked: false, permanent: false });
    expect(blockingCounts(counts)).toEqual([]);
  });

  it("keeps input order, so the list reads in the order the guard checks", () => {
    const counts = [c("appointments", 3), c("appointmentNotes", 1), c("invoices", 2)];
    expect(blockingCounts(counts).map((x) => x.key)).toEqual([
      "appointments",
      "appointmentNotes",
      "invoices",
    ]);
  });
});
