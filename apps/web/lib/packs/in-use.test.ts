import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES } from "@osteojp/auth";

import {
  PACKS_IN_USE_CAPABILITIES,
  buildPacksInUse,
  comparePacksInUse,
  formatEurosShort,
  isInUseCandidate,
  isPackInUse,
  matchesPatientSearch,
  summarizePackInstance,
  type PackInstanceRow,
  type PackSession,
} from "./in-use";

/**
 * "Packs em uso": the in-use rule, the RESERVADAS / LIVRES / Realizadas / Por
 * Realizar counts, the A to Z order and the quick search. Pure, no database.
 */

const NOW = new Date("2026-11-02T12:00:00Z");
const past = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

let seq = 0;
const row = (over: Partial<PackInstanceRow> = {}): PackInstanceRow => ({
  instanceId: `inst-${++seq}`,
  patientId: `pat-${seq}`,
  patientName: "Ana Silva",
  packName: "Fisioterapia 10",
  packPriceCents: 45000,
  sessionsTotal: 10,
  legacyConsumed: 0,
  purchasedAt: past(30),
  ...over,
});
const sessions = (...dates: Date[]): PackSession[] =>
  dates.map((d, i) => ({ appointmentId: `appt-${i}`, startsAt: d }));

describe("the counts", () => {
  it("RESERVADAS is the linked non-cancelled sessions, LIVRES the rest; they add up to the total", () => {
    const v = summarizePackInstance(row(), sessions(past(3), past(1), future(2)), NOW);
    expect(v.reserved).toBe(3);
    expect(v.free).toBe(7);
    expect(v.reserved + v.free).toBe(10);
  });

  it("legacy_consumed counts as reserved and as done, as the balance counts it", () => {
    const v = summarizePackInstance(row({ legacyConsumed: 2 }), sessions(past(1), future(1)), NOW);
    expect(v.reserved).toBe(4);
    expect(v.free).toBe(6);
    expect(v.done).toBe(3);
    expect(v.upcoming).toBe(1);
  });

  it("Realizadas are the past sessions, Por Realizar the future ones", () => {
    const v = summarizePackInstance(row(), sessions(future(5), past(2), future(1)), NOW);
    expect(v.done).toBe(1);
    expect(v.upcoming).toBe(2);
  });

  it("a session exactly now is done, not upcoming", () => {
    const v = summarizePackInstance(row(), sessions(new Date(NOW)), NOW);
    expect(v.done).toBe(1);
    expect(v.upcoming).toBe(0);
  });

  it("an overdrawn pacote reads LIVRES 0 and RESERVADAS above the total, never a negative", () => {
    const many = sessions(...Array.from({ length: 11 }, (_, i) => past(i + 1)));
    const v = summarizePackInstance(row(), many, NOW);
    expect(v.free).toBe(0);
    expect(v.reserved).toBe(11);
  });

  it("the session list is in time order whatever order the read returned", () => {
    const v = summarizePackInstance(row(), sessions(future(3), past(3), future(1)), NOW);
    expect(v.sessions.map((x) => x.startsAt.getTime())).toEqual(
      [past(3), future(1), future(3)].map((d) => d.getTime()),
    );
  });
});

describe("the in-use rule", () => {
  it("in use with a free session", () => {
    expect(isPackInUse({ free: 1, upcoming: 0 })).toBe(true);
  });

  it("in use with no free session but a reservation still ahead", () => {
    expect(isPackInUse({ free: 0, upcoming: 1 })).toBe(true);
  });

  it("NOT in use when every session is spent and in the past", () => {
    expect(isPackInUse({ free: 0, upcoming: 0 })).toBe(false);
  });

  it("a pacote with no sessions booked yet is in use (all free)", () => {
    const page = buildPacksInUse([row()], new Map(), NOW, "");
    expect(page.totalInUse).toBe(1);
    expect(page.rows[0]!.free).toBe(10);
  });

  it("a finished pacote drops off; one whose last session is next week stays", () => {
    const finished = row({ patientName: "Bruno", sessionsTotal: 2 });
    const lastAhead = row({ patientName: "Carla", sessionsTotal: 2 });
    const page = buildPacksInUse(
      [finished, lastAhead],
      new Map([
        [finished.instanceId, sessions(past(9), past(2))],
        [lastAhead.instanceId, sessions(past(9), future(7))],
      ]),
      NOW,
      "",
    );
    expect(page.rows.map((r) => r.patientName)).toEqual(["Carla"]);
    expect(page.totalInUse).toBe(1);
  });
});

