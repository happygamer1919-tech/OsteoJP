/**
 * page-add-record.test.tsx: EPI-01b, R4 round 1 on #1526. A CLOSED EPISODE
 * OFFERS NO "+ Novo registo".
 *
 * createDraftRecord files a new registo only in an OPEN episode (it refuses a
 * closed one with `episode_closed`), and every imported episode is closed. The
 * episode page's "+ Novo registo neste episódio" links to /clinical/new with the
 * episode prefilled, so on a closed episode it would lead to a refusal: it is
 * drawn only on an open one, for an author. The REAL page renders here with
 * its two reads stubbed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  ctx: { tenantId: "t-1", role: "therapist", userId: "u-1" } as { tenantId: string; role: string; userId: string },
  status: "open" as "open" | "closed",
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/context", () => ({ requireRequestContext: async () => h.ctx }));
vi.mock("@/lib/clinical/episodes", () => ({
  getEpisodeDetail: async (_ctx: unknown, id: string) => ({
    id,
    patientId: "44444444-4444-4444-8444-444444444444",
    patientName: "Zzz Paciente Episodio Teste",
    title: "Osteopatia",
    status: h.status,
    openedAt: "2024-05-10T23:00:00.000Z",
    primaryPractitionerName: null,
    records: [],
  }),
}));

import EpisodePage from "./page";

const EPISODE = "77777777-7777-4777-8777-777777777772";
const NEW_RECORD_LINK = `href="/clinical/new?patientId=44444444-4444-4444-8444-444444444444&amp;episodeId=${EPISODE}"`;

async function render(role: string, status: "open" | "closed"): Promise<string> {
  h.ctx = { ...h.ctx, role };
  h.status = status;
  return renderToStaticMarkup(await EpisodePage({ params: Promise.resolve({ id: EPISODE }) }));
}

beforeEach(() => {
  h.status = "open";
});

describe("the episode page's '+ Novo registo' (EPI-01b R4 round 1)", () => {
  it("an OPEN episode, an author: the link is there (the control)", async () => {
    for (const role of ["therapist", "owner"]) {
      const html = await render(role, "open");
      expect(html, role).toContain(NEW_RECORD_LINK);
    }
  });

  it("a CLOSED episode (every imported one): no link, for any author; the page itself renders", async () => {
    for (const role of ["therapist", "owner"]) {
      const html = await render(role, "closed");
      expect(html, role).toContain("Osteopatia"); // the page rendered
      expect(html, role).not.toContain("/clinical/new?");
    }
  });

  it("a reader who may not author never had it, open or closed", async () => {
    expect(await render("admin", "open")).not.toContain("/clinical/new?");
  });
});
