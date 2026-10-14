/**
 * page.test.tsx: SAT-01. What /s/<code> renders, with the database replaced by
 * a recorder, so the page's own decisions are what is measured.
 *
 *   1. OPENING NEVER WRITES: a render calls the read and nothing else.
 *   2. ONE PAGE FOR EVERY LINK THAT IS NOT VALID: byte-identical HTML, and the
 *      same single lookup, whatever the code's shape and whatever went wrong.
 *   3. THE VISIT DATE ONLY: the form shows the date, text 7 and the three
 *      questions.
 *   4. NOT INDEXED, and never cached.
 *   5. THE OPT-OUT (S8): on the form of a valid link and nowhere else, as a
 *      form of its own that carries no answer; and its outcome page.
 *
 * The same properties against a real database, as the real role, are in
 * lib/surveys/survey-page.db.test.ts.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  /** Every call the page made to the store, in order. */
  calls: [] as Array<{ fn: string; arg: unknown }>,
  /** What the read answers for a code: a row, null, or an error to throw. */
  resolve: (() => null) as (code: string) => unknown,
  settings: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/surveys/survey-store", () => ({
  resolveSurveyCode: async (args: { code: string }) => {
    H.calls.push({ fn: "resolveSurveyCode", arg: args.code });
    const answer = H.resolve(args.code);
    if (answer instanceof Error) throw answer;
    return answer;
  },
  loadSurveyTenantSettings: async (tenantId: string) => {
    H.calls.push({ fn: "loadSurveyTenantSettings", arg: tenantId });
    return H.settings;
  },
  submitSurveyResponse: async (args: unknown) => {
    H.calls.push({ fn: "submitSurveyResponse", arg: args });
    return "recorded";
  },
  optOutSurvey: async (args: unknown) => {
    H.calls.push({ fn: "optOutSurvey", arg: args });
    return "recorded";
  },
}));

import { CURRENT_SURVEY_CONSENT_VERSION, getStrings } from "@osteojp/i18n";
import SurveyPage, { dynamic, metadata } from "./page";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPOINTMENT = "22222222-2222-4222-8222-222222222222";
const LIVE = "Ab3_dE-9";
/** 23 May 2026, 10:45 in Lisbon. */
const VISIT_ENDS = new Date("2026-05-23T09:45:00Z");

const pt = getStrings("pt");
const en = getStrings("en");

async function render(code: string, query: { r?: string; l?: string } = {}): Promise<string> {
  const element = await SurveyPage({
    params: Promise.resolve({ code }),
    searchParams: Promise.resolve(query),
  });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  H.calls = [];
  H.settings = null;
  H.resolve = (code) =>
    code === LIVE ? { tenantId: TENANT, appointmentId: APPOINTMENT, visitEndsAt: VISIT_ENDS } : null;
});

