import { describe, expect, it } from "vitest";
import {
  EPISODE_SPECIALTIES,
  defaultEpisodeTitle,
  episodeSpecialtyOf,
  isEpisodeSpecialty,
  normalizeEpisodeTitle,
  specialtyEpisodeTitle,
} from "./episode-title";

describe("normalizeEpisodeTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeEpisodeTitle("  Lombalgia   aguda  ")).toBe("Lombalgia aguda");
  });

  it("returns empty for blank input (caller rejects it)", () => {
    expect(normalizeEpisodeTitle("   ")).toBe("");
    expect(normalizeEpisodeTitle("")).toBe("");
  });

  it("clamps to 200 chars", () => {
    expect(normalizeEpisodeTitle("a".repeat(250))).toHaveLength(200);
  });
});

describe("defaultEpisodeTitle", () => {
  // 2026-06-08 12:00 UTC → 13:00 Lisbon (WEST), still 8 June.
  const instant = new Date("2026-06-08T12:00:00Z");

  it("appends a parenthesised dd/mm/yyyy date with no em/en dash", () => {
    expect(defaultEpisodeTitle("Episódio", instant)).toBe("Episódio (08/06/2026)");
    expect(defaultEpisodeTitle("Episode", instant)).toBe("Episode (08/06/2026)");
    expect(defaultEpisodeTitle("Episódio", instant)).not.toMatch(/[–—]/);
  });

  it("renders the date in Europe/Lisbon, not UTC", () => {
    // 2026-06-08 23:30 UTC is already 9 June 00:30 in Lisbon.
    const lateUtc = new Date("2026-06-08T23:30:00Z");
    expect(defaultEpisodeTitle("Episode", lateUtc)).toBe("Episode (09/06/2026)");
  });
});

describe("isEpisodeSpecialty (EPI-01b, Q7): the only words a new episode's title may take from an imported group", () => {
  it("admits exactly the two specialties the importer writes", () => {
    expect(EPISODE_SPECIALTIES).toEqual(["Osteopatia", "Fisioterapia"]);
    expect(isEpisodeSpecialty("Osteopatia")).toBe(true);
    expect(isEpisodeSpecialty("Fisioterapia")).toBe(true);
  });

  it("refuses anything else: another word, free text, a near miss, a non-string", () => {
    for (const v of ["", "Episódio", "osteopatia", " Osteopatia", "Osteopatia ", "Osteopatia (02/10/2026)", "Lombalgia aguda", "—"]) {
      expect(isEpisodeSpecialty(v), JSON.stringify(v)).toBe(false);
    }
    for (const v of [null, undefined, 1, ["Osteopatia"], { Osteopatia: true }]) {
      expect(isEpisodeSpecialty(v)).toBe(false);
    }
  });

  it("the title built from one is the specialty and the Lisbon date, nothing clinical", () => {
    expect(defaultEpisodeTitle("Osteopatia", new Date("2026-10-02T09:00:00Z"))).toBe("Osteopatia (02/10/2026)");
  });
});

