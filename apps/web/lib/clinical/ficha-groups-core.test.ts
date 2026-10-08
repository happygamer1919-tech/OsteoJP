import { describe, expect, it } from "vitest";
import {
  EXCERPT_MAX,
  addEvaluationTarget,
  episodePdfTarget,
  excerpt,
  fichaExportTarget,
  groupForFicha,
  importedGroupPdfTarget,
  type FichaRecord,
} from "./ficha-groups-core";

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

describe("addEvaluationTarget (EPI-01b): what '+ Avaliação' on a group files", () => {
  const groupsOf = (records: FichaRecord[]) => Object.fromEntries(groupForFicha(records).map((g) => [g.key, g]));

  it("an APP episode group: the new registo is filed in THAT episode", () => {
    const g = groupsOf([
      rec({ episodeId: "ep-app", episodeTitle: "Episódio (01/09/2026)" }),
      rec({ episodeId: "ep-app", episodeTitle: "Episódio (01/09/2026)" }),
    ]);
    expect(addEvaluationTarget(g["episode:ep-app"]!)).toEqual({ kind: "episode", episodeId: "ep-app" });
  });

  it("an app episode TITLED like a specialty is still filed in itself, never treated as imported", () => {
    const g = groupsOf([rec({ episodeId: "ep-own", episodeTitle: "Osteopatia" })]);
    expect(addEvaluationTarget(g["episode:ep-own"]!)).toEqual({ kind: "episode", episodeId: "ep-own" });
  });

  it("an IMPORTED group: its SPECIALTY and no episode id (the server reuses or opens one, R31), never an imported episode (Q7)", () => {
    const g = groupsOf([
      rec({ episodeId: "ep-i1", episodeTitle: "Osteopatia", episodeImported: true }),
      rec({ episodeId: "ep-i2", episodeTitle: "Osteopatia", episodeImported: true }),
      rec({ episodeId: "ep-i3", episodeTitle: "Fisioterapia", episodeImported: true }),
    ]);
    const osteo = addEvaluationTarget(g["imported:Osteopatia"]!);
    const fisio = addEvaluationTarget(g["imported:Fisioterapia"]!);
    expect(osteo).toEqual({ kind: "newEpisode", specialty: "Osteopatia" });
    expect(fisio).toEqual({ kind: "newEpisode", specialty: "Fisioterapia" });
    // No imported episode id is carried at all.
    expect(JSON.stringify([osteo, fisio])).not.toMatch(/ep-i/);
  });

  it("R31: the imported group's target carries NO episode id even when the patient's open app episode of it is on the page", () => {
    // The open "Osteopatia (date)" app episode is a group of its own, filed in
    // itself. The imported group still posts only the specialty: WHICH episode
    // is the server's decision at the write, so a stale page cannot pick wrong.
    const g = groupsOf([
      rec({ episodeId: "ep-i1", episodeTitle: "Osteopatia", episodeImported: true }),
      rec({ episodeId: "ep-open", episodeTitle: "Osteopatia (03/10/2026)" }),
    ]);
    expect(addEvaluationTarget(g["imported:Osteopatia"]!)).toEqual({ kind: "newEpisode", specialty: "Osteopatia" });
    expect(addEvaluationTarget(g["episode:ep-open"]!)).toEqual({ kind: "episode", episodeId: "ep-open" });
  });

  it("an imported group whose label is not a known specialty gets NO button", () => {
    const g = groupsOf([
      rec({ episodeId: "ep-x", episodeTitle: "Pilates", episodeImported: true }),
      rec({ episodeId: "ep-y", episodeTitle: null, episodeImported: true }),
    ]);
    expect(addEvaluationTarget(g["imported:Pilates"]!)).toBeNull();
    expect(addEvaluationTarget(g["imported:—"]!)).toBeNull();
  });

  it("the 'Sem episódio' group gets NO button (a judgment: the design note is silent)", () => {
    const g = groupsOf([rec(), rec()]);
    expect(g["none"]!.kind).toBe("none");
    expect(addEvaluationTarget(g["none"]!)).toBeNull();
  });
});

