/**
 * actions.test.ts: SAT-01. The two POSTs behind /s/<code>, the answer and the
 * opt-out (S8), in the order the spec gives them (5.2, 9.3): the code's shape,
 * then the limiter, then the door. The fields are read between the shape and
 * the limiter; the opt-out has none.
 *
 * THE ASSERTION THAT MATTERS IS WHAT WAS REACHED, not only where the action
 * redirected: a limiter consulted after the write would redirect just the same.
 * So every case counts the limiter's calls and the store's calls.
 *
 * AND THE REFUSALS ARE ONE: a limited submit, a refused one and a malformed
 * code all go to the page an invalid link gets. A distinguishable "too many
 * attempts" would be a new signal on a surface built to emit none. That holds
 * for an incomplete answer too: it gets its marked fields under the limit and
 * over it, so no post shows when the limit was reached.
 *
 * AND NOTHING THE VISITOR TYPED IS WRITTEN DOWN: no answer and no code in a
 * log line, and no answer in a URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  /** Verdicts the limiter should return, consumed in order. */
  verdicts: [] as boolean[],
  /** Every key and rule the limiter was asked about. */
  limiterCalls: [] as Array<{ key: string; rule: { limit: number; windowMs: number } }>,
  /** One entry per call that REACHED the store. */
  submits: [] as Array<{ code: string; answer: Record<string, unknown> }>,
  /** What the store answers: an outcome, or an error to throw. */
  store: "recorded" as "recorded" | "refused" | Error,
  /** One entry per opt-out that REACHED the store: every argument it was given. */
  optOuts: [] as Array<Record<string, unknown>>,
  /** What the store answers an opt-out. */
  optOutStore: "recorded" as "recorded" | "refused" | Error,
  redirects: [] as string[],
  headers: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (n: string) => H.headers.get(n) ?? null }),
}));

// `redirect` THROWS in Next, and that is load-bearing: it is what stops a
// refused path falling through into the write below it.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    H.redirects.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return {
    ...real,
    createDurableRateLimitStore: () => ({}),
    checkDurableRateLimit: async (key: string, rule: { limit: number; windowMs: number }) => {
      H.limiterCalls.push({ key, rule });
      const ok = H.verdicts.shift() ?? true;
      return { ok, limit: rule.limit, remaining: ok ? 1 : 0, retryAfterSeconds: 60 };
    },
  };
});

vi.mock("@/lib/surveys/survey-store", () => ({
  submitSurveyResponse: async (input: { code: string; answer: Record<string, unknown> }) => {
    H.submits.push({ code: input.code, answer: input.answer });
    if (H.store instanceof Error) throw H.store;
    return H.store;
  },
  optOutSurvey: async (input: Record<string, unknown>) => {
    H.optOuts.push({ ...input });
    if (H.optOutStore instanceof Error) throw H.optOutStore;
    return H.optOutStore;
  },
}));

import { CURRENT_SURVEY_CONSENT_VERSION } from "@osteojp/i18n";
import { RULES } from "@osteojp/rate-limit";
import { EMPTY_SURVEY_FORM_STATE, type SurveyFormState } from "@/lib/surveys/survey-form";
import { optOutSurveyAction, submitSurveyAction } from "./actions";

const CODE = "Ab3_dE-9";
const COMMENT = "Um comentario que nunca pode sair daqui.";

function form(over: Record<string, string | null> = {}): FormData {
  const base: Record<string, string | null> = {
    code: CODE,
    locale: "pt",
    consentVersion: CURRENT_SURVEY_CONSENT_VERSION,
    nps: "9",
    rating: "4",
    comment: COMMENT,
    contactConsent: "on",
    ...over,
  };
  const f = new FormData();
  for (const [k, v] of Object.entries(base)) if (v !== null) f.set(k, v);
  return f;
}

