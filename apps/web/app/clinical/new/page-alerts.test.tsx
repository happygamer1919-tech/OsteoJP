/**
 * page-alerts.test.tsx: EPI-01b, R4 round 2 on #1526. WHAT /clinical/new SAYS
 * WHEN createRecordAction SENDS A REFUSED REGISTO BACK TO IT.
 *
 * createRecordAction redirects a refusal of the episode to /clinical/new with
 * its own flag: m=episodeMismatch (the episode is not this patient's) and
 * m=episodeClosed (a new registo goes only into an open episode). The REAL page
 * renders here with its reads stubbed; each flag draws its own pt-PT alert,
 * once, and no flag, the generic m=err, or an unrelated m draws neither.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: async () => ({ tenantId: "t-1", role: "therapist", userId: "u-1" }),
}));
vi.mock("@/lib/clinical/records", () => ({
  listActiveTemplates: async () => [{ id: "66666666-6666-4666-8666-666666666666", key: "ficha_medica", title: null, version: 1 }],
  listEpisodesForPicker: async () => [],
}));
vi.mock("@/lib/patients/queries", () => ({ getPatient: async () => null }));
vi.mock("./actions", () => ({ createRecordAction: vi.fn() }));
vi.mock("@/lib/patients/actions", () => ({ searchPatientsAction: vi.fn(async () => []) }));

import NewRecordPage from "./page";

const s = getStrings("pt");
const ALERT = 'role="alert"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function render(m?: string): Promise<string> {
  return renderToStaticMarkup(await NewRecordPage({ searchParams: Promise.resolve(m ? { m } : {}) }));
}

/** The whole <p> element carrying role="alert". */
function alertOf(html: string): string {
  const at = html.indexOf(ALERT);
  return unescape(html.slice(html.lastIndexOf("<p", at), html.indexOf("</p>", at)));
}

describe("/clinical/new: the alert a refused episode lands on (EPI-01b)", () => {
  it.each([
    ["episodeMismatch", "clinical.episodeMismatch"],
    ["episodeClosed", "clinical.episodeClosedRefused"],
  ] as const)("m=%s draws its own pt-PT alert, once, and the form still renders", async (m, key) => {
    const html = await render(m);
    expect(count(html, ALERT)).toBe(1);
    expect(alertOf(html)).toContain(s[key]);
    expect(html).toContain('name="formTemplateId"'); // the form is there to try again
  });

  it("the two alerts say different things, and each is the string the PR names", () => {
    expect(s["clinical.episodeMismatch"]).toBe("O episódio escolhido não pertence a este paciente. O registo não foi criado.");
    expect(s["clinical.episodeClosedRefused"]).toBe("O episódio escolhido está fechado. O registo não foi criado.");
  });

  it("CONTROL: no m, the generic m=err, or an unrelated m draws neither alert", async () => {
    for (const m of [undefined, "err", "episodeErr", "avaliacaoErr"]) {
      const html = unescape(await render(m));
      expect(count(html, ALERT), String(m)).toBe(0);
      expect(html, String(m)).not.toContain(s["clinical.episodeMismatch"]);
      expect(html, String(m)).not.toContain(s["clinical.episodeClosedRefused"]);
    }
  });
});
