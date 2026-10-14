import { describe, expect, it } from "vitest";
import { groupForFicha, type FichaRecord } from "../ficha-groups-core";
import { episodeReportPath, importedGroupReportPath } from "./episode-export-core";
import { fichaReportFilename, fichaReportPath, selectFichaExport } from "./ficha-export-core";

// EXPORT-01: which registos the whole-patient file holds, under which
// sections, in which order, and what the file is called. Each arm states one
// case, on the Registos tab's own grouping (`groupForFicha`) of invented rows.

const EP_A = "77777777-7777-4777-8777-777777777771";
const EP_B = "77777777-7777-4777-8777-777777777772";

let seq = 0;
function rec(id: string, at: string, over: Partial<FichaRecord> = {}): FichaRecord {
  seq += 1;
  return {
    id,
    status: "signed",
    version: 1,
    supersedesId: null,
    createdAt: at,
    updatedAt: "2026-09-20T10:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: null,
    episodeTitle: null,
    episodeImported: false,
    excerpt: null,
    ...over,
  };
}
const inA = (id: string, at: string, over: Partial<FichaRecord> = {}) =>
  rec(id, at, { episodeId: EP_A, episodeTitle: "Osteopatia (01/03/2026)", ...over });
const inB = (id: string, at: string, over: Partial<FichaRecord> = {}) =>
  rec(id, at, { episodeId: EP_B, episodeTitle: "Fisioterapia (01/06/2026)", ...over });
const imported = (id: string, at: string, specialty: string, over: Partial<FichaRecord> = {}) =>
  rec(id, at, { episodeId: `imported-${seq}`, episodeTitle: specialty, episodeImported: true, ...over });

const day = (d: string) => `${d}T09:00:00.000Z`;
const select = (records: FichaRecord[]) => selectFichaExport(groupForFicha(records));

describe("selectFichaExport: the sections are the Registos tab's groups", () => {
  it("one section per app episode, one per imported specialty, and 'Sem episódio': every finalized registo is in exactly one", () => {
    const { sections, leftOut } = select([
      inA("a1", day("2026-03-01")),
      inA("a2", day("2026-03-08")),
      inB("b1", day("2026-06-01")),
      imported("o1", day("2019-05-10"), "Osteopatia"),
      imported("o2", day("2019-06-10"), "Osteopatia"),
      imported("f1", day("2020-01-15"), "Fisioterapia"),
      rec("free1", day("2026-07-01")),
    ]);
    expect(sections).toEqual([
      { kind: "imported", label: "Osteopatia", recordIds: ["o1", "o2"] },
      { kind: "imported", label: "Fisioterapia", recordIds: ["f1"] },
      { kind: "episode", label: "Osteopatia (01/03/2026)", recordIds: ["a1", "a2"] },
      { kind: "episode", label: "Fisioterapia (01/06/2026)", recordIds: ["b1"] },
      { kind: "none", label: null, recordIds: ["free1"] },
    ]);
    expect(leftOut).toBe(0);
    expect(sections.flatMap((s) => s.recordIds).sort()).toEqual(["a1", "a2", "b1", "f1", "free1", "o1", "o2"]);
  });

  it("the sections run OLDEST FIRST, the opposite of the tab, whatever order the rows arrive in", () => {
    const records = [
      inB("b1", day("2026-06-01")),
      imported("o1", day("2019-05-10"), "Osteopatia"),
      inA("a1", day("2026-03-01")),
    ];
    // CONTROL: the tab itself runs newest first.
    expect(groupForFicha(records).map((g) => g.label)).toEqual([
      "Fisioterapia (01/06/2026)",
      "Osteopatia (01/03/2026)",
      "Osteopatia",
    ]);
    expect(select(records).sections.map((s) => s.label)).toEqual([
      "Osteopatia",
      "Osteopatia (01/03/2026)",
      "Fisioterapia (01/06/2026)",
    ]);
    expect(select([...records].reverse()).sections.map((s) => s.label)).toEqual([
      "Osteopatia",
      "Osteopatia (01/03/2026)",
      "Fisioterapia (01/06/2026)",
    ]);
  });

  it("'Sem episódio' is the LAST section even when its registos are the oldest", () => {
    const { sections } = select([inA("a1", day("2026-03-01")), rec("free-old", day("2018-01-01")), rec("free-new", day("2026-09-01"))]);
    expect(sections.map((s) => s.kind)).toEqual(["episode", "none"]);
    expect(sections[1]).toEqual({ kind: "none", label: null, recordIds: ["free-old", "free-new"] });
  });

  it("inside a section: oldest first by the clinical date, a later version after its record", () => {
    const { sections } = select([
      inA("a-june", day("2026-06-01")),
      inA("a-march-v2", day("2026-03-01"), { version: 2, supersedesId: "a-march" }),
      inA("a-march", day("2026-03-01")),
      inA("a-april", day("2026-04-01")),
    ]);
    expect(sections).toEqual([
      { kind: "episode", label: "Osteopatia (01/03/2026)", recordIds: ["a-march", "a-march-v2", "a-april", "a-june"] },
    ]);
  });

  it("a section is dated by the first registo it HOLDS: a draft that opens an episode does not date it", () => {
    const { sections } = select([
      inA("a-draft", day("2026-01-01"), { status: "draft" }),
      inA("a-final", day("2026-08-01")),
      inB("b-final", day("2026-06-01")),
    ]);
    expect(sections.map((s) => s.recordIds)).toEqual([["b-final"], ["a-final"]]);
  });

  it("two sections that start on the same instant keep one order, by the group's key", () => {
    const records = [inB("b1", day("2026-03-01")), inA("a1", day("2026-03-01"))];
    const expected = [["a1"], ["b1"]];
    expect(select(records).sections.map((s) => s.recordIds)).toEqual(expected);
    expect(select([...records].reverse()).sections.map((s) => s.recordIds)).toEqual(expected);
  });
});