describe("episodeSpecialtyOf (EPI-01b, R31): which specialty an episode's title names", () => {
  it("the title '+ Avaliação' builds names its specialty, for every specialty and any day", () => {
    for (const specialty of EPISODE_SPECIALTIES) {
      for (const day of ["2026-01-01T12:00:00Z", "2026-10-03T09:00:00Z", "2027-12-31T23:30:00Z"]) {
        const title = defaultEpisodeTitle(specialty, new Date(day));
        expect(episodeSpecialtyOf(title), title).toBe(specialty);
      }
    }
    expect(episodeSpecialtyOf("Osteopatia (03/10/2026)")).toBe("Osteopatia");
    expect(episodeSpecialtyOf("Fisioterapia (03/10/2026)")).toBe("Fisioterapia");
  });

  it("the bare specialty word names it: the comparison an imported group's label goes through", () => {
    for (const specialty of EPISODE_SPECIALTIES) {
      expect(isEpisodeSpecialty(specialty)).toBe(true);
      expect(episodeSpecialtyOf(specialty)).toBe(specialty);
    }
  });

  it("one specialty's title never names the other", () => {
    expect(episodeSpecialtyOf("Osteopatia (03/10/2026)")).not.toBe("Fisioterapia");
    expect(episodeSpecialtyOf("Fisioterapia")).not.toBe("Osteopatia");
  });

  it("anything else names none: the 'Novo episódio' default, free text, a near miss, a non-string", () => {
    for (const title of [
      "",
      "Episódio (03/10/2026)",
      "osteopatia (03/10/2026)",
      "Osteopatia  (03/10/2026)",
      " Osteopatia (03/10/2026)",
      "Osteopatia (03/10/2026) ",
      "Osteopatia (3/10/2026)",
      "Osteopatia (03/10/26)",
      "Osteopatia (03-10-2026)",
      "Osteopatia(03/10/2026)",
      "Osteopatia 03/10/2026",
      "Osteopatia (03/10/2026) lombalgia",
      "Osteopatia lombalgia",
      "Osteopatias",
      "Osteopatia ",
      "Pilates (03/10/2026)",
    ]) {
      expect(episodeSpecialtyOf(title), JSON.stringify(title)).toBeNull();
    }
    expect(episodeSpecialtyOf(null)).toBeNull();
    expect(episodeSpecialtyOf(undefined)).toBeNull();
  });
});

/** A word in fullwidth letters (U+FF21.., U+FF41..): what NFKC folds back to the ASCII word. */
const fullwidth = (word: string) => [...word].map((c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0)).join("");

/**
 * Words that LOOK like a listed specialty and are not one, written with escapes
 * so the difference is in the source: fullwidth letters, a zero-width space
 * inside the word (no listed word has an accent, so there is no NFD form to
 * try), and a Cyrillic or Greek letter in place of a Latin one.
 */
const LOOK_ALIKES: [string, string][] = [
  ["fullwidth Osteopatia", fullwidth("Osteopatia")],
  ["fullwidth Fisioterapia", fullwidth("Fisioterapia")],
  ["Osteopatia with a zero-width space inside", "Osteo\u200bpatia"],
  ["Fisioterapia with a zero-width space inside", "Fisio\u200bterapia"],
  ["Osteopatia with a Cyrillic capital O", "\u041esteopatia"],
  ["Osteopatia with a Greek capital omicron", "\u039fsteopatia"],
  ["Fisioterapia with a Cyrillic small a", "Fisioter\u0430pia"],
];

describe("look-alikes of a listed specialty (EPI-01b, piece 2): the list is compared exactly, never normalised", () => {
  it("CONTROL: each look-alike differs from every listed word, and the fullwidth forms are what NFKC would fold into one", () => {
    for (const [label, v] of LOOK_ALIKES) {
      expect((EPISODE_SPECIALTIES as readonly string[]).includes(v), label).toBe(false);
    }
    expect(fullwidth("Osteopatia")).toBe("\uff2f\uff53\uff54\uff45\uff4f\uff50\uff41\uff54\uff49\uff41");
    expect(fullwidth("Osteopatia").normalize("NFKC")).toBe("Osteopatia");
    expect(fullwidth("Fisioterapia").normalize("NFKC")).toBe("Fisioterapia");
  });

  it("none is a specialty, none builds a title, and none is read back as a specialty from a title", () => {
    const noon = new Date("2026-10-05T12:00:00Z");
    for (const [label, v] of LOOK_ALIKES) {
      expect(isEpisodeSpecialty(v), label).toBe(false);
      expect(specialtyEpisodeTitle(v, noon), label).toBeNull();
      expect(episodeSpecialtyOf(v), label).toBeNull();
      expect(episodeSpecialtyOf(`${v} (05/10/2026)`), label).toBeNull();
    }
  });
});