/** Run the action. A redirect is returned as its URL; a state is returned as itself. */
async function run(f: FormData): Promise<{ redirect: string } | { state: SurveyFormState }> {
  try {
    return { state: await submitSurveyAction(EMPTY_SURVEY_FORM_STATE, f) };
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) throw e;
    return { redirect: e.message.slice("NEXT_REDIRECT:".length) };
  }
}

/** Press the opt-out. A redirect is returned as its URL; a state is returned as itself. */
async function optOut(f: FormData): Promise<{ redirect: string } | { state: SurveyFormState }> {
  try {
    return { state: await optOutSurveyAction(EMPTY_SURVEY_FORM_STATE, f) };
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("NEXT_REDIRECT:")) throw e;
    return { redirect: e.message.slice("NEXT_REDIRECT:".length) };
  }
}

/** What the opt-out form posts: the code and the page's language, and nothing else. */
function optOutForm(over: Record<string, string | null> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({ code: CODE, locale: "pt", ...over })) if (v !== null) f.set(k, v);
  return f;
}

const GENERIC = `/s/${CODE}?r=generic`;

let logged: string[];
let spies: Array<{ mockRestore(): void }>;

beforeEach(() => {
  H.verdicts = [];
  H.limiterCalls = [];
  H.submits = [];
  H.store = "recorded";
  H.optOuts = [];
  H.optOutStore = "recorded";
  H.redirects = [];
  H.headers = new Map([["x-forwarded-for", "203.0.113.7"]]);
  logged = [];
  spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
    }),
  );
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
});

describe("guard on the guard: the harness is not vacuously passing", () => {
  it("a permitted, complete answer reaches the store once and lands on the thank-you page", async () => {
    const result = await run(form());
    expect(H.limiterCalls).toHaveLength(1);
    expect(H.submits).toEqual([
      {
        code: CODE,
        answer: {
          nps: 9,
          rating: 4,
          comment: COMMENT,
          contactConsent: true,
          consentVersion: CURRENT_SURVEY_CONSENT_VERSION,
        },
      },
    ]);
    expect(result).toEqual({ redirect: `/s/${CODE}?r=answered&l=pt` });
  });

  it("the thank-you page is asked for in the language the form was shown in, and only a known one", async () => {
    expect(await run(form({ locale: "en" }))).toEqual({ redirect: `/s/${CODE}?r=answered&l=en` });
    expect(await run(form({ locale: "xx&r=generic" }))).toEqual({ redirect: `/s/${CODE}?r=answered&l=pt` });
    expect(await run(form({ locale: null }))).toEqual({ redirect: `/s/${CODE}?r=answered&l=pt` });
  });
});

describe("a malformed code is refused before anything is consulted", () => {
  it.each(["", "short", "ABCDEFGHI", "ABCD EFG", "survey:ABCDEFGH", "../../login"])(
    "%j: no limiter call, no database call, the generic page",
    async (code) => {
      const result = await run(form({ code }));
      expect(H.limiterCalls, "a malformed code must not spend limiter budget").toHaveLength(0);
      expect(H.submits).toHaveLength(0);
      expect(result).toEqual({ redirect: `/s/${encodeURIComponent(code)}?r=generic` });
    },
  );

  it("a missing code field is the same refusal", async () => {
    const result = await run(form({ code: null }));
    expect(H.limiterCalls).toHaveLength(0);
    expect(H.submits).toHaveLength(0);
    expect(result).toEqual({ redirect: "/s/?r=generic" });
  });
});