describe("groupForFicha with open episodes that hold no registo yet (EPI-01b, piece 2: '+ Episódio')", () => {
  const opened = { id: "ep-new", title: "Osteopatia (05/10/2026)", openedAt: "2026-10-05T10:00:00.000Z" };

  it("an open episode with no registo is a group of its own: no rows, no evaluations, dated the day it was opened, titled as the episode is", () => {
    const groups = groupForFicha([], [opened]);
    expect(groups).toEqual([
      {
        key: "episode:ep-new",
        kind: "episode",
        label: "Osteopatia (05/10/2026)",
        imported: false,
        episodeId: "ep-new",
        records: [],
        evaluations: 0,
        firstAt: "2026-10-05T10:00:00.000Z",
        lastAt: "2026-10-05T10:00:00.000Z",
        excerpt: null,
      },
    ]);
  });

  it("'+ Avaliação' on it files in THAT episode", () => {
    const [g] = groupForFicha([], [opened]);
    expect(addEvaluationTarget(g!)).toEqual({ kind: "episode", episodeId: "ep-new" });
  });

  it("it is the first group when it is the newest, and 'Sem episódio' still comes last", () => {
    const groups = groupForFicha(
      [
        rec({ episodeId: "ep-app", episodeTitle: "Episódio (01/09/2026)", createdAt: day("2026-09-01") }),
        rec({ episodeId: "ep-i1", episodeTitle: "Osteopatia", episodeImported: true, createdAt: day("2024-05-10") }),
        rec({ createdAt: day("2026-10-06") }),
      ],
      [opened],
    );
    expect(groups.map((g) => g.key)).toEqual(["episode:ep-new", "episode:ep-app", "imported:Osteopatia", "none"]);
  });

  it("an older one is ordered by the day it was opened, among the groups with registos", () => {
    const groups = groupForFicha(
      [
        rec({ episodeId: "ep-app", episodeTitle: "Episódio (01/09/2026)", createdAt: day("2026-09-01") }),
        rec({ episodeId: "ep-old", episodeTitle: "Episódio (01/07/2026)", createdAt: day("2026-07-01") }),
      ],
      [{ id: "ep-mid", title: "Fisioterapia (01/08/2026)", openedAt: day("2026-08-01") }],
    );
    expect(groups.map((g) => g.key)).toEqual(["episode:ep-app", "episode:ep-mid", "episode:ep-old"]);
  });

  it("an episode that already has a group from its registos is never given a second one", () => {
    const groups = groupForFicha(
      [rec({ id: "r-in", episodeId: "ep-new", episodeTitle: "Osteopatia (05/10/2026)", createdAt: day("2026-10-05") })],
      [opened, opened],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.records.map((r) => r.id)).toEqual(["r-in"]);
    expect(groups[0]!.evaluations).toBe(1);
  });

  it("the same empty episode listed twice is one group; two empty episodes are two", () => {
    expect(groupForFicha([], [opened, opened])).toHaveLength(1);
    const two = groupForFicha([], [opened, { id: "ep-two", title: "Fisioterapia (04/10/2026)", openedAt: day("2026-10-04") }]);
    expect(two.map((g) => g.key)).toEqual(["episode:ep-new", "episode:ep-two"]);
  });

  it("CONTROL: with none passed the groups are exactly the registos' groups, and each carries its episode id or null", () => {
    const records = [
      rec({ episodeId: "ep-app", episodeTitle: "Episódio (01/09/2026)" }),
      rec({ episodeId: "ep-i1", episodeTitle: "Osteopatia", episodeImported: true }),
      rec(),
    ];
    expect(groupForFicha(records)).toEqual(groupForFicha(records, []));
    const byKey = Object.fromEntries(groupForFicha(records).map((g) => [g.key, g.episodeId]));
    expect(byKey).toEqual({ "episode:ep-app": "ep-app", "imported:Osteopatia": null, none: null });
  });
});

