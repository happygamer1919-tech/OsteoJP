import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

// EXPORT-01, gate G3 on the whole-patient file's REAL PAGES. The two reads are
// replaced by invented rows (the tab's list and the per-record load); every
// step between them and the bytes is the real one: the selection rule, the
// per-record engine with its print gate, the layout, the heading pages and the
// join. What is pinned, read back from the bytes:
//
//   - an ANNULLED registo is in the file, and EVERY page of it carries the
//     annulment mark with its date; no other page carries it;
//   - a DRAFT is absent: nothing it stores is drawn anywhere, whether the
//     tab's list says "draft" or the list is stale and only the engine knows;
//   - each section opens with its heading page, in date order, and registos
//     filed in no episode come last, under the tab's "Sem episódio";
//   - an imported registo prints as its own page shows it.
// Invented patient, invented text.

vi.mock("server-only", () => ({}));
vi.mock("../ficha-groups", () => ({ listFichaRecords: vi.fn() }));
vi.mock("./load", () => ({ loadClinicalReportInputs: vi.fn() }));
vi.mock("@/lib/patients/scope", () => ({ therapistPatientReadScope: vi.fn(async () => undefined) }));

import { toClaims, type RequestContext } from "@osteojp/auth";
import { listFichaRecords } from "../ficha-groups";
import type { FichaRecord } from "../ficha-groups-core";
import { drawnLines, words } from "./drawn-lines-test-fixture";
import { readPatientFichaExportSelection, renderPatientFichaReport } from "./ficha-export";
import { loadClinicalReportInputs } from "./load";
import type { ReportInputs } from "./report-model";

const mockList = vi.mocked(listFichaRecords);
const mockLoad = vi.mocked(loadClinicalReportInputs);

const pt = getStrings("pt");
const ANULADO = pt["clinical.recordAnulado"];

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const PATIENT = "4444aaaa-4444-4444-8444-44444444bbbb";
const EP_APP = "77777777-7777-4777-8777-777777777771";
const EP_IMPORTED = "77777777-7777-4777-8777-777777777772";
const owner: RequestContext = { tenantId: TENANT, role: "owner", userId: USER };

/** A registo long enough to print on more than one page. */
const LONG = Array.from({ length: 140 }, (_, i) => `Linha anulada inventada ${i + 1}.`).join("\n");

type Row = { list: FichaRecord; record: Partial<ReportInputs["record"]> };

function row(
  id: string,
  at: string,
  list: Partial<FichaRecord>,
  record: Partial<ReportInputs["record"]>,
): Row {
  return {
    list: {
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
      ...list,
    },
    record,
  };
}

const inApp = { episodeId: EP_APP, episodeTitle: "Osteopatia (01/03/2026)" };

const ROWS: Row[] = [
  row("imp-1", "2019-05-10T23:00:00.000Z", { status: "locked", episodeId: EP_IMPORTED, episodeTitle: "Fisioterapia", episodeImported: true }, {
    status: "locked",
    view: "imported",
    data: { queixas: "MARCA-IMPORTADO texto inventado" },
    signedAt: null,
  }),
  row("app-1", "2026-03-01T09:00:00.000Z", inApp, { data: { consultationReason: "MARCA-APP-1 texto inventado" } }),
  row("app-annulled", "2026-03-08T09:00:00.000Z", { ...inApp, annulled: true }, {
    data: { consultationReason: "MARCA-ANULADO texto inventado", treatmentPlan: LONG },
    annulledAt: new Date("2026-09-22T09:00:00Z"),
  }),
  row("app-draft", "2026-03-15T09:00:00.000Z", { ...inApp, status: "draft" }, {
    status: "draft",
    data: { consultationReason: "MARCA-RASCUNHO texto inventado" },
    signedAt: null,
  }),
  // The tab's list says "signed" (a stale list); the stored row is a draft.
  row("app-stale-draft", "2026-03-20T09:00:00.000Z", inApp, {
    status: "draft",
    data: { consultationReason: "MARCA-RASCUNHO-TARDIO texto inventado" },
    signedAt: null,
  }),
  row("free-1", "2018-01-01T09:00:00.000Z", {}, { data: { consultationReason: "MARCA-SEM-EPISODIO texto inventado" } }),
  row("free-draft", "2026-07-01T09:00:00.000Z", { status: "draft" }, {
    status: "draft",
    data: { consultationReason: "MARCA-RASCUNHO-SEM-EPISODIO texto inventado" },
    signedAt: null,
  }),
];

function inputsOf(r: Row): ReportInputs {
  return {
    record: {
      id: r.list.id,
      status: "signed",
      aiReviewState: null,
      version: 1,
      episodeId: r.list.episodeId,
      data: {},
      view: "form",
      annulledAt: null,
      consultationDate: new Date(r.list.createdAt),
      signedAt: new Date("2026-05-21T16:00:00Z"),
      ...r.record,
    },
    patient: { fullName: "Zzz Paciente Inventado", dateOfBirth: "1985-03-09", nif: "999000111" },
    practitioner: { fullName: "Zzz Terapeuta Inventado", title: null, signedByName: "Zzz Terapeuta Inventado" },
    clinic: { fiscalName: "Clinica Inventada, Lda.", nif: "999000222" },
    location: { name: "Linda-a-Velha", address: null, phone: null },
  };
}

