/**
 * page-episode-pdf.test.tsx: EPI-01b, piece 3. WHO SEES "PDF do episódio" ON
 * THE REGISTOS TAB, AND ON WHICH GROUPS.
 *
 * The REAL page component renders here, on the Registos tab, with its data
 * reads replaced by stubs and its server actions by inert functions. What is
 * pinned is the page's own wiring:
 *   - the gate is the per-record button's: whoever reads clinical records
 *     (owner, admin, therapist, and a care-team therapist who only READS the
 *     ficha). Reception has no Registos tab at all;
 *   - the button is on an APP episode holding at least one finalized registo
 *     (EXPORT-01: an annulled one counts, it is in the file with its mark), and
 *     not on an episode of drafts only, not on an open episode with no registo
 *     yet, not on "Sem episódio";
 *   - EXPORT-01: an IMPORTED group holding a finalized registo has the same
 *     button, for the group (its specialty), wired to its own action;
 *   - a group that shows a registo the file leaves out (a draft) says so beside
 *     the button, and a group that shows none does not;
 *   - the button names its episode, and the page hands it the patient and
 *     THAT group's episode (read from the props the page passes; what the
 *     button then asks the server action for is episode-pdf-button.test.tsx's).
 * Every "no button" arm first proves the group rendered, so an empty tab can
 * never pass as "no button".
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));

const PATIENT_ID = "44444444-4444-4444-8444-444444444444";
const EP_FINAL = "77777777-7777-4777-8777-777777777771";
const EP_MIXED = "77777777-7777-4777-8777-777777777772";
const EP_DRAFTS = "77777777-7777-4777-8777-777777777773";
const EP_EMPTY = "77777777-7777-4777-8777-777777777774";
const EP_ANNULLED = "77777777-7777-4777-8777-777777777775";
const EP_IMPORTED = "77777777-7777-4777-8777-777777777776";
const EP_IMPORTED_2 = "77777777-7777-4777-8777-777777777777";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

const h = vi.hoisted(() => ({
  ctx: { tenantId: "11111111-1111-4111-8111-111111111111", role: "therapist", userId: "22222222-2222-4222-8222-222222222222" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  /** What the narrow (write) getPatient finds: false for a care-team reader. */
  mayWrite: true,
  /** What listFichaRecords was asked: the "Mostrar anulados" toggle reaches it. */
  includeAnnulled: [] as boolean[],
  /** What the page handed each "PDF do episódio" button, in render order. */
  buttonProps: [] as Record<string, unknown>[],
  /** What the page handed each IMPORTED group's button, in render order. */
  importedButtonProps: [] as Record<string, unknown>[],
  /** An imported draft beside the locked imported registo, when asked for. */
  importedDraft: false,
}));

class NotFound extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/patients",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

const patient = {
  id: PATIENT_ID,
  fullName: "Zzz Paciente Render Teste",
  mergedIntoId: null,
  deletedAt: null,
  primaryLocationId: null,
  dateOfBirth: null,
  sex: null,
  nif: "999000111",
  nifExempt: false,
  nifExemptReason: null,
  patientNumber: null,
  phone: null,
  email: null,
  profession: null,
  city: null,
  region: null,
  referralSource: null,
  contraindicationEpilepsy: false,
  contraindicationPregnancy: false,
  contraindicationPacemaker: false,
  contraindicationOther: false,
  contraindicationOtherNote: null,
};