describe("a live code", () => {
  it("renders the title, the visit date, text 7, the three questions and the submit button", async () => {
    const html = await render(LIVE);
    expect(html).toContain(pt["survey.page.title"]);
    expect(html).toContain("Consulta de 23 de maio de 2026");
    expect(html).toContain(pt["survey.page.instruction"]);
    expect(html).toContain(pt["survey.page.whoReads"]);
    for (const key of ["survey.page.q1", "survey.page.q2", "survey.page.q3"] as const) {
      expect(html, key).toContain(pt[key]);
    }
    expect(html).toContain(pt["survey.page.healthNote"]);
    expect(html).toContain(pt["survey.page.contactConsent"]);
    expect(html).toContain(pt["survey.page.submit"]);
  });

  it("offers 0 to 10 and 1 to 5, nothing chosen, and the contact box unticked", async () => {
    const html = await render(LIVE);
    expect(html.match(/type="radio"[^>]*name="nps"/g)).toHaveLength(11);
    expect(html.match(/type="radio"[^>]*name="rating"/g)).toHaveLength(5);
    expect(html).toMatch(/type="checkbox"[^>]*name="contactConsent"/);
    expect(html).not.toMatch(/\schecked(=|\s|>)/);
  });

  it("posts the label of the text it shows, and shows no error before a submit", async () => {
    const html = await render(LIVE);
    expect(html).toContain(`name="consentVersion" value="${CURRENT_SURVEY_CONSENT_VERSION}"`);
    expect(html).not.toContain('role="alert"');
    for (const key of [
      "survey.page.errorSummary",
      "survey.page.q1Error",
      "survey.page.q2Error",
      "survey.page.commentError",
      "survey.page.saveError",
    ] as const) {
      expect(html, key).not.toContain(pt[key]);
    }
  });

  it("has the opt-out under the submit button, with its note (texts 19 and 20)", async () => {
    const html = await render(LIVE);
    expect(html).toContain("Não quero receber mais avaliações");
    expect(html).toContain("Os lembretes de consulta não são afetados.");
    // Two buttons and no third: the answer's, then the opt-out's.
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toEqual([pt["survey.page.submit"], pt["survey.page.optOut"]]);
    expect(html.indexOf(pt["survey.page.optOutNote"])).toBeGreaterThan(html.indexOf(pt["survey.page.optOut"]));
  });

  it("the opt-out is a form of its own: it carries the code and the language, and no answer", async () => {
    const html = await render(LIVE);
    const forms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((m) => m[1]!);
    expect(forms).toHaveLength(2);
    const [answer, optOut] = forms as [string, string];
    // CONTROL: the reader does find fields, in the form that has them.
    expect(answer).toMatch(/name="nps"/);
    expect(answer).not.toContain(pt["survey.page.optOut"]);
    expect(optOut).toContain(pt["survey.page.optOut"]);
    const names = [...optOut.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).filter((n) => !n!.startsWith("$"));
    expect(names.sort()).toEqual(["code", "locale"]);
    expect(optOut).toContain(`name="code" value="${LIVE}"`);
    expect(optOut).not.toMatch(/type="(radio|checkbox)"|<textarea/);
  });

  it("the opt-out is in the clinic's language too", async () => {
    H.settings = { locale: "en" };
    const html = await render(LIVE);
    expect(html).toContain(en["survey.page.optOut"]);
    expect(html).toContain(en["survey.page.optOutNote"]);
    expect(html).not.toContain(pt["survey.page.optOut"]);
  });

  it("is in the clinic's language when the clinic has one set", async () => {
    H.settings = { locale: "en" };
    const html = await render(LIVE);
    expect(html).toContain(en["survey.page.title"]);
    expect(html).toContain("Appointment on 23 May 2026");
    expect(html).toContain(en["survey.page.whoReads"]);
    expect(html).toContain('name="locale" value="en"');
  });

  it("reads the code, then the clinic's language, and nothing about a patient or an appointment", async () => {
    await render(LIVE);
    expect(H.calls).toEqual([
      { fn: "resolveSurveyCode", arg: LIVE },
      { fn: "loadSurveyTenantSettings", arg: TENANT },
    ]);
  });
});

describe("OPENING NEVER WRITES", () => {
  it("no render, of any code, with any flag, calls the answer", async () => {
    for (const code of [LIVE, "unknownX", "short", "survey:ABCDEFGH"]) {
      for (const query of [{}, { r: "generic" }, { r: "answered" }, { r: "optedout" }, { r: "anything" }]) {
        await render(code, query);
      }
    }
    // CONTROL: the recorder recorded, so the absence below is a fact.
    expect(H.calls.length).toBeGreaterThan(8);
    expect(H.calls.filter((c) => c.fn === "submitSurveyResponse")).toEqual([]);
    expect(H.calls.filter((c) => c.fn === "optOutSurvey")).toEqual([]);
    expect(new Set(H.calls.map((c) => c.fn))).toEqual(
      new Set(["resolveSurveyCode", "loadSurveyTenantSettings"]),
    );
  });
});