describe("episodePdfTarget (EPI-01b, piece 3): which group shows 'PDF do episódio'", () => {
  const EP = "ep-app-pdf";
  const inEpisode = (over: Partial<FichaRecord> = {}) => rec({ episodeId: EP, episodeTitle: "Osteopatia (01/09/2026)", ...over });
  const only = (records: FichaRecord[], empty: Parameters<typeof groupForFicha>[1] = []) => {
    const groups = groupForFicha(records, empty);
    expect(groups).toHaveLength(1);
    return groups[0]!;
  };

  it.each(["locked", "signed"] as const)("an APP episode holding a %s registo: the button, for THAT episode, nothing left out", (status) => {
    expect(episodePdfTarget(only([inEpisode({ status })]))).toEqual({ episodeId: EP, partial: false });
  });

  it("an app episode with a finalized registo and a draft: the button, and the tab says the file is partial", () => {
    expect(episodePdfTarget(only([inEpisode({ status: "signed" }), inEpisode({ status: "draft" })]))).toEqual({
      episodeId: EP,
      partial: true,
    });
  });

  it("EXPORT-01: an app episode with a finalized registo and an annulled one on screen: the button, and nothing left out (the annulled one is in the file)", () => {
    expect(
      episodePdfTarget(only([inEpisode({ status: "signed" }), inEpisode({ status: "signed", annulled: true })])),
    ).toEqual({ episodeId: EP, partial: false });
  });

  it("an app episode holding DRAFTS ONLY gets NO button: nothing would be exported", () => {
    const g = only([inEpisode({ status: "draft" }), inEpisode({ status: "draft" })]);
    expect(g.records).toHaveLength(2);
    expect(episodePdfTarget(g)).toBeNull();
  });

  it("EXPORT-01: an app episode whose only registo is ANNULLED gets the button: an export never refuses an annulled registo", () => {
    expect(episodePdfTarget(only([inEpisode({ status: "signed", annulled: true })]))).toEqual({
      episodeId: EP,
      partial: false,
    });
  });

  it("an annulled DRAFT is still a draft: no button", () => {
    expect(episodePdfTarget(only([inEpisode({ status: "draft", annulled: true })]))).toBeNull();
  });

  it("an open episode with NO registo yet gets NO button", () => {
    const g = only([], [{ id: EP, title: "Osteopatia (01/09/2026)", openedAt: day("2026-09-01") }]);
    expect(g).toMatchObject({ kind: "episode", episodeId: EP, evaluations: 0 });
    expect(episodePdfTarget(g)).toBeNull();
  });

  it("an IMPORTED group is not this function's: null here, its target is importedGroupPdfTarget's", () => {
    const g = only([
      rec({ status: "locked", episodeId: "imp-1", episodeTitle: "Osteopatia", episodeImported: true }),
      rec({ status: "locked", episodeId: "imp-2", episodeTitle: "Osteopatia", episodeImported: true }),
    ]);
    expect(g.kind).toBe("imported");
    expect(episodePdfTarget(g)).toBeNull();
  });

  it("the 'Sem episódio' group gets NO button, even with a signed registo", () => {
    const g = only([rec({ status: "signed" })]);
    expect(g.kind).toBe("none");
    expect(episodePdfTarget(g)).toBeNull();
  });
});