vi.mock("../../../lib/auth/context", () => ({
  getRequestContext: async () => h.ctx,
  requireRequestContext: async () => h.ctx,
  runScoped: vi.fn(),
}));
vi.mock("../../../lib/patients/queries", () => ({
  getPatient: async (_id: string, opts: { access?: string } = {}) =>
    opts.access === "read" || h.mayWrite ? patient : null,
  getPatientHardDeleteBlockers: async () => ({ hasClinicalRecords: true, hasOtherReferences: false, counts: [] }),
}));
vi.mock("../../../lib/patients/rgpd-acceptance", () => ({ getLatestRgpdAcceptance: async () => ({ id: "x" }) }));
vi.mock("../../../lib/clinical/ficha-groups", () => ({
  // As the real read does: annulled registos are dropped unless asked for.
  listFichaRecords: async (_ctx: unknown, filter: { includeAnnulled?: boolean }) => {
    h.includeAnnulled.push(Boolean(filter.includeAnnulled));
    const all = [
      rec("r-final-1", { episodeId: EP_FINAL, episodeTitle: "Osteopatia (01/09/2026)", status: "signed", createdAt: "2026-09-01T09:00:00.000Z" }),
      rec("r-final-2", { episodeId: EP_FINAL, episodeTitle: "Osteopatia (01/09/2026)", status: "locked", createdAt: "2026-09-08T09:00:00.000Z" }),
      rec("r-mixed-1", { episodeId: EP_MIXED, episodeTitle: "Fisioterapia (10/08/2026)", status: "signed", createdAt: "2026-08-10T09:00:00.000Z" }),
      rec("r-mixed-2", { episodeId: EP_MIXED, episodeTitle: "Fisioterapia (10/08/2026)", status: "draft", createdAt: "2026-08-17T09:00:00.000Z" }),
      rec("r-drafts-1", { episodeId: EP_DRAFTS, episodeTitle: "Osteopatia (01/07/2026)", status: "draft", createdAt: "2026-07-01T09:00:00.000Z" }),
      rec("r-annulled-1", { episodeId: EP_ANNULLED, episodeTitle: "Fisioterapia (01/06/2026)", status: "signed", annulled: true, createdAt: "2026-06-01T09:00:00.000Z" }),
      rec("r-imp", { episodeId: EP_IMPORTED, episodeTitle: "Osteopatia", episodeImported: true, status: "locked", createdAt: "2024-05-10T23:00:00.000Z" }),
      rec("r-free", { status: "signed", createdAt: "2026-05-20T10:00:00.000Z" }),
      ...(h.importedDraft
        ? [rec("r-imp-draft", { episodeId: EP_IMPORTED_2, episodeTitle: "Osteopatia", episodeImported: true, status: "draft", createdAt: "2024-06-10T23:00:00.000Z" })]
        : []),
    ];
    return filter.includeAnnulled ? all : all.filter((r) => !r.annulled);
  },
}));
// An open episode with no registo yet: the tab draws it for a viewer who may write.
vi.mock("../../../lib/clinical/episodes", () => ({
  listOpenAppEpisodes: async () => [
    {
      id: EP_EMPTY,
      tenantId: h.ctx.tenantId,
      patientId: PATIENT_ID,
      status: "open",
      title: "Osteopatia (05/10/2026)",
      openedAt: new Date("2026-10-05T09:00:00.000Z"),
      imported: false,
      empty: true,
    },
  ],
}));
vi.mock("../../../lib/clinical/records", () => ({
  listActiveTemplates: async () => [{ id: TEMPLATE, key: "ficha_medica", title: null, version: 1 }],
}));
vi.mock("../../../lib/invoices/queries", () => ({ listActiveLocations: async () => [], listInvoices: async () => [] }));
vi.mock("../../../lib/patients/documents", () => ({ listPatientDocuments: async () => [] }));
vi.mock("../../../lib/scheduling/data", () => ({
  getAgendaOptions: async () => ({ therapists: [], locations: [], bookableLocations: [], services: [], packs: [] }),
  listPatientAppointments: async () => [],
}));
vi.mock("../../../lib/auth/viewer-locations", () => ({ bookingLocationScope: async () => null }));
vi.mock("../../../lib/packs/instances", () => ({ listPatientPackInstances: async () => [] }));
vi.mock("../../../lib/patients/note-revisions", () => ({ listPatientNotes: async () => [] }));
vi.mock("../../../lib/guest-intake/queries", () => ({ listGuestIntakesForPatient: async () => [] }));
vi.mock("../../../lib/admin/care-team", () => ({ listCareTeam: async () => [], listCareTeamForTherapist: async () => null }));
// Server actions: inert here. The page only hands them to forms and buttons.
vi.mock("../../clinical/[id]/actions", () => ({ versionRecordAction: vi.fn() }));
vi.mock("../../clinical/new/actions", () => ({ createRecordAction: vi.fn() }));
vi.mock("./episode-actions", () => ({ createEpisodeAction: vi.fn() }));
vi.mock("./episode-pdf-actions", () => ({
  downloadEpisodeReportUrlAction: vi.fn(),
  downloadImportedGroupReportUrlAction: vi.fn(),
}));
// The REAL button, with the props the page hands it recorded on the way in.
vi.mock("./episode-pdf-button", async (importOriginal) => {
  const real = await importOriginal<typeof import("./episode-pdf-button")>();
  const { createElement } = await import("react");
  return {
    EpisodePdfButton: (props: Parameters<typeof real.EpisodePdfButton>[0]) => {
      h.buttonProps.push({ ...props });
      return createElement(real.EpisodePdfButton, props);
    },
  };
});
vi.mock("./imported-group-pdf-button", async (importOriginal) => {
  const real = await importOriginal<typeof import("./imported-group-pdf-button")>();
  const { createElement } = await import("react");
  return {
    ImportedGroupPdfButton: (props: Parameters<typeof real.ImportedGroupPdfButton>[0]) => {
      h.importedButtonProps.push({ ...props });
      return createElement(real.ImportedGroupPdfButton, props);
    },
  };
});
vi.mock("./actions", () => ({ hardDeleteRecordAction: vi.fn(), annulRecordAction: vi.fn() }));
vi.mock("../../../lib/patients/actions", () => ({
  softDeletePatientAction: vi.fn(),
  restorePatientAction: vi.fn(),
  hardDeletePatientAction: vi.fn(),
  preflightHardDeleteAction: vi.fn(),
  searchPatientsAction: vi.fn(),
}));