describe("ONE PAGE FOR EVERY LINK THAT IS NOT VALID", () => {
  /** Every way a link can fail to be valid that the page itself can tell apart from a live one. */
  const BAD: Array<[string, string, (() => void)?]> = [
    ["never issued", "ZZZZZZZZ"],
    ["too short", "abc"],
    ["too long", "ABCDEFGHIJKLMNOP"],
    ["empty", ""],
    ["a character outside the alphabet", "ABCD%20FG"],
    ["the confirm-hash collider", "survey:ABCDEFGH"],
    ["a path", "..%2F..%2Flogin"],
    ["markup", "<script>x"],
    [
      "the key is absent, so hashing throws",
      LIVE,
      () => {
        H.resolve = () => new Error("REMINDERS_CONFIRM_CODE_SECRET is not set");
      },
    ],
    [
      "the database is away",
      LIVE,
      () => {
        H.resolve = () => new Error("connect ECONNREFUSED");
      },
    ],
  ];

  it("byte-identical HTML for every one, and the same single lookup", async () => {
    const reference = await render("ZZZZZZZZ");
    expect(reference).toContain(pt["survey.page.invalidTitle"]);
    expect(reference).toContain(pt["survey.page.invalidBody"]);

    for (const [name, code, arrange] of BAD) {
      H.calls = [];
      arrange?.();
      const html = await render(code);
      expect(html, name).toBe(reference);
      // The page has no faster path for a guess of the wrong shape: it asks
      // the store for every code, once, and asks nothing else.
      expect(H.calls, name).toEqual([{ fn: "resolveSurveyCode", arg: code }]);
    }
  });

  it("the action's refusal flag gives that same page, even on a code that is still live", async () => {
    const reference = await render("ZZZZZZZZ");
    H.calls = [];
    expect(await render(LIVE, { r: "generic" })).toBe(reference);
    // The flag is read after the lookup, so the refusal costs what any other does.
    expect(H.calls).toEqual([{ fn: "resolveSurveyCode", arg: LIVE }]);
    expect(await render("ZZZZZZZZ", { r: "generic" })).toBe(reference);
  });

  it("is in the default language even when the code's clinic has another", async () => {
    H.settings = { locale: "en" };
    const reference = await render("ZZZZZZZZ");
    expect(await render(LIVE, { r: "generic" })).toBe(reference);
    expect(reference).not.toContain(en["survey.page.invalidTitle"]);
  });

  it("an unknown flag is ignored", async () => {
    const reference = await render("ZZZZZZZZ");
    expect(await render("ZZZZZZZZ", { r: "confirmed" })).toBe(reference);
    expect(await render(LIVE, { r: "confirmed" })).toBe(await render(LIVE));
  });

  it("nothing of the request is echoed into the page", async () => {
    const html = await render("<script>x", { r: "generic", l: "<b>" });
    expect(html).not.toContain("script");
    expect(html).not.toContain("<b>");
  });

  it("NEGATIVE ARM: a live code's page differs, so the comparison can see a difference", async () => {
    const reference = await render("ZZZZZZZZ");
    const live = await render(LIVE);
    expect(live).not.toBe(reference);
    expect(live).not.toContain(pt["survey.page.invalidTitle"]);
    expect(reference).not.toContain(pt["survey.page.title"]);
    expect(reference).not.toContain("<form");
  });

  it("THE OPT-OUT IS NOT ON IT: a link that is not valid offers nothing to press", async () => {
    // CONTROL: the reading below finds the opt-out where it is.
    expect(await render(LIVE)).toContain(pt["survey.page.optOut"]);
    for (const [code, query] of [
      ["ZZZZZZZZ", {}],
      ["short", {}],
      [LIVE, { r: "generic" }],
      ["ZZZZZZZZ", { r: "generic" }],
    ] as const) {
      const html = await render(code, query);
      expect(html, code).not.toContain(pt["survey.page.optOut"]);
      expect(html, code).not.toContain(pt["survey.page.optOutNote"]);
      expect(html, code).not.toContain("<button");
    }
  });
});

describe("the page after an opt-out", () => {
  it("says the request was recorded (texts 28 and 29), the same for every address, without a lookup", async () => {
    const a = await render(LIVE, { r: "optedout", l: "pt" });
    expect(a).toContain("Pedido registado");
    expect(a).toContain(
      "Não voltará a receber avaliações de satisfação da OsteoJP. Os lembretes de consulta não são afetados.",
    );
    expect(await render("ZZZZZZZZ", { r: "optedout", l: "pt" })).toBe(a);
    expect(await render("short", { r: "optedout" })).toBe(a);
    expect(H.calls).toEqual([]);
  });

  it("is in the language the form was shown in, and falls back to the default on anything else", async () => {
    expect(await render(LIVE, { r: "optedout", l: "en" })).toContain(en["survey.page.optedOutTitle"]);
    expect(await render(LIVE, { r: "optedout", l: "xx" })).toContain(pt["survey.page.optedOutTitle"]);
  });

  it("offers nothing to press, and is not the page an answer gets or the page a bad link gets", async () => {
    const optedOut = await render(LIVE, { r: "optedout", l: "pt" });
    expect(optedOut).not.toContain("<form");
    expect(optedOut).not.toContain("<button");
    expect(optedOut).not.toBe(await render(LIVE, { r: "answered", l: "pt" }));
    expect(optedOut).not.toBe(await render("ZZZZZZZZ"));
  });
});

describe("the page after an answer", () => {
  it("says the answer was recorded, the same for every address, without a lookup", async () => {
    const a = await render(LIVE, { r: "answered", l: "pt" });
    expect(a).toContain(pt["survey.page.answeredTitle"]);
    expect(a).toContain(pt["survey.page.answeredBody"]);
    expect(await render("ZZZZZZZZ", { r: "answered", l: "pt" })).toBe(a);
    expect(await render("short", { r: "answered" })).toBe(a);
    expect(H.calls).toEqual([]);
  });

  it("is in the language the form was shown in, and falls back to the default on anything else", async () => {
    expect(await render(LIVE, { r: "answered", l: "en" })).toContain(en["survey.page.answeredTitle"]);
    const fallback = await render(LIVE, { r: "answered", l: "xx" });
    expect(fallback).toContain(pt["survey.page.answeredTitle"]);
  });
});

describe("the route's own settings", () => {
  it("is never indexed and never cached", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
  });
});
