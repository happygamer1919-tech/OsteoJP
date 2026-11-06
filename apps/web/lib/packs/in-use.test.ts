import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLES } from "@osteojp/auth";

import {
  PACKS_IN_USE_CAPABILITIES,
  PATIENT_PACKS_READ_CAP,
  buildPacksInUse,
  buildPatientPacks,
  comparePacksByLastUse,
  comparePacksInUse,
  formatEurosShort,
  isInUseCandidate,
  isPackInUse,
  lastPackUse,
  matchesPatientSearch,
  packsSortHref,
  parsePacksInUseSort,
  sortPacksInUse,
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

describe("no age limit (Q15, 2026-11-04): sessions left means 'a decorrer', however old", () => {
  const YEARS_20 = 20 * 365;

  it("a pacote bought 20 years ago, never used, with every session left, is in use and counted", () => {
    const old = row({ patientName: "Antiga", purchasedAt: past(YEARS_20) });
    const page = buildPacksInUse([old], new Map(), NOW, "");
    expect(page.totalInUse).toBe(1);
    expect(page.rows.map((r) => r.instanceId)).toEqual([old.instanceId]);
    expect(page.rows[0]!.free).toBe(10);
  });

  it("a pacote bought 20 years ago, last used 19 years ago, with one session left, is in use", () => {
    const old = row({ sessionsTotal: 4, legacyConsumed: 1, purchasedAt: past(YEARS_20) });
    const page = buildPacksInUse(
      [old],
      new Map([[old.instanceId, sessions(past(YEARS_20 - 30), past(YEARS_20 - 365))]]),
      NOW,
      "",
    );
    expect(page.totalInUse).toBe(1);
    expect(page.rows[0]!.free).toBe(1);
    expect(page.rows[0]!.lastUsedAt?.getTime()).toBe(past(YEARS_20 - 365).getTime());
  });

  it("the read's pre-filter keeps an old pacote with sessions left: the rule takes no date", () => {
    expect(isInUseCandidate({ sessionsTotal: 5, legacyConsumed: 4, visibleLinked: 0, visibleUpcoming: 0 })).toBe(true);
  });

  it("age alone never drops a pacote: the same pacote at 1 day and at 20 years gives the same answer", () => {
    for (const days of [1, 365, 5 * 365, YEARS_20]) {
      const r = row({ purchasedAt: past(days) });
      const page = buildPacksInUse([r], new Map([[r.instanceId, sessions(past(days - 0.5))]]), NOW, "");
      expect(page.totalInUse, `${days} days`).toBe(1);
    }
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

describe("Última utilização: what the last use is", () => {
  it("the latest session whose time has passed", () => {
    expect(lastPackUse(sessions(past(9), past(2), past(5)), NOW)?.getTime()).toBe(past(2).getTime());
  });

  it("a future booking is not a use: the last use is the latest PAST session", () => {
    expect(lastPackUse(sessions(past(4), future(1), future(8)), NOW)?.getTime()).toBe(past(4).getTime());
  });

  it("a session exactly now counts as used, the same line as Realizadas", () => {
    expect(lastPackUse(sessions(new Date(NOW)), NOW)?.getTime()).toBe(NOW.getTime());
  });

  it("null with no sessions, or with only future bookings", () => {
    expect(lastPackUse([], NOW)).toBeNull();
    expect(lastPackUse(sessions(future(1)), NOW)).toBeNull();
  });

  it("legacy sessions carry no date and give no last use", () => {
    const v = summarizePackInstance(row({ legacyConsumed: 3 }), [], NOW);
    expect(v.done).toBe(3);
    expect(v.lastUsedAt).toBeNull();
  });

  it("summarizePackInstance carries it, whatever order the read returned the sessions in", () => {
    const v = summarizePackInstance(row(), sessions(past(1), future(2), past(7)), NOW);
    expect(v.lastUsedAt?.getTime()).toBe(past(1).getTime());
  });
});

describe("sorting: Última utilização", () => {
  const view = (over: Partial<PackInstanceRow>, dates: Date[]) =>
    summarizePackInstance(row(over), sessions(...dates), NOW);

  it("most recent use first", () => {
    const a = view({ patientName: "Ana" }, [past(30)]);
    const b = view({ patientName: "Bruno" }, [past(2)]);
    const c = view({ patientName: "Carla" }, [past(10)]);
    expect(sortPacksInUse([a, b, c], "lastUse").map((v) => v.patientName)).toEqual(["Bruno", "Carla", "Ana"]);
  });

  it("never used sorts last, after even the oldest use; a future-only booking counts as never used", () => {
    const never = view({ patientName: "Ana" }, []);
    const futureOnly = view({ patientName: "Bea" }, [future(3)]);
    const legacyOnly = view({ patientName: "Aurora", legacyConsumed: 2 }, []);
    const ancient = view({ patientName: "Zé" }, [past(20 * 365)]);
    expect(sortPacksInUse([never, futureOnly, legacyOnly, ancient], "lastUse").map((v) => v.patientName)).toEqual([
      "Zé",
      "Ana",
      "Aurora",
      "Bea",
    ]);
  });

  it("ties on the same last use fall back to the default order (patient A to Z)", () => {
    const z = view({ patientName: "Zita" }, [past(5)]);
    const a = view({ patientName: "álvaro" }, [past(5)]);
    const m = view({ patientName: "Marta" }, [past(5)]);
    expect(sortPacksInUse([z, m, a], "lastUse").map((v) => v.patientName)).toEqual(["álvaro", "Marta", "Zita"]);
  });

  it("the never-used group is in the default order too", () => {
    const rows = ["Rui", "Ana", "Marta"].map((n) => view({ patientName: n }, []));
    expect(sortPacksInUse(rows, "lastUse").map((v) => v.patientName)).toEqual(["Ana", "Marta", "Rui"]);
  });

  it("stable and total: every arrival order gives the same result", () => {
    const rows = [
      view({ patientName: "Ana" }, [past(5)]),
      view({ patientName: "Ana" }, [past(5)]),
      view({ patientName: "Bruno" }, []),
      view({ patientName: "Carla" }, [past(1)]),
      view({ patientName: "Duarte" }, [past(5)]),
    ];
    const expected = sortPacksInUse(rows, "lastUse").map((v) => v.instanceId);
    const perms = (xs: typeof rows): (typeof rows)[] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    for (const p of perms(rows)) {
      expect(sortPacksInUse(p, "lastUse").map((v) => v.instanceId)).toEqual(expected);
    }
    expect(expected[0]).toBe(rows[3]!.instanceId);
    expect(expected[4]).toBe(rows[2]!.instanceId);
  });

  it("the comparator is antisymmetric (a before b means b after a)", () => {
    const a = view({ patientName: "Ana" }, [past(1)]);
    const b = view({ patientName: "Bruno" }, [past(9)]);
    const n = view({ patientName: "Carla" }, []);
    expect(comparePacksByLastUse(a, b)).toBeLessThan(0);
    expect(comparePacksByLastUse(b, a)).toBeGreaterThan(0);
    expect(comparePacksByLastUse(b, n)).toBeLessThan(0);
    expect(comparePacksByLastUse(n, b)).toBeGreaterThan(0);
    expect(comparePacksByLastUse(a, a)).toBe(0);
  });

  it("does not touch its input, and 'name' keeps the default order", () => {
    const rows = [view({ patientName: "Zé" }, [past(1)]), view({ patientName: "Ana" }, [past(9)])];
    const before = rows.map((v) => v.instanceId);
    expect(sortPacksInUse(rows, "name").map((v) => v.patientName)).toEqual(["Ana", "Zé"]);
    expect(sortPacksInUse(rows, "lastUse").map((v) => v.patientName)).toEqual(["Zé", "Ana"]);
    expect(rows.map((v) => v.instanceId)).toEqual(before);
  });

  it("the sort links keep the search and leave the default sort out of the URL", () => {
    expect(packsSortHref("", "name")).toBe("/patients/packs");
    expect(packsSortHref("", "lastUse")).toBe("/patients/packs?sort=lastUse");
    expect(packsSortHref("maria joao", "lastUse")).toBe("/patients/packs?q=maria+joao&sort=lastUse");
    expect(packsSortHref("ana", "name")).toBe("/patients/packs?q=ana");
  });

  it("?sort= is read safely: only 'lastUse' selects it", () => {
    expect(parsePacksInUseSort("lastUse")).toBe("lastUse");
    expect(parsePacksInUseSort(undefined)).toBe("name");
    expect(parsePacksInUseSort("name")).toBe("name");
    expect(parsePacksInUseSort("LASTUSE")).toBe("name");
    expect(parsePacksInUseSort("x")).toBe("name");
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

describe("buildPatientPacks (PACK-FICHA-01): one patient's pacotes for the ficha", () => {
  const P = "pat-ficha";

  it("splits running from finished by the same rule as Packs em uso", () => {
    const running = row({ patientId: P, instanceId: "run" });
    const ahead = row({ patientId: P, instanceId: "ahead", sessionsTotal: 2 });
    const spent = row({ patientId: P, instanceId: "spent", sessionsTotal: 2 });
    const page = buildPatientPacks(
      P,
      [running, ahead, spent],
      new Map([
        ["run", sessions(past(2))],
        ["ahead", sessions(past(5), future(3))],
        ["spent", sessions(past(9), past(4))],
      ]),
      NOW,
    );
    expect(page.running.map((v) => v.instanceId).sort()).toEqual(["ahead", "run"]);
    expect(page.finished.map((v) => v.instanceId)).toEqual(["spent"]);
    const spentView = page.finished[0]!;
    expect(spentView.reserved).toBe(2);
    expect(spentView.free).toBe(0);
    expect(spentView.sessions).toHaveLength(2);
  });

  it("the numbers are summarizePackInstance's, the ones Packs em uso prints", () => {
    const r = row({ patientId: P });
    const ss = sessions(past(3), future(4));
    const page = buildPatientPacks(P, [r], new Map([[r.instanceId, ss]]), NOW);
    expect(page.running[0]).toEqual(summarizePackInstance(r, ss, NOW));
  });

  it("CANNOT RETURN ANOTHER PATIENT'S PACOTE, whatever rows it is handed", () => {
    const mine = row({ patientId: P, instanceId: "mine" });
    const theirsRunning = row({ patientId: "pat-other", instanceId: "theirs-run" });
    const theirsSpent = row({ patientId: "pat-other", instanceId: "theirs-spent", sessionsTotal: 1 });
    const page = buildPatientPacks(
      P,
      [theirsRunning, mine, theirsSpent],
      new Map([["theirs-spent", sessions(past(1))]]),
      NOW,
    );
    const all = [...page.running, ...page.finished];
    expect(all.map((v) => v.instanceId)).toEqual(["mine"]);
    expect(all.every((v) => v.patientId === P)).toBe(true);
  });

  it("an empty patient id matches nothing", () => {
    const page = buildPatientPacks("", [row({ patientId: P })], new Map(), NOW);
    expect(page.running).toEqual([]);
    expect(page.finished).toEqual([]);
  });

  it("newest purchase first in both sections, the id breaking a tie", () => {
    const old = row({ patientId: P, instanceId: "b-old", purchasedAt: past(90) });
    const recent = row({ patientId: P, instanceId: "b-new", purchasedAt: past(2) });
    const tieA = row({ patientId: P, instanceId: "a-tie", purchasedAt: past(10) });
    const tieB = row({ patientId: P, instanceId: "c-tie", purchasedAt: past(10) });
    const page = buildPatientPacks(P, [old, tieB, recent, tieA], new Map(), NOW);
    expect(page.running.map((v) => v.instanceId)).toEqual(["b-new", "a-tie", "c-tie", "b-old"]);
  });

  it("no pacotes: both sections empty", () => {
    expect(buildPatientPacks(P, [], new Map(), NOW)).toEqual({ running: [], finished: [] });
  });

  it("the patient cap is a positive integer", () => {
    expect(Number.isInteger(PATIENT_PACKS_READ_CAP)).toBe(true);
    expect(PATIENT_PACKS_READ_CAP).toBeGreaterThan(0);
  });
});