describe("importedGroupPdfTarget (EXPORT-01): which imported group shows 'PDF do episódio', and for what", () => {
  const imported = (over: Partial<FichaRecord> = {}) =>
    rec({ status: "locked", episodeId: `imp-${seq}`, episodeTitle: "Osteopatia", episodeImported: true, ...over });
  const only = (records: FichaRecord[]) => {
    const groups = groupForFicha(records);
    expect(groups).toHaveLength(1);
    return groups[0]!;
  };

  it("an imported group of locked registos, each in its own imported episode: the button, for the group's specialty", () => {
    const g = only([imported(), imported(), imported()]);
    expect(g).toMatchObject({ kind: "imported", key: "imported:Osteopatia", evaluations: 3 });
    expect(new Set(g.records.map((r) => r.episodeId)).size).toBe(3);
    expect(importedGroupPdfTarget(g)).toEqual({ specialty: "Osteopatia", partial: false });
  });

  it("the target is the group's own label: two specialties are two targets", () => {
    const groups = groupForFicha([imported(), imported({ episodeTitle: "Fisioterapia" })]);
    expect(groups.map(importedGroupPdfTarget)).toEqual(
      expect.arrayContaining([
        { specialty: "Osteopatia", partial: false },
        { specialty: "Fisioterapia", partial: false },
      ]),
    );
  });

  it("an imported group with a locked registo and an imported DRAFT: the button, and the tab says the file is partial", () => {
    expect(importedGroupPdfTarget(only([imported(), imported({ status: "draft" })]))).toEqual({
      specialty: "Osteopatia",
      partial: true,
    });
  });

  it("an imported group of DRAFTS ONLY gets NO button: a draft is never exported", () => {
    const g = only([imported({ status: "draft" }), imported({ status: "draft" })]);
    expect(g.records).toHaveLength(2);
    expect(importedGroupPdfTarget(g)).toBeNull();
  });

  it("an annulled registo is in the file, so it counts: the button, nothing left out", () => {
    expect(importedGroupPdfTarget(only([imported({ status: "signed", annulled: true })]))).toEqual({
      specialty: "Osteopatia",
      partial: false,
    });
  });

  it("an imported group whose episode title is blank groups under the dash, and that is its target", () => {
    const g = only([imported({ episodeTitle: "  " })]);
    expect(g.key).toBe("imported:\u2014");
    expect(importedGroupPdfTarget(g)).toEqual({ specialty: "\u2014", partial: false });
  });

  it("an APP episode and the 'Sem episódio' group are not this function's: null", () => {
    const app = only([rec({ status: "signed", episodeId: "ep-app", episodeTitle: "Osteopatia (01/09/2026)" })]);
    expect(app.kind).toBe("episode");
    expect(importedGroupPdfTarget(app)).toBeNull();
    const none = only([rec({ status: "signed" })]);
    expect(none.kind).toBe("none");
    expect(importedGroupPdfTarget(none)).toBeNull();
  });
});

describe("fichaExportTarget (EXPORT-01): whether the tab shows 'Exportar ficha'", () => {
  it.each(["locked", "signed"] as const)("one %s registo, wherever it is filed: the button, nothing left out", (status) => {
    expect(fichaExportTarget([rec({ status })])).toEqual({ partial: false });
    expect(fichaExportTarget([rec({ status, episodeId: "ep-app", episodeTitle: "Osteopatia (01/09/2026)" })])).toEqual({
      partial: false,
    });
    expect(
      fichaExportTarget([rec({ status, episodeId: "imp-1", episodeTitle: "Osteopatia", episodeImported: true })]),
    ).toEqual({ partial: false });
  });

  it("a finalized registo and a draft: the button, and the tab says the file is partial", () => {
    expect(fichaExportTarget([rec({ status: "signed" }), rec({ status: "draft" })])).toEqual({ partial: true });
  });

  it("an annulled registo is in the file, so it counts: the button, nothing left out", () => {
    expect(fichaExportTarget([rec({ status: "signed", annulled: true })])).toEqual({ partial: false });
  });

  it("DRAFTS ONLY get NO button: a draft is never exported", () => {
    expect(fichaExportTarget([rec({ status: "draft" }), rec({ status: "draft", annulled: true })])).toBeNull();
  });

  it("no registo the viewer reads: NO button", () => {
    expect(fichaExportTarget([])).toBeNull();
  });
});
