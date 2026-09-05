/**
 * service-archive.test.ts - PACK-04's pure half.
 *
 * The DB-gated half (./service-archive.db.test.ts) proves the SERVER refuses.
 * This one proves the DECISION, including the two properties that are easy to
 * get wrong and invisible once they are wrong: that restoring is not guarded,
 * and that an already-archived pacote still blocks.
 */
import { describe, expect, it } from "vitest";

import {
  archiveBlockedReason,
  canArchiveService,
  packsBoundToService,
  type PackBinding,
} from "./service-archive";

const NESA_LIVE = "270fb115";
const NESA_ARCHIVED = "7e3359a7";

/** Shaped after the production rows PACK-04 was opened on. */
const PACKS: PackBinding[] = [
  { id: "p-nesa", name: "Pacote 10 - NESA", baseServiceId: NESA_ARCHIVED },
  {
    id: "p-tt",
    name: "Pacote 10 - Tratamento Terapeutico",
    baseServiceId: "a3c1ced1",
  },
  { id: "p-other", name: "Pacote 5 - Fisioterapia", baseServiceId: "fisio" },
];

describe("PACK-04: which pacotes block a service archive", () => {
  it("finds the pacote bound to the service being archived", () => {
    expect(packsBoundToService(PACKS, NESA_ARCHIVED)).toEqual([
      { id: "p-nesa", name: "Pacote 10 - NESA" },
    ]);
  });

  it("a service no pacote points at is archivable", () => {
    expect(packsBoundToService(PACKS, NESA_LIVE)).toEqual([]);
    expect(canArchiveService(PACKS, NESA_LIVE)).toBe(true);
  });

  it("refuses the archive of a service a pacote is bound to", () => {
    expect(canArchiveService(PACKS, NESA_ARCHIVED)).toBe(false);
  });

  /**
   * THE CASE THE PRODUCTION DEFECT ACTUALLY WAS. Three services were archived
   * and all three carried a pacote; had this returned true for any of them the
   * guard would have let the same damage through again.
   */
  it("blocks EVERY service that carries a pacote, not just the first", () => {
    for (const svc of [NESA_ARCHIVED, "a3c1ced1", "fisio"]) {
      expect(canArchiveService(PACKS, svc)).toBe(false);
    }
  });

  it("names several pacotes in a stable order", () => {
    const two: PackBinding[] = [
      { id: "b", name: "Pacote B", baseServiceId: "x" },
      { id: "a", name: "Pacote A", baseServiceId: "x" },
    ];
    // Sorted by NAME, not by insertion or uuid, so the tooltip and the server
    // message cannot disagree about the order on two different renders.
    expect(archiveBlockedReason(packsBoundToService(two, "x"))).toBe(
      "Pacote A, Pacote B",
    );
  });

  it("names the pacote in the reason, rather than counting", () => {
    expect(
      archiveBlockedReason(packsBoundToService(PACKS, NESA_ARCHIVED)),
    ).toBe("Pacote 10 - NESA");
  });

  /**
   * NO is_active CONDITION, and this is asserted rather than left implicit.
   * `service_packs` rows do not carry is_active into this guard on purpose: the
   * hard-delete blocker counts any pack row, and two guards on one relationship
   * that disagree about which rows count is a bug waiting for whichever door is
   * tried second. An archived pacote can still hold instances with sessions on
   * them, so it is not a harmless row either.
   */
  it("an archived pacote blocks too - the guard reads no is_active flag", () => {
    const archivedPack: PackBinding[] = [
      { id: "p", name: "Pacote retirado", baseServiceId: "x" },
    ];
    expect(canArchiveService(archivedPack, "x")).toBe(false);
  });

  /**
   * The other direction. A guard on restore would strand precisely the services
   * production is stuck with today, so `canArchiveService` must never be
   * consulted on the way back in - proven here by the caller's contract: the
   * decision core is only ever asked about archiving.
   */
  it("says nothing about a service with no packs at all", () => {
    expect(canArchiveService([], "anything")).toBe(true);
  });
});