describe("specialtyEpisodeTitle (EPI-01b, piece 2): the title '+ Episódio' gives a new episode", () => {
  const noon = new Date("2026-10-05T12:00:00Z");

  it("a word on the list and the Lisbon day, in the shape '+ Avaliação' builds", () => {
    expect(specialtyEpisodeTitle("Osteopatia", noon)).toBe("Osteopatia (05/10/2026)");
    expect(specialtyEpisodeTitle("Fisioterapia", noon)).toBe("Fisioterapia (05/10/2026)");
    for (const specialty of EPISODE_SPECIALTIES) {
      const title = specialtyEpisodeTitle(specialty, noon)!;
      expect(title).toBe(defaultEpisodeTitle(specialty, noon));
      // What it builds is what R31 reads back as that specialty.
      expect(episodeSpecialtyOf(title)).toBe(specialty);
    }
  });

  it("anything that is not exactly a word on the list builds no title", () => {
    for (const v of [
      "",
      "Episódio",
      "osteopatia",
      "OSTEOPATIA",
      " Osteopatia",
      "Osteopatia ",
      "Osteopatia (02/10/2026)",
      "Osteopatia\nTexto",
      "Texto escrito pelo cliente",
    ]) {
      expect(specialtyEpisodeTitle(v, noon), JSON.stringify(v)).toBeNull();
    }
    for (const [label, v] of LOOK_ALIKES) {
      expect(specialtyEpisodeTitle(v, noon), label).toBeNull();
    }
    for (const v of [null, undefined, 1, true, ["Osteopatia"], { specialty: "Osteopatia" }]) {
      expect(specialtyEpisodeTitle(v, noon)).toBeNull();
    }
  });

  it("the date is the clinic's Lisbon day ACROSS MIDNIGHT, in summer and in winter", () => {
    // Summer time (UTC+1): Lisbon's midnight is 23:00 UTC.
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-07-14T22:59:59Z"))).toBe("Osteopatia (14/07/2026)");
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-07-14T23:00:00Z"))).toBe("Osteopatia (15/07/2026)");
    // Winter time (UTC+0): Lisbon's midnight is 00:00 UTC.
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-01-14T23:59:59Z"))).toBe("Osteopatia (14/01/2026)");
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-01-15T00:00:00Z"))).toBe("Osteopatia (15/01/2026)");
    // The year turns at Lisbon's midnight too.
    expect(specialtyEpisodeTitle("Fisioterapia", new Date("2026-12-31T23:59:59Z"))).toBe("Fisioterapia (31/12/2026)");
    expect(specialtyEpisodeTitle("Fisioterapia", new Date("2027-01-01T00:00:00Z"))).toBe("Fisioterapia (01/01/2027)");
  });

  it("ACROSS A DAYLIGHT-SAVING CHANGE: the day follows Lisbon's clock on both sides of each change", () => {
    // 29 March 2026, 01:00 UTC: Lisbon moves from UTC+0 to UTC+1.
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-03-28T23:30:00Z"))).toBe("Osteopatia (28/03/2026)"); // 23:30, winter time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-03-29T00:30:00Z"))).toBe("Osteopatia (29/03/2026)"); // 00:30, before the change
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-03-29T01:30:00Z"))).toBe("Osteopatia (29/03/2026)"); // 02:30, after it
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-03-29T22:59:59Z"))).toBe("Osteopatia (29/03/2026)"); // 23:59:59, summer time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-03-29T23:00:00Z"))).toBe("Osteopatia (30/03/2026)"); // midnight is now 23:00 UTC
    // 25 October 2026, 01:00 UTC: Lisbon moves back from UTC+1 to UTC+0.
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-24T22:59:59Z"))).toBe("Osteopatia (24/10/2026)"); // 23:59:59, summer time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-24T23:00:00Z"))).toBe("Osteopatia (25/10/2026)"); // 00:00, summer time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-25T00:30:00Z"))).toBe("Osteopatia (25/10/2026)"); // 01:30, the first time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-25T01:30:00Z"))).toBe("Osteopatia (25/10/2026)"); // 01:30, the second time
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-25T23:00:00Z"))).toBe("Osteopatia (25/10/2026)"); // 23:00: midnight is 00:00 UTC again
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-25T23:59:59Z"))).toBe("Osteopatia (25/10/2026)");
    expect(specialtyEpisodeTitle("Osteopatia", new Date("2026-10-26T00:00:00Z"))).toBe("Osteopatia (26/10/2026)");
  });
});
