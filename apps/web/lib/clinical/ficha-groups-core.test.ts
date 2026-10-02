import { describe, expect, it } from "vitest";
import { EXCERPT_MAX, excerpt, groupForFicha, type FichaRecord } from "./ficha-groups-core";

let seq = 0;
const rec = (over: Partial<FichaRecord> = {}): FichaRecord => {
  seq += 1;
  return {
    id: `r${seq}`,
    status: "locked",
    version: 1,
    supersedesId: null,
    createdAt: `2024-01-${String(seq % 28 + 1).padStart(2, "0")}T00:00:00.000Z`,
    updatedAt: "2026-09-20T10:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: null,
    episodeTitle: null,
    episodeImported: false,
    excerpt: null,
    ...over,
  };
};

const day = (d: string) => `${d}T00:00:00.000Z`;

describe("excerpt: the one-line complaint (Q3)", () => {
  it("takes the first non-empty key in order, the app's fields before the importer's", () => {
    expect(excerpt({ consultation_reason: "Dor lombar", queixas: "outra" })).toBe("Dor lombar");
    expect(excerpt({ consultation_reason: "  ", main_complaints: "Cervicalgia" })).toBe("Cervicalgia");
    expect(excerpt({ queixas: "Ombro direito" })).toBe("Ombro direito");
    expect(excerpt({ motivos: "Joelho" })).toBe("Joelho");
    expect(excerpt({ diagnostico: "Tendinite" })).toBe("Tendinite");
  });

  it("the full order: with all five filled, each key wins until it is removed (Q3)", () => {
    const all: Record<string, string> = {
      consultation_reason: "k1",
      main_complaints: "k2",
      queixas: "k3",
      motivos: "k4",
      diagnostico: "k5",
    };
    const order = ["consultation_reason", "main_complaints", "queixas", "motivos", "diagnostico"];
    const fields = { ...all };
    for (const [i, key] of order.entries()) {
      expect(excerpt(fields)).toBe(`k${i + 1}`);
      delete fields[key];
    }
    expect(excerpt(fields)).toBeNull();
  });

  it("collapses whitespace and cuts a long text at EXCERPT_MAX with an ellipsis", () => {
    expect(excerpt({ motivos: "a\n\n  b\tc" })).toBe("a b c");
    const long = "x".repeat(EXCERPT_MAX + 30);
    const out = excerpt({ motivos: long })!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(EXCERPT_MAX + 1);
    expect(excerpt({ motivos: "y".repeat(EXCERPT_MAX) })).toBe("y".repeat(EXCERPT_MAX));
  });

  it("reads a non-string value as text, and answers null when nothing is there", () => {
    expect(excerpt({ queixas: ["Ombro", "Pescoço"] })).toBe("Ombro, Pescoço");
    expect(excerpt({ diagnostico: 7 })).toBe("7");
    expect(excerpt({ outra: "não conta" })).toBeNull();
    expect(excerpt({})).toBeNull();
    expect(excerpt(null)).toBeNull();
  });
});

describe("the group count: evaluations, versions excluded (S-1002-D P2.1)", () => {
  const imp = { episodeId: "e1", episodeTitle: "Osteopatia", episodeImported: true };

  it("an evaluation and its later versions count once; the rows still list every version", () => {
    const [g] = groupForFicha([
      rec({ ...imp, id: "v1", createdAt: day("2025-01-20") }),
      rec({ ...imp, id: "v2", version: 2, supersedesId: "v1", status: "signed", createdAt: day("2025-02-03") }),
      rec({ ...imp, id: "v3", version: 3, supersedesId: "v2", status: "draft", createdAt: day("2025-03-01") }),
    ]);
    expect(g!.records.map((r) => r.id)).toEqual(["v1", "v2", "v3"]);
    expect(g!.evaluations).toBe(1);
  });

  it("two evaluations, one of them with a version, count two", () => {
    const [g] = groupForFicha([
      rec({ ...imp, id: "a", createdAt: day("2023-03-12") }),
      rec({ ...imp, id: "b", createdAt: day("2025-01-20") }),
      rec({ ...imp, id: "b2", version: 2, supersedesId: "b", status: "draft", createdAt: day("2025-02-03") }),
    ]);
    expect(g!.records).toHaveLength(3);
    expect(g!.evaluations).toBe(2);
  });

  it("CONTROL: with no versions the count is the row count", () => {
    const [g] = groupForFicha([rec({ ...imp, id: "x" }), rec({ ...imp, id: "y" })]);
    expect(g!.evaluations).toBe(2);
  });

  it("a version whose original is not in the list still counts once", () => {
    const [g] = groupForFicha([rec({ ...imp, id: "orphan", version: 2, supersedesId: "not-listed" })]);
    expect(g!.evaluations).toBe(1);
  });

  it("a version superseding a record in ANOTHER group counts in its own group", () => {
    const groups = groupForFicha([
      rec({ id: "free", createdAt: day("2026-09-01") }),
      rec({ id: "moved", version: 2, supersedesId: "free", episodeId: "app1", episodeTitle: "Episódio (01/09/2026)", createdAt: day("2026-09-02") }),
    ]);
    expect(groups.map((g) => [g.key, g.evaluations])).toEqual([
      ["episode:app1", 1],
      ["none", 1],
    ]);
  });
});