describe("selectFichaExport, G3: an annulled registo is in the file, a draft never is", () => {
  it("an ANNULLED finalized registo is in its section, in its place", () => {
    const { sections, leftOut } = select([
      inA("a1", day("2026-03-01")),
      inA("a2-annulled", day("2026-03-08"), { annulled: true }),
      inA("a3", day("2026-03-15"), { status: "locked" }),
    ]);
    expect(sections[0]!.recordIds).toEqual(["a1", "a2-annulled", "a3"]);
    expect(leftOut).toBe(0);
  });

  it("a DRAFT is in no section, wherever it sits: an app episode, the imported history, 'Sem episódio'; each is counted out", () => {
    const { sections, leftOut } = select([
      inA("a1", day("2026-03-01")),
      inA("a-draft", day("2026-03-08"), { status: "draft" }),
      imported("o1", day("2019-05-10"), "Osteopatia"),
      imported("o-draft", day("2019-06-10"), "Osteopatia", { status: "draft" }),
      rec("free1", day("2026-07-01")),
      rec("free-draft", day("2026-07-02"), { status: "draft" }),
      rec("free-draft-annulled", day("2026-07-03"), { status: "draft", annulled: true }),
    ]);
    const held = sections.flatMap((s) => s.recordIds);
    expect(held).toEqual(["o1", "a1", "free1"]);
    for (const id of ["a-draft", "o-draft", "free-draft", "free-draft-annulled"]) expect(held).not.toContain(id);
    expect(leftOut).toBe(4);
  });

  it("a group of drafts only is NO section: no heading for an episode the file holds nothing of", () => {
    const { sections, leftOut } = select([
      inA("a-draft", day("2026-03-01"), { status: "draft" }),
      inB("b1", day("2026-06-01")),
      rec("free-draft", day("2026-07-01"), { status: "draft" }),
    ]);
    expect(sections).toEqual([{ kind: "episode", label: "Fisioterapia (01/06/2026)", recordIds: ["b1"] }]);
    expect(leftOut).toBe(2);
  });

  it("a patient whose only finalized registo is ANNULLED is exported: an export never refuses it", () => {
    expect(select([rec("only-annulled", day("2026-07-01"), { annulled: true })])).toEqual({
      sections: [{ kind: "none", label: null, recordIds: ["only-annulled"] }],
      leftOut: 0,
    });
  });

  it.each([
    ["drafts only", [inA("d1", day("2026-03-01"), { status: "draft" }), rec("d2", day("2026-04-01"), { status: "draft" })], 2],
    ["no registo at all", [], 0],
  ] as const)("%s: no section", (_label, records, leftOut) => {
    expect(select([...records])).toEqual({ sections: [], leftOut });
  });
});

describe("the file's object and name", () => {
  const TENANT = "11111111-1111-4111-8111-111111111111";
  const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
  const OBJECT = "99999999-9999-4999-8999-999999999999";

  it("the object: tenant first, a folder of its own, ids only", () => {
    expect(fichaReportPath(TENANT, PATIENT, OBJECT)).toBe(`${TENANT}/ficha-reports/${PATIENT}/${OBJECT}.pdf`);
  });

  it("no other export can name the same object", () => {
    const mine = fichaReportPath(TENANT, PATIENT, OBJECT);
    expect(mine).not.toBe(importedGroupReportPath(TENANT, PATIENT, OBJECT));
    expect(mine).not.toBe(episodeReportPath(TENANT, PATIENT, OBJECT));
  });

  it("the download's name: the patient id's first block, and nothing of the patient", () => {
    expect(fichaReportFilename(PATIENT)).toBe("relatorio-ficha-4444aaaa.pdf");
  });
});
