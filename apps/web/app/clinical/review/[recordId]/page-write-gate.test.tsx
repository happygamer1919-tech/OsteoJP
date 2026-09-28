/**
 * page-write-gate.test.tsx: THE REVIEW PAGE OFFERS ITS EDITOR ONLY TO A READER
 * WHO MAY WRITE THE DRAFT. CARE-02a (0098), review round 2.
 *
 * getRecordDetail takes the care-team READ scope, so after 0098 a therapist on
 * a patient's care team can open a colleague's AI draft by its id. Every
 * control this page renders (save ficha, edit narrative, finalize) is a write
 * that reads its registo under therapistRegistoWriteScope and refuses that
 * reader with not_found. Before this gate the page drew the whole editor for
 * them anyway: controls that always refuse. It now sends a reader who cannot
 * write to the registo viewer, which draws the draft read-only and hides the
 * review link on the same test (clinical/[id]/page.tsx, canWriteRecord).
 *
 * The REAL page component renders here, with its data reads and its client
 * editors replaced by stubs; `redirect` throws, as Next's does, so a test can
 * read where the page sent the reader and that nothing was drawn.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "tenant-1", role: "therapist", userId: "user-1" } as {
    tenantId: string;
    role: string;
    userId: string;
  },
  getRecordDetail: vi.fn(),
  getFichaMedicaTemplate: vi.fn(),
  canWriteRecord: vi.fn(),
}));

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`REDIRECT ${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/records", () => ({
  getRecordDetail: h.getRecordDetail,
  getFichaMedicaTemplate: h.getFichaMedicaTemplate,
  canWriteRecord: h.canWriteRecord,
}));
vi.mock("../actions", () => ({
  saveNarrativeAction: vi.fn(),
  saveFichaReviewAction: vi.fn(),
  finalizeAction: vi.fn(),
}));
vi.mock("./ReviewEditor", async () => {
  const { createElement } = await import("react");
  return { ReviewEditor: () => createElement("div", { "data-testid": "review-editor" }) };
});
vi.mock("./FichaReviewEditor", async () => {
  const { createElement } = await import("react");
  return { FichaReviewEditor: () => createElement("div", { "data-testid": "ficha-review-editor" }) };
});

const REC = "22222222-2222-4222-8222-222222222222";

/** A minimal Ficha Medica schema: one text field, enough to parse. */
const FICHA_TEMPLATE = {
  id: "66666666-6666-4666-8666-666666666666",
  title: null,
  schema: { type: "object", properties: { queixa: { type: "string" } } },
};

function record(over: Record<string, unknown> = {}) {
  return {
    id: REC,
    patientId: "patient-1",
    patientName: "Paciente Sintetico",
    patientSex: null,
    status: "draft",
    source: "patient_submission",
    aiReviewState: "in_review",
    data: {},
    template: { schema: FICHA_TEMPLATE.schema },
    ...over,
  };
}

/** Renders the page, or returns where it redirected. */
async function open(rec: ReturnType<typeof record> | null): Promise<{ html?: string; redirectedTo?: string }> {
  h.getRecordDetail.mockResolvedValue(rec);
  const { default: ReviewDetailPage } = await import("./page");
  try {
    const el = await ReviewDetailPage({ params: Promise.resolve({ recordId: REC }) });
    return { html: renderToStaticMarkup(el) };
  } catch (e) {
    if (e instanceof Redirected) return { redirectedTo: e.url };
    throw e;
  }
}

beforeEach(() => {
  h.ctx = { tenantId: "tenant-1", role: "therapist", userId: "user-1" };
  h.getRecordDetail.mockReset();
  h.getFichaMedicaTemplate.mockReset();
  h.getFichaMedicaTemplate.mockResolvedValue(FICHA_TEMPLATE);
  h.canWriteRecord.mockReset();
});

describe("CARE-02a: the review page asks canWriteRecord before drawing any write control", () => {
  it("A CARE-TEAM READER (canWriteRecord false) of an AI draft is sent to the registo viewer, and no editor is drawn", async () => {
    h.canWriteRecord.mockResolvedValue(false);
    const r = await open(record({ source: "ai_ingested" }));
    expect(r.redirectedTo).toBe(`/clinical/${REC}`);
    expect(r.html).toBeUndefined();
    expect(h.canWriteRecord).toHaveBeenCalledWith(h.ctx, REC);
    // Nothing the AI branch reads for its editor was read.
    expect(h.getFichaMedicaTemplate).not.toHaveBeenCalled();
  });

  it("the same for a patient-submission draft (the narrative editor)", async () => {
    h.canWriteRecord.mockResolvedValue(false);
    const r = await open(record());
    expect(r.redirectedTo).toBe(`/clinical/${REC}`);
    expect(r.html).toBeUndefined();
  });

  it("CONTROL: a reader who may write gets the Ficha Medica editor for an AI draft", async () => {
    h.canWriteRecord.mockResolvedValue(true);
    const r = await open(record({ source: "ai_ingested" }));
    expect(r.redirectedTo).toBeUndefined();
    expect(r.html).toContain('data-testid="ficha-review-editor"');
    expect(h.canWriteRecord).toHaveBeenCalledWith(h.ctx, REC);
  });

  it("CONTROL: a reader who may write gets the narrative editor for a patient-submission draft", async () => {
    h.canWriteRecord.mockResolvedValue(true);
    const r = await open(record());
    expect(r.redirectedTo).toBeUndefined();
    expect(r.html).toContain('data-testid="review-editor"');
  });

  it("the gates that came before it still come first: no record, and a finalized record, never ask it", async () => {
    h.canWriteRecord.mockResolvedValue(true);
    expect((await open(null)).redirectedTo).toBe("/clinical/review");
    expect((await open(record({ status: "locked" }))).redirectedTo).toBe(`/clinical/${REC}`);
    expect(h.canWriteRecord).not.toHaveBeenCalled();
  });

  it("a role without clinical_records:review is sent to /clinical before any read", async () => {
    h.ctx = { tenantId: "tenant-1", role: "reception", userId: "user-2" };
    h.canWriteRecord.mockResolvedValue(true);
    expect((await open(record())).redirectedTo).toBe("/clinical");
    expect(h.getRecordDetail).not.toHaveBeenCalled();
    expect(h.canWriteRecord).not.toHaveBeenCalled();
  });
});