describe("groupForFicha: Q1 (a) and the defaults", () => {
  it("IMPORTED registos join ONE group per specialty, however many episodes the importer made", () => {
    const groups = groupForFicha([
      rec({ episodeId: "e1", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2023-03-12") }),
      rec({ episodeId: "e2", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2025-01-20") }),
      rec({ episodeId: "e3", episodeTitle: "Fisioterapia", episodeImported: true, createdAt: day("2024-09-05") }),
    ]);
    expect(groups.map((g) => [g.key, g.records.length])).toEqual([
      ["imported:Osteopatia", 2],
      ["imported:Fisioterapia", 1],
    ]);
    expect(groups.every((g) => g.imported)).toBe(true);
  });

  it("an APP episode is its own group; a registo with NO episode joins 'none', which comes last", () => {
    const groups = groupForFicha([
      rec({ id: "free", createdAt: day("2026-09-01") }),
      rec({ id: "inApp", episodeId: "app1", episodeTitle: "Episódio (01/09/2026)", createdAt: day("2026-08-01") }),
      rec({ id: "imp", episodeId: "e9", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2020-01-01") }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["episode:app1", "imported:Osteopatia", "none"]);
    expect(groups[0]!.imported).toBe(false);
    expect(groups[2]!.label).toBeNull();
  });

  it("evaluations run oldest to newest by the CLINICAL date, not updated_at; groups run newest first", () => {
    const groups = groupForFicha([
      rec({ id: "late", episodeId: "a", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2025-05-05"), updatedAt: day("2026-01-01") }),
      rec({ id: "early", episodeId: "b", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2022-02-02"), updatedAt: day("2026-09-30") }),
      rec({ id: "fisio", episodeId: "c", episodeTitle: "Fisioterapia", episodeImported: true, createdAt: day("2026-02-02") }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["imported:Fisioterapia", "imported:Osteopatia"]);
    expect(groups[1]!.records.map((r) => r.id)).toEqual(["early", "late"]);
    expect(groups[1]!.firstAt).toBe(day("2022-02-02"));
    expect(groups[1]!.lastAt).toBe(day("2025-05-05"));
  });

  it("the header excerpt is the FIRST evaluation's (Q2)", () => {
    const [g] = groupForFicha([
      rec({ episodeId: "x", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2024-02-02"), excerpt: "segunda" }),
      rec({ episodeId: "y", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2024-01-01"), excerpt: "primeira" }),
    ]);
    expect(g!.excerpt).toBe("primeira");
  });

  it("a later version stays in its record's group, and an annulled registo is kept (the page filters by the toggle)", () => {
    const groups = groupForFicha([
      rec({ id: "v1", episodeId: "e1", episodeTitle: "Fisioterapia", episodeImported: true, createdAt: day("2024-03-01") }),
      rec({ id: "v2", version: 2, supersedesId: "v1", episodeId: "e1", episodeTitle: "Fisioterapia", episodeImported: true, createdAt: day("2024-03-01"), status: "draft" }),
      rec({ id: "ann", annulled: true, episodeId: "e1", episodeTitle: "Fisioterapia", episodeImported: true, createdAt: day("2024-04-01") }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.records.map((r) => r.id)).toEqual(["v1", "v2", "ann"]);
  });

  it("a 51-evaluation group (production's largest) keeps every registo, in order", () => {
    const many = Array.from({ length: 51 }, (_, i) =>
      rec({
        id: `m${i}`,
        episodeId: `ep${i}`,
        episodeTitle: "Osteopatia",
        episodeImported: true,
        createdAt: new Date(Date.UTC(2015, 0, 1 + i * 30)).toISOString(),
      }),
    );
    const groups = groupForFicha([...many].reverse());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.records.map((r) => r.id)).toEqual(many.map((r) => r.id));
  });

  it("no record is dropped or duplicated, and an empty list makes no groups", () => {
    const input = [
      rec({ episodeId: "i1", episodeTitle: "Osteopatia", episodeImported: true }),
      rec({ episodeId: "i2", episodeTitle: "Fisioterapia", episodeImported: true }),
      rec({ episodeId: "app", episodeTitle: "Episódio" }),
      rec({}),
      rec({}),
    ];
    const ids = groupForFicha(input).flatMap((g) => g.records.map((r) => r.id)).sort();
    expect(ids).toEqual(input.map((r) => r.id).sort());
    expect(groupForFicha([])).toEqual([]);
  });

  it("an imported episode with an unexpected title is still grouped by that title, never dropped", () => {
    const groups = groupForFicha([rec({ episodeId: "z", episodeTitle: "", episodeImported: true })]);
    expect(groups[0]!.key).toBe("imported:—");
  });
});