function rec(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "draft",
    version: 1,
    supersedesId: null,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-10-02T09:00:00.000Z",
    annulled: false,
    templateTitle: null,
    episodeId: null,
    episodeTitle: null,
    episodeImported: false,
    excerpt: null,
    ...over,
  };
}

import PatientProfilePage from "./page";

const s = getStrings("pt");
const en = getStrings("en");

async function render(
  role: string,
  opts: { mayWrite?: boolean; anulados?: boolean; importedDraft?: boolean } = {},
): Promise<string> {
  h.ctx = { ...h.ctx, role };
  h.mayWrite = opts.mayWrite ?? true;
  h.importedDraft = opts.importedDraft ?? false;
  const el = await PatientProfilePage({
    params: Promise.resolve({ id: PATIENT_ID }),
    searchParams: Promise.resolve({ tab: "registos", ...(opts.anulados ? { anulados: "1" } : {}) }),
  });
  return renderToStaticMarkup(el);
}

/** The HTML of each record group, keyed by its data-group-key. */
function groups(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = html.split('data-testid="record-group"').slice(1);
  for (const part of parts) {
    const key = /data-group-key="([^"]+)"/.exec(part)?.[1];
    if (key) out[key] = part.split("</details>")[0]!;
  }
  return out;
}

const BUTTON = 'data-testid="record-group-episode-pdf"';
const IMPORTED_BUTTON = 'data-testid="record-group-imported-pdf"';
const PARTIAL = 'data-testid="record-group-episode-pdf-partial"';
const ROW = 'data-testid="record-row"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const FINAL = `episode:${EP_FINAL}`;
const MIXED = `episode:${EP_MIXED}`;
const DRAFTS = `episode:${EP_DRAFTS}`;
const EMPTY = `episode:${EP_EMPTY}`;
const ANNULLED = `episode:${EP_ANNULLED}`;
const IMPORTED = "imported:Osteopatia";

beforeEach(() => {
  h.mayWrite = true;
  h.includeAnnulled = [];
  h.buttonProps = [];
  h.importedButtonProps = [];
  h.importedDraft = false;
});