describe("the limiter", () => {
  it("is asked before the store, with the survey rule, keyed on the client address and never on the code", async () => {
    await run(form());
    expect(H.limiterCalls).toEqual([{ key: "s-code:ip:203.0.113.7", rule: RULES.surveySubmit }]);
    expect(H.limiterCalls[0]!.key).not.toContain(CODE);
  });

  it("the rule is ten a minute, the confirm page's shape, and a rule of its own", () => {
    expect(RULES.surveySubmit).toEqual({ limit: 10, windowMs: 60_000 });
    expect(RULES.surveySubmit).toEqual(RULES.tokenRedeem);
    expect(RULES.surveySubmit).not.toBe(RULES.tokenRedeem);
  });

  it("when it refuses, THE DATABASE IS NOT REACHED", async () => {
    H.verdicts = [false];
    await run(form());
    expect(H.submits, "a limited submit must not do database work").toHaveLength(0);
  });

  it("its refusal is the page a bad code gets, with no sign of a limit", async () => {
    H.verdicts = [false];
    const limited = await run(form());
    H.store = "refused";
    const badCode = await run(form());
    expect(limited).toEqual({ redirect: GENERIC });
    expect(badCode).toEqual(limited);
    expect(GENERIC).not.toMatch(/limit|429|slow|wait|tent/i);
  });

  it("refuses after its limit: the eleventh submit in a minute, by the real rule", async () => {
    // The mock above answers what it is told to, so this arm uses the real
    // limiter arithmetic against an in-memory store with the real rule.
    const real = await vi.importActual<typeof import("@osteojp/rate-limit")>("@osteojp/rate-limit");
    const counts = new Map<string, number>();
    const memory: import("@osteojp/rate-limit").DurableRateLimitStore = {
      async hit(key, windowMs) {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return { count, resetAt: new Date(Date.now() + windowMs) };
      },
    };
    const verdicts: boolean[] = [];
    for (let i = 0; i < 11; i++) {
      const v = await real.checkDurableRateLimit("s-code:ip:203.0.113.7", real.RULES.surveySubmit, memory);
      verdicts.push(v.ok);
    }
    expect(verdicts).toEqual([...Array.from({ length: 10 }, () => true), false]);
  });
});

describe("a submit the door refuses", () => {
  it("goes to the generic page, whatever the reason was", async () => {
    H.store = "refused";
    expect(await run(form())).toEqual({ redirect: GENERIC });
    expect(H.submits).toHaveLength(1);
  });
});

describe("an incomplete answer", () => {
  it("comes back as marked fields, never reaches the store, and hands back nothing that was entered", async () => {
    const result = await run(form({ rating: null }));
    expect(H.submits).toHaveLength(0);
    expect(H.redirects).toHaveLength(0);
    expect(result).toEqual({ state: { errors: { rating: true } } });
    expect(JSON.stringify(result)).not.toContain(COMMENT);
  });

  it("is not counted by the limiter: the fields are read first, and it costs no budget", async () => {
    await run(form({ nps: null }));
    expect(H.limiterCalls).toHaveLength(0);
    expect(H.submits).toHaveLength(0);
  });

  it("gets the same marked fields over the limit as under it, so it cannot show when the limit was reached", async () => {
    const under = await run(form({ nps: null }));
    // Every verdict from here on is a refusal.
    H.verdicts = Array.from({ length: 5 }, () => false);
    // CONTROL: the limiter really is refusing. A complete answer is turned away.
    expect(await run(form())).toEqual({ redirect: GENERIC });
    const over = await run(form({ nps: null }));
    expect(over).toEqual({ state: { errors: { nps: true } } });
    expect(over).toEqual(under);
    // The one redirect is the control's.
    expect(H.redirects).toEqual([GENERIC]);
    expect(H.submits).toHaveLength(0);
  });

  it("with a code nobody issued gets the same marked fields as with a live one", async () => {
    // The store is not asked, so the action cannot know which code is live:
    // the store's answer is set both ways and changes nothing.
    const live = await run(form({ rating: null }));
    H.store = "refused";
    const unknown = await run(form({ rating: null, code: "Zz9_yX-1" }));
    expect(unknown).toEqual(live);
    expect(H.submits).toHaveLength(0);
    expect(H.limiterCalls).toHaveLength(0);
  });
});

