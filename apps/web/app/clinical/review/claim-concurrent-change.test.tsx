/**
 * claim-concurrent-change.test.tsx: M-4. A CLAIM ROLLED BACK AS A DEADLOCK
 * VICTIM SAYS "TRY AGAIN" ON THE REVIEW QUEUE.
 *
 * Claiming a patient's submission files a draft registo for that patient
 * (claimReviewItem, lib/clinical/review.ts), so it can lose a deadlock like any
 * other registo insert. The writer answers `concurrent_change`
 * (records.deadlock.test.ts). Here: claimAction sends that one refusal back to
 * the queue with its own flag, and the REAL queue page, its reads stubbed,
 * draws the retry sentence for that flag, once.
 *
 * CONTROLS: every other refusal keeps the plain bounce (m=err), which draws
 * nothing, as before; a claim that goes through opens the draft.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStrings } from "@osteojp/i18n";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  claimReviewItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: h.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/clinical/review",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  requireRequestContext: vi.fn(async () => ({
    tenantId: "11111111-1111-4111-8111-111111111111",
    role: "therapist",
    userId: "22222222-2222-4222-8222-222222222222",
  })),
}));
vi.mock("@/lib/clinical/review", () => ({
  claimReviewItem: h.claimReviewItem,
  editReviewNarrative: vi.fn(),
  finalizeReview: vi.fn(),
  saveReviewFicha: vi.fn(),
  listReviewQueue: vi.fn(async () => []),
}));
vi.mock("@/lib/clinical/records", () => ({ getFichaMedicaTemplate: vi.fn() }));

import { ClinicalError } from "@/lib/clinical/errors";
import { claimAction } from "./actions";
import ReviewQueuePage from "./page";

const s = getStrings("pt");
const SUBMISSION = "88888888-8888-4888-8888-888888888888";
const RECORD = "55555555-5555-4555-8555-555555555555";
const ALERT = 'role="alert"';
const count = (html: string, needle: string) => html.split(needle).length - 1;
const unescape = (html: string) =>
  html.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Where claimAction redirected to. */
async function landing(source: string): Promise<string> {
  const f = new FormData();
  f.set("source", source);
  f.set("id", source === "ai" ? RECORD : SUBMISSION);
  try {
    await claimAction(f);
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("claimAction did not redirect");
}

async function render(m?: string): Promise<string> {
  return renderToStaticMarkup(await ReviewQueuePage({ searchParams: Promise.resolve(m ? { m } : {}) }));
}

beforeEach(() => {
  h.claimReviewItem.mockReset();
  h.redirect.mockClear();
});

describe("claimAction: where a refused claim lands (M-4)", () => {
  it.each(["patient", "ai"])("a %s claim rolled back as a deadlock victim lands on the queue with its own flag", async (source) => {
    h.claimReviewItem.mockRejectedValue(new ClinicalError("concurrent_change"));
    expect(await landing(source)).toBe("/clinical/review?m=concurrentChange");
    expect(h.claimReviewItem).toHaveBeenCalledTimes(1); // nothing is retried
  });

  it("CONTROL: every other refusal keeps the plain bounce", async () => {
    for (const failure of [
      new ClinicalError("already_reviewed"),
      new ClinicalError("not_found"),
      new ClinicalError("not_reviewable"),
      new Error("connection reset"),
    ]) {
      h.claimReviewItem.mockRejectedValue(failure);
      expect(await landing("patient")).toBe("/clinical/review?m=err");
    }
  });

  it("CONTROL: a claim that goes through opens the draft", async () => {
    h.claimReviewItem.mockResolvedValue({ recordId: RECORD });
    expect(await landing("patient")).toBe(`/clinical/review/${RECORD}`);
  });
});

describe("/clinical/review: the alert a refused claim lands on (M-4)", () => {
  it("m=concurrentChange draws the retry sentence, once", async () => {
    const html = await render("concurrentChange");
    expect(count(html, ALERT)).toBe(1);
    const at = html.indexOf(ALERT);
    expect(unescape(html.slice(html.lastIndexOf("<p", at), html.indexOf("</p>", at)))).toContain(s["errors.concurrentChange"]);
  });

  it("CONTROL: no m, the generic m=err, or an unrelated m draws no alert", async () => {
    for (const m of [undefined, "err", "concurrent_change", "episodeClosed"]) {
      const html = unescape(await render(m));
      expect(count(html, ALERT), String(m)).toBe(0);
      expect(html, String(m)).not.toContain(s["errors.concurrentChange"]);
    }
  });
});
