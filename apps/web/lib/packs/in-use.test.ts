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
  packSessionLabels,
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

/**
 * PACK-LABEL-01: "<pacote>: Sessão N de M" on the patient's Marcações tab.
 *
 * The input is what the read hands over: each instance's CONSUMING sessions
 * (0108's function: linked, not cancelled). A cancelled visit is therefore
 * never in `sessions`; these cases build the views exactly that way, through
 * the same `summarizePackInstance` the page uses.
 */
describe("packSessionLabels: the Sessão N de M numbering", () => {
  const at = (iso: string) => new Date(iso);
  const s = (appointmentId: string, iso: string): PackSession => ({ appointmentId, startsAt: at(iso) });

  it("numbers the consuming visits by start time, earliest = 1, M = the instance total", () => {
    const v = summarizePackInstance(
      row({ packName: "Osteopatia 5", sessionsTotal: 5 }),
      // Handed over out of order on purpose: the order is the start time.
      [s("c", "2026-10-15T09:00:00Z"), s("a", "2026-10-01T09:00:00Z"), s("b", "2026-10-08T09:00:00Z")],
      NOW,
    );
    expect(packSessionLabels([v])).toEqual({
      a: { packName: "Osteopatia 5", sessionNumber: 1, sessionsTotal: 5 },
      b: { packName: "Osteopatia 5", sessionNumber: 2, sessionsTotal: 5 },
      c: { packName: "Osteopatia 5", sessionNumber: 3, sessionsTotal: 5 },
    });
  });

  it("onlyIds keeps the labels of listed visits only, and does not renumber them", () => {
    const v = summarizePackInstance(
      row({ packName: "Osteopatia 5", sessionsTotal: 5, legacyConsumed: 1 }),
      [s("a", "2026-10-01T09:00:00Z"), s("b", "2026-10-08T09:00:00Z"), s("c", "2026-10-15T09:00:00Z")],
      NOW,
    );
    // "b" is a visit the caller's list does not show: no label, no id sent on.
    expect(packSessionLabels([v], new Set(["a", "c", "not-a-session"]))).toEqual({
      a: { packName: "Osteopatia 5", sessionNumber: 2, sessionsTotal: 5 },
      c: { packName: "Osteopatia 5", sessionNumber: 4, sessionsTotal: 5 },
    });
    expect(packSessionLabels([v], new Set())).toEqual({});
  });

  it("a cancelled visit leaves no gap: it takes no number and the next visit closes up", () => {
    // Four visits were booked; the second ("x-cancelled") was cancelled, so it
    // is not a consuming session and the read never returns it.
    const v = summarizePackInstance(
      row({ sessionsTotal: 10 }),
      [s("v1", "2026-10-01T09:00:00Z"), s("v3", "2026-10-15T09:00:00Z"), s("v4", "2026-10-22T09:00:00Z")],
      NOW,
    );
    const labels = packSessionLabels([v]);
    expect(labels["v1"]!.sessionNumber).toBe(1);
    expect(labels["v3"]!.sessionNumber).toBe(2);
    expect(labels["v4"]!.sessionNumber).toBe(3);
    expect(labels["x-cancelled"]).toBeUndefined();
    expect(Object.keys(labels)).toHaveLength(3);
  });

  it("two instances on one patient are numbered independently, each with its own name and total", () => {
    const first = summarizePackInstance(
      row({ instanceId: "i1", patientId: "p", packName: "Fisioterapia 10", sessionsTotal: 10 }),
      [s("f1", "2026-09-01T09:00:00Z"), s("f2", "2026-09-08T09:00:00Z")],
      NOW,
    );
    const second = summarizePackInstance(
      row({ instanceId: "i2", patientId: "p", packName: "Osteopatia 5", sessionsTotal: 5 }),
      // Interleaved in time with the first pacote: still its own count.
      [s("o1", "2026-09-05T09:00:00Z"), s("o2", "2026-10-01T09:00:00Z")],
      NOW,
    );
    const labels = packSessionLabels([first, second]);
    expect(labels).toEqual({
      f1: { packName: "Fisioterapia 10", sessionNumber: 1, sessionsTotal: 10 },
      f2: { packName: "Fisioterapia 10", sessionNumber: 2, sessionsTotal: 10 },
      o1: { packName: "Osteopatia 5", sessionNumber: 1, sessionsTotal: 5 },
      o2: { packName: "Osteopatia 5", sessionNumber: 2, sessionsTotal: 5 },
    });
  });

  it("an appointment with no pacote gets no label", () => {
    const v = summarizePackInstance(row(), [s("in-pack", "2026-10-01T09:00:00Z")], NOW);
    const labels = packSessionLabels([v]);
    expect(labels["no-pack"]).toBeUndefined();
    expect(packSessionLabels([])).toEqual({});
  });

  it("sessions spent before linking (legacy_consumed) come first, as Packs em uso numbers them", () => {
    const v = summarizePackInstance(
      row({ sessionsTotal: 10, legacyConsumed: 3 }),
      [s("first-linked", "2026-10-01T09:00:00Z"), s("second-linked", "2026-10-08T09:00:00Z")],
      NOW,
    );
    const labels = packSessionLabels([v]);
    expect(labels["first-linked"]!.sessionNumber).toBe(4);
    expect(labels["second-linked"]!.sessionNumber).toBe(5);
  });

  it("future visits are numbered too, and a start-time tie is broken by the appointment id", () => {
    const v = summarizePackInstance(
      row(),
      [s("tie-b", "2026-12-01T09:00:00Z"), s("tie-a", "2026-12-01T09:00:00Z"), s("past", "2026-10-01T09:00:00Z")],
      NOW,
    );
    const labels = packSessionLabels([v]);
    expect(labels["past"]!.sessionNumber).toBe(1);
    expect(labels["tie-a"]!.sessionNumber).toBe(2);
    expect(labels["tie-b"]!.sessionNumber).toBe(3);
  });

  it("does not trust the input order: a view whose sessions arrive unsorted is numbered by start time", () => {
    const labels = packSessionLabels([
      {
        packName: "Osteopatia 5",
        sessionsTotal: 5,
        legacyConsumed: 0,
        sessions: [s("late", "2026-10-20T09:00:00Z"), s("early", "2026-10-01T09:00:00Z")],
      },
    ]);
    expect(labels["early"]!.sessionNumber).toBe(1);
    expect(labels["late"]!.sessionNumber).toBe(2);
  });

  it("an overdrawn pacote reads past its total, not clamped", () => {
    const v = summarizePackInstance(
      row({ sessionsTotal: 2 }),
      [s("a", "2026-10-01T09:00:00Z"), s("b", "2026-10-02T09:00:00Z"), s("c", "2026-10-03T09:00:00Z")],
      NOW,
    );
    expect(packSessionLabels([v])["c"]).toEqual({ packName: "Fisioterapia 10", sessionNumber: 3, sessionsTotal: 2 });
  });
});