describe("EPI-01b, piece 3: which groups show 'PDF do episódio' (the treating therapist)", () => {
  it("an app episode of finalized registos: one button, and no 'partial' line", async () => {
    const g = groups(await render("therapist"));
    expect(count(g[FINAL]!, ROW)).toBe(2);
    expect(count(g[FINAL]!, BUTTON)).toBe(1);
    expect(count(g[FINAL]!, PARTIAL)).toBe(0);
  });

  it("an app episode with a finalized registo and a draft: one button, and the line saying drafts stay out", async () => {
    const g = groups(await render("therapist"));
    expect(count(g[MIXED]!, ROW)).toBe(2);
    expect(count(g[MIXED]!, BUTTON)).toBe(1);
    expect(count(g[MIXED]!, PARTIAL)).toBe(1);
    expect(unescape(g[MIXED]!)).toContain(s["patients.fichaGroupEpisodePdfPartial"]);
  });

  it("an app episode of DRAFTS ONLY: the group renders, no button", async () => {
    const g = groups(await render("therapist"));
    expect(count(g[DRAFTS]!, ROW)).toBe(1);
    expect(count(g[DRAFTS]!, BUTTON)).toBe(0);
    expect(count(g[DRAFTS]!, PARTIAL)).toBe(0);
  });

  it("an open episode with NO registo yet: the group renders (with '+ Avaliação'), no button", async () => {
    const g = groups(await render("therapist"));
    expect(g[EMPTY]).toBeDefined();
    expect(count(g[EMPTY]!, ROW)).toBe(0);
    expect(g[EMPTY]!).toContain(s["patients.fichaGroupCountNone"]);
    expect(count(g[EMPTY]!, 'data-testid="record-group-add-evaluation"')).toBe(1);
    expect(count(g[EMPTY]!, BUTTON)).toBe(0);
  });

  it("EXPORT-01: an IMPORTED group, with a locked registo: the group renders, with its own button and no app-episode button", async () => {
    const g = groups(await render("therapist"));
    expect(count(g[IMPORTED]!, ROW)).toBe(1);
    expect(count(g[IMPORTED]!, BUTTON)).toBe(0);
    expect(count(g[IMPORTED]!, IMPORTED_BUTTON)).toBe(1);
    expect(count(g[IMPORTED]!, PARTIAL)).toBe(0);
  });

  it("'Sem episódio', with a signed registo: the group renders, no button", async () => {
    const g = groups(await render("therapist"));
    expect(count(g["none"]!, ROW)).toBe(1);
    expect(count(g["none"]!, BUTTON)).toBe(0);
  });

  it("the whole tab: exactly two buttons, on the two episodes that hold a finalized registo", async () => {
    const html = await render("therapist");
    expect(Object.keys(groups(html)).sort()).toEqual([FINAL, MIXED, DRAFTS, EMPTY, IMPORTED, "none"].sort());
    expect(count(html, BUTTON)).toBe(2);
  });

  it("EXPORT-01: an episode whose only registo is ANNULLED: hidden by default; with 'Mostrar anulados' the group renders WITH the button, and no 'partial' line", async () => {
    expect(groups(await render("therapist"))[ANNULLED]).toBeUndefined();
    const g = groups(await render("therapist", { anulados: true }));
    expect(h.includeAnnulled).toEqual([false, true]);
    expect(count(g[ANNULLED]!, ROW)).toBe(1);
    expect(g[ANNULLED]!).toContain('data-annulled="true"');
    expect(count(g[ANNULLED]!, BUTTON)).toBe(1);
    expect(count(g[ANNULLED]!, PARTIAL)).toBe(0);
  });
});

describe("EXPORT-01: 'PDF do episódio' on an IMPORTED group", () => {
  it("the page hands the button the patient and the group's SPECIALTY, and the app-episode buttons are untouched", async () => {
    await render("owner");
    expect(h.importedButtonProps).toEqual([
      {
        patientId: PATIENT_ID,
        specialty: "Osteopatia",
        label: "PDF do episódio",
        ariaLabel: "Transferir o PDF do episódio: Osteopatia",
        errorLabel: s["clinical.downloadPdfError"],
      },
    ]);
    expect(h.buttonProps.map((p) => p.episodeId)).toEqual([EP_FINAL, EP_MIXED]);
  });

  it("the button says 'PDF do episódio' and names the group", async () => {
    const g = groups(await render("owner"));
    const html = unescape(g[IMPORTED]!);
    const at = html.indexOf(IMPORTED_BUTTON);
    const button = html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at));
    expect(button).toContain("PDF do episódio");
    expect(button).toContain('aria-label="Transferir o PDF do episódio: Osteopatia"');
    expect(button).toContain('type="button"');
    expect(count(g[IMPORTED]!, 'data-testid="record-group-imported-pdf-error"')).toBe(0);
  });

  it("an imported group that also shows an imported DRAFT: the button, and the line saying drafts stay out", async () => {
    const g = groups(await render("owner", { importedDraft: true }));
    expect(count(g[IMPORTED]!, ROW)).toBe(2);
    expect(count(g[IMPORTED]!, IMPORTED_BUTTON)).toBe(1);
    expect(count(g[IMPORTED]!, PARTIAL)).toBe(1);
  });

  it.each(["owner", "admin", "therapist"] as const)("%s reads clinical records: one button, on the imported group only", async (role) => {
    const html = await render(role);
    const g = groups(html);
    // Positive control: the reader sees the imported registo.
    expect(count(g[IMPORTED]!, ROW)).toBe(1);
    expect(count(g[IMPORTED]!, IMPORTED_BUTTON)).toBe(1);
    expect(count(html, IMPORTED_BUTTON)).toBe(1);
  });

  it("a CARE-TEAM therapist (reads the ficha, writes nothing here): the button", async () => {
    const html = await render("therapist", { mayWrite: false });
    expect(count(groups(html)[IMPORTED]!, IMPORTED_BUTTON)).toBe(1);
  });

  it("RECEPTION: no Registos tab, so no imported group and no button", async () => {
    const html = await render("reception");
    expect(html).toContain("Zzz Paciente Render Teste");
    expect(count(html, 'data-testid="record-group"')).toBe(0);
    expect(count(html, IMPORTED_BUTTON)).toBe(0);
    expect(h.importedButtonProps).toEqual([]);
  });
});