describe("the read's pre-filter cannot drop a pacote with free sessions", () => {
  it("fewer visible visits only ever make the visible free count larger", () => {
    // True linked 3 of 10 -> free 7. A therapist who sees 1 of the 3 reads free 9.
    expect(isInUseCandidate({ sessionsTotal: 10, legacyConsumed: 0, visibleLinked: 1, visibleUpcoming: 0 })).toBe(true);
  });

  it("a fully spent pacote with a visible future visit is a candidate", () => {
    expect(isInUseCandidate({ sessionsTotal: 2, legacyConsumed: 0, visibleLinked: 2, visibleUpcoming: 1 })).toBe(true);
  });

  it("a fully spent pacote with nothing ahead is not", () => {
    expect(isInUseCandidate({ sessionsTotal: 2, legacyConsumed: 1, visibleLinked: 1, visibleUpcoming: 0 })).toBe(false);
  });
});

describe("sorting: NOME UTENTE A to Z", () => {
  it("orders by patient name, accent- and case-insensitively, the Portuguese way", () => {
    const names = ["joão", "Álvaro", "Beatriz", "ana", "Zé"];
    const page = buildPacksInUse(
      names.map((n) => row({ patientName: n })),
      new Map(),
      NOW,
      "",
    );
    expect(page.rows.map((r) => r.patientName)).toEqual(["Álvaro", "ana", "Beatriz", "joão", "Zé"]);
  });

  it("one patient with two pacotes: by pack name, then the newest purchase first", () => {
    const a = summarizePackInstance(row({ patientName: "Rita", packName: "Osteopatia 5", purchasedAt: past(40) }), [], NOW);
    const b = summarizePackInstance(row({ patientName: "Rita", packName: "Osteopatia 5", purchasedAt: past(5) }), [], NOW);
    const c = summarizePackInstance(row({ patientName: "Rita", packName: "NESA 10" }), [], NOW);
    expect([a, b, c].sort(comparePacksInUse).map((v) => v.instanceId)).toEqual([
      c.instanceId,
      b.instanceId,
      a.instanceId,
    ]);
  });
});

describe("Pesquisa rápida de utente", () => {
  it("matches every word, in any order, ignoring case and accents", () => {
    expect(matchesPatientSearch("Maria João Ferreira Santos", "santos joao")).toBe(true);
    expect(matchesPatientSearch("Maria João Ferreira Santos", "MARIA ferr")).toBe(true);
  });

  it("refuses when one word is missing", () => {
    expect(matchesPatientSearch("Maria João Santos", "maria costa")).toBe(false);
  });

  it("an empty or blank search matches everybody", () => {
    expect(matchesPatientSearch("Ana", "")).toBe(true);
    expect(matchesPatientSearch("Ana", "   ")).toBe(true);
  });

  it("narrows the rows but NOT the 'a decorrer' count", () => {
    const page = buildPacksInUse(
      [row({ patientName: "Ana Silva" }), row({ patientName: "Bruno Costa" }), row({ patientName: "Ana Costa" })],
      new Map(),
      NOW,
      "costa",
    );
    expect(page.totalInUse).toBe(3);
    expect(page.rows.map((r) => r.patientName)).toEqual(["Ana Costa", "Bruno Costa"]);
  });
});

describe("the pack total", () => {
  it("prints whole euros without decimals and cents with a comma", () => {
    expect(formatEurosShort(45000)).toBe("450");
    expect(formatEurosShort(23750)).toBe("237,50");
    expect(formatEurosShort(4705)).toBe("47,05");
    expect(formatEurosShort(0)).toBe("0");
  });
});

describe("role access", () => {
  it("the page needs patients:read AND appointments:read", () => {
    expect([...PACKS_IN_USE_CAPABILITIES].sort()).toEqual(["appointments:read", "patients:read"]);
  });

  it("every staff role holds both today, so every role opens the page; the rows are narrowed by the database", () => {
    for (const role of ROLES) {
      for (const c of PACKS_IN_USE_CAPABILITIES) {
        expect(PERMISSIONS[role].has(c), `${role} ${c}`).toBe(true);
      }
    }
  });
});