beforeEach(() => {
  mockList.mockReset();
  mockLoad.mockReset();
  mockList.mockResolvedValue(ROWS.map((r) => r.list));
  mockLoad.mockImplementation(async (_claims, recordId) => {
    const found = ROWS.find((r) => r.list.id === recordId);
    return found ? inputsOf(found) : null;
  });
});

/** The file the export makes for the owner, and its pages' drawn lines. */
async function exported() {
  const selection = (await readPatientFichaExportSelection(owner, { patientId: PATIENT }))!;
  const pdf = (await renderPatientFichaReport(owner, selection, "pt"))!;
  return { selection, pdf, pages: await drawnLines(pdf.bytes) };
}

/** The index of the one page that draws `text`. */
function pageOf(pages: string[][], text: string): number {
  const at = pages.flatMap((lines, i) => (words(lines).includes(text) ? [i] : []));
  expect(at, text).toHaveLength(1);
  return at[0]!;
}

describe("Exportar ficha, on real pages (G3)", () => {
  it("the file holds the finalized registos, the annulled one among them, and leaves the three drafts out", async () => {
    const { selection, pdf } = await exported();
    // The rule leaves out the two the list calls drafts; the engine refuses the
    // one only the stored row calls a draft.
    expect(selection.leftOut).toBe(2);
    expect(pdf.recordIds).toEqual(["imp-1", "app-1", "app-annulled", "free-1"]);
    expect(pdf.leftOut).toBe(3);
    expect(pdf.sections).toBe(3);
    expect(pdf.filename).toBe("relatorio-ficha-4444aaaa.pdf");
    // Every per-record read ran with the caller's own claims.
    for (const call of mockLoad.mock.calls) expect(call[0]).toEqual(toClaims(owner));
  });

  it("a DRAFT is absent: nothing a draft stores is drawn on any page", async () => {
    const { pages } = await exported();
    const all = words(pages.flat());
    // CONTROL: what the finalized registos store is drawn.
    for (const marker of ["MARCA-IMPORTADO", "MARCA-APP-1", "MARCA-ANULADO", "MARCA-SEM-EPISODIO"]) {
      expect(all, marker).toContain(marker);
    }
    expect(all).not.toContain("RASCUNHO");
  });

  it("an ANNULLED registo prints the mark, with the annulment's date, on EVERY page of it, and no other page carries it", async () => {
    const { pages } = await exported();
    const first = pageOf(pages, "MARCA-ANULADO texto inventado");
    const next = pageOf(pages, pt["patients.fichaGroupNoEpisode"]);
    // It runs to several pages, up to the next section's heading.
    expect(next - first).toBeGreaterThan(1);
    for (let i = 0; i < pages.length; i += 1) {
      const marked = i >= first && i < next;
      expect(pages[i]!.includes(ANULADO), `page ${i + 1}`).toBe(marked);
      expect(pages[i]!.includes(`${ANULADO} · 22/09/2026`), `page ${i + 1}`).toBe(marked);
    }
  });

  it("each section opens with its heading page, oldest first, and 'Sem episódio' is last", async () => {
    const { pages } = await exported();
    const imported = pageOf(pages, "MARCA-IMPORTADO");
    const app1 = pageOf(pages, "MARCA-APP-1");
    const annulled = pageOf(pages, "MARCA-ANULADO texto inventado");
    const free = pageOf(pages, "MARCA-SEM-EPISODIO");
    // The heading pages, whole: what kind of section, its name, and nothing else.
    expect(pages[0]).toEqual([pt["report.record.episode"], "Fisioterapia", pt["patients.fichaGroupImported"]]);
    expect(pages[imported + 1]).toEqual([pt["report.record.episode"], "Osteopatia (01/03/2026)"]);
    expect(pages[free - 1]).toEqual([pt["patients.fichaGroupNoEpisode"]]);
    // The order: imported 2019, the app episode 2026, then the 2018 registo
    // filed in no episode, which is last although it is the oldest.
    expect(imported).toBe(1);
    expect(app1).toBe(imported + 2);
    expect(annulled).toBe(app1 + 1);
    expect(free).toBe(pages.length - 1);
    // No heading page names the patient or draws clinical text.
    for (const i of [0, imported + 1, free - 1]) {
      expect(words(pages[i]!)).not.toContain("Inventado");
      expect(words(pages[i]!)).not.toContain("MARCA");
    }
  });

  it("an imported registo prints as its own page shows it: the page's heading, its read-only notice, the stored field name", async () => {
    const { pages } = await exported();
    const page = pages[pageOf(pages, "MARCA-IMPORTADO")]!;
    expect(page).toContain(pt["clinical.importedPreviewTitle"]);
    expect(words(page)).toContain(pt["clinical.importedPreviewHelp"]);
    expect(page).toContain("queixas");
  });

  it("a patient of DRAFTS ONLY: nothing is selected, and no file is made", async () => {
    mockList.mockResolvedValue(ROWS.filter((r) => r.list.status === "draft").map((r) => r.list));
    expect(await readPatientFichaExportSelection(owner, { patientId: PATIENT })).toBeNull();
    // Even handed the ids directly, the engine prints none of them.
    const forced = {
      patientId: PATIENT,
      sections: [{ kind: "none" as const, label: null, recordIds: ["app-draft", "app-stale-draft", "free-draft"] }],
      leftOut: 0,
    };
    expect(await renderPatientFichaReport(owner, forced, "pt")).toBeNull();
  });
});