describe("EPI-01b, piece 3: what the button says and carries", () => {
  it("the visible label, and an accessible name that contains it and names the episode", async () => {
    const g = groups(await render("therapist"));
    const html = unescape(g[FINAL]!);
    expect(html).toContain('aria-label="Transferir o PDF do episódio: Osteopatia (01/09/2026)"');
    const at = html.indexOf(BUTTON);
    const button = html.slice(html.lastIndexOf("<button", at), html.indexOf("</button>", at));
    expect(button).toContain("PDF do episódio");
    expect(button).toContain('type="button"');
    // Not pressed yet: no error line.
    expect(count(g[FINAL]!, 'data-testid="record-group-episode-pdf-error"')).toBe(0);
  });

  it("the page hands each button the patient and ITS OWN group's episode, and nothing of another group's", async () => {
    await render("therapist");
    // Newest group first: the finalized episode, then the mixed one.
    expect(h.buttonProps).toEqual([
      {
        patientId: PATIENT_ID,
        episodeId: EP_FINAL,
        label: "PDF do episódio",
        ariaLabel: "Transferir o PDF do episódio: Osteopatia (01/09/2026)",
        errorLabel: s["clinical.downloadPdfError"],
      },
      {
        patientId: PATIENT_ID,
        episodeId: EP_MIXED,
        label: "PDF do episódio",
        ariaLabel: "Transferir o PDF do episódio: Fisioterapia (10/08/2026)",
        errorLabel: s["clinical.downloadPdfError"],
      },
    ]);
  });

  it("each button names its own episode", async () => {
    const g = groups(await render("therapist"));
    expect(unescape(g[MIXED]!)).toContain('aria-label="Transferir o PDF do episódio: Fisioterapia (10/08/2026)"');
    expect(unescape(g[MIXED]!)).not.toContain("Osteopatia (01/09/2026)");
  });

  it("the strings, in both languages", () => {
    expect(s["patients.fichaGroupEpisodePdf"]).toBe("PDF do episódio");
    expect(en["patients.fichaGroupEpisodePdf"]).toBe("Episode PDF");
    expect(s["patients.fichaGroupEpisodePdfAria"]).toBe("Transferir o PDF do episódio: {group}");
    expect(en["patients.fichaGroupEpisodePdfAria"]).toBe("Download the episode PDF: {group}");
    expect(s["patients.fichaGroupEpisodePdfPartial"]).toBe(
      "O PDF do episódio inclui só os registos finalizados. Os rascunhos ficam de fora.",
    );
    expect(en["patients.fichaGroupEpisodePdfPartial"]).toBe(
      "The episode PDF includes finalized records only. Drafts are left out.",
    );
    // The error line is the per-record button's own.
    expect(s["clinical.downloadPdfError"]).toBe("Não foi possível gerar o PDF.");
  });
});

describe("EPI-01b, piece 3: who sees the button (whoever reads clinical records)", () => {
  it("a CARE-TEAM therapist (reads the ficha, writes nothing here): the same two buttons, and no '+ Avaliação'", async () => {
    const html = await render("therapist", { mayWrite: false });
    const g = groups(html);
    // Positive control: the reader sees the registos.
    expect(count(g[FINAL]!, ROW)).toBe(2);
    expect(count(g[FINAL]!, BUTTON)).toBe(1);
    expect(count(g[MIXED]!, BUTTON)).toBe(1);
    expect(count(g[DRAFTS]!, BUTTON)).toBe(0);
    expect(count(html, BUTTON)).toBe(2);
    expect(count(html, 'data-testid="record-group-add-evaluation"')).toBe(0);
  });

  it.each(["owner", "admin"] as const)("%s: the same two buttons", async (role) => {
    const html = await render(role);
    const g = groups(html);
    expect(count(g[FINAL]!, BUTTON)).toBe(1);
    expect(count(g[MIXED]!, BUTTON)).toBe(1);
    expect(count(g[DRAFTS]!, BUTTON)).toBe(0);
    expect(count(g[IMPORTED]!, BUTTON)).toBe(0);
    expect(count(g["none"]!, BUTTON)).toBe(0);
    expect(count(html, BUTTON)).toBe(2);
  });

  it("RECEPTION: no Registos tab, so no groups and no button (the page renders, with the patient's name)", async () => {
    const html = await render("reception");
    expect(html).toContain("Zzz Paciente Render Teste");
    expect(count(html, 'data-testid="record-group"')).toBe(0);
    expect(count(html, BUTTON)).toBe(0);
  });
});