describe("a save that fails", () => {
  it("is reported as a save that failed, not as an invalid link, and the error's text goes nowhere", async () => {
    H.store = new Error(`insert failed: Failing row contains (${COMMENT}, ${CODE})`);
    const result = await run(form());
    expect(H.redirects).toHaveLength(0);
    expect(result).toEqual({ state: { errors: { save: true } } });
  });

  it("logs the error's class name and nothing the visitor sent", async () => {
    class PostgresError extends Error {
      override name = "PostgresError";
    }
    H.store = new PostgresError(`Failing row contains (${COMMENT}, ${CODE})`);
    await run(form());
    // CONTROL: something was logged, so the absences below are about content.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("PostgresError");
    expect(logged[0]).not.toContain(COMMENT);
    expect(logged[0]).not.toContain(CODE);
    expect(logged[0]).not.toContain("Failing row");
  });
});

describe("nothing the visitor typed is written down", () => {
  it("no log line on any path that does not fail", async () => {
    await run(form());
    H.store = "refused";
    await run(form());
    H.verdicts = [false];
    await run(form());
    await run(form({ nps: null }));
    await run(form({ code: "short" }));
    expect(logged).toEqual([]);
  });

  it("no answer in any redirect URL", async () => {
    await run(form());
    H.store = "refused";
    await run(form());
    H.verdicts = [false];
    await run(form());
    // CONTROL: three redirects were made.
    expect(H.redirects).toHaveLength(3);
    for (const url of H.redirects) {
      expect(url).toMatch(/^\/s\/Ab3_dE-9\?r=(answered&l=pt|generic)$/);
      expect(decodeURIComponent(url)).not.toContain(COMMENT);
    }
  });
});

// ---------------------------------------------------------------------------
// THE OPT-OUT (S8): the same order, the same budget, the same refusal.
// ---------------------------------------------------------------------------

describe("the opt-out: guard on the guard", () => {
  it("a permitted opt-out reaches the store once, with the code and nothing else, and lands on the opt-out page", async () => {
    const result = await optOut(optOutForm());
    expect(H.limiterCalls).toHaveLength(1);
    expect(H.optOuts).toEqual([{ code: CODE }]);
    expect(H.submits, "an opt-out is never an answer").toHaveLength(0);
    expect(result).toEqual({ redirect: `/s/${CODE}?r=optedout&l=pt` });
  });

  it("the opt-out page is asked for in the language the form was shown in, and only a known one", async () => {
    expect(await optOut(optOutForm({ locale: "en" }))).toEqual({ redirect: `/s/${CODE}?r=optedout&l=en` });
    expect(await optOut(optOutForm({ locale: "xx&r=generic" }))).toEqual({
      redirect: `/s/${CODE}?r=optedout&l=pt`,
    });
    expect(await optOut(optOutForm({ locale: null }))).toEqual({ redirect: `/s/${CODE}?r=optedout&l=pt` });
  });

  it("answers posted beside it are not read, not required and not passed on", async () => {
    // A hand-made post carrying a whole answer, and one carrying half of one:
    // neither is an answer, neither is refused for its fields.
    for (const f of [form(), form({ nps: null, rating: "99" })]) {
      H.optOuts = [];
      expect(await optOut(f)).toEqual({ redirect: `/s/${CODE}?r=optedout&l=pt` });
      expect(H.optOuts).toEqual([{ code: CODE }]);
    }
    expect(H.submits).toHaveLength(0);
  });
});

describe("the opt-out: a malformed code is refused before anything is consulted", () => {
  it.each(["", "short", "ABCDEFGHI", "ABCD EFG", "survey:ABCDEFGH", "../../login"])(
    "%j: no limiter call, no database call, the generic page",
    async (code) => {
      const result = await optOut(optOutForm({ code }));
      expect(H.limiterCalls, "a malformed code must not spend limiter budget").toHaveLength(0);
      expect(H.optOuts).toHaveLength(0);
      expect(result).toEqual({ redirect: `/s/${encodeURIComponent(code)}?r=generic` });
    },
  );

  it("a missing code field is the same refusal", async () => {
    const result = await optOut(optOutForm({ code: null }));
    expect(H.limiterCalls).toHaveLength(0);
    expect(H.optOuts).toHaveLength(0);
    expect(result).toEqual({ redirect: "/s/?r=generic" });
  });
});

describe("the opt-out: the limiter", () => {
  it("is asked before the store, with the answer's own rule and key, never keyed on the code", async () => {
    await optOut(optOutForm());
    expect(H.limiterCalls).toEqual([{ key: "s-code:ip:203.0.113.7", rule: RULES.surveySubmit }]);
    expect(H.limiterCalls[0]!.key).not.toContain(CODE);
  });

  it("ONE BUDGET FOR THE PAGE: an answer and an opt-out from one address count against the same key", async () => {
    await run(form());
    await optOut(optOutForm());
    expect(H.limiterCalls).toHaveLength(2);
    expect(H.limiterCalls[1]).toEqual(H.limiterCalls[0]);
  });

  it("when it refuses, THE DATABASE IS NOT REACHED, and the refusal is the page a bad code gets", async () => {
    H.verdicts = [false];
    const limited = await optOut(optOutForm());
    expect(H.optOuts, "a limited opt-out must not do database work").toHaveLength(0);
    H.optOutStore = "refused";
    const badCode = await optOut(optOutForm());
    // CONTROL: the second one did reach the store, so the two differ in cause.
    expect(H.optOuts).toHaveLength(1);
    expect(limited).toEqual({ redirect: GENERIC });
    expect(badCode).toEqual(limited);
  });
});

describe("the opt-out: one refusal for every code that is not valid", () => {
  it("a code the door refuses goes to the generic page, the one a refused answer goes to", async () => {
    H.optOutStore = "refused";
    H.store = "refused";
    const optedOut = await optOut(optOutForm());
    const answered = await run(form());
    expect(optedOut).toEqual({ redirect: GENERIC });
    expect(optedOut).toEqual(answered);
  });

  it("a malformed, a limited and a refused opt-out are told apart by nothing but the code they echo", async () => {
    const malformed = await optOut(optOutForm({ code: "short" }));
    H.verdicts = [false];
    const limited = await optOut(optOutForm());
    H.optOutStore = "refused";
    const refused = await optOut(optOutForm());
    expect(limited).toEqual(refused);
    expect(malformed).toEqual({ redirect: GENERIC.replace(CODE, "short") });
  });
});

describe("the opt-out: a save that fails", () => {
  it("is reported as a save that failed, never as an invalid link and never as done", async () => {
    H.optOutStore = new Error(`update failed: Failing row contains (${CODE})`);
    const result = await optOut(optOutForm());
    expect(H.redirects, "a failed opt-out must not land on the opt-out page").toHaveLength(0);
    expect(result).toEqual({ state: { errors: { save: true } } });
  });

  it("logs the error's class name and never the code", async () => {
    class PostgresError extends Error {
      override name = "PostgresError";
    }
    H.optOutStore = new PostgresError(`Failing row contains (${CODE})`);
    await optOut(optOutForm());
    // CONTROL: something was logged, so the absences below are about content.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("PostgresError");
    expect(logged[0]).not.toContain(CODE);
    expect(logged[0]).not.toContain("Failing row");
  });
});

describe("the opt-out: nothing is written down", () => {
  it("no log line on any path that does not fail, and no redirect but the two known ones", async () => {
    await optOut(optOutForm());
    H.optOutStore = "refused";
    await optOut(optOutForm());
    H.verdicts = [false];
    await optOut(optOutForm());
    await optOut(optOutForm({ code: "short" }));
    expect(logged).toEqual([]);
    // CONTROL: four redirects were made.
    expect(H.redirects).toHaveLength(4);
    for (const url of H.redirects) {
      expect(url).toMatch(/^\/s\/(Ab3_dE-9|short)\?r=(optedout&l=pt|generic)$/);
    }
  });
});
