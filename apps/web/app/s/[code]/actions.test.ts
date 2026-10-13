/**
 * actions.test.ts: SAT-01. The answer POST behind /s/<code>, in the order the
 * spec gives it (5.2, 9.3): the code's shape, then the limiter, then the
 * fields, then the door.
 *
 * THE ASSERTION THAT MATTERS IS WHAT WAS REACHED, not only where the action
 * redirected: a limiter consulted after the write would redirect just the same.
 * So every case counts the limiter's calls and the store's calls.
 *
 * AND THE REFUSALS ARE ONE: a limited submit, a refused one and a malformed
 * code all go to the page an invalid link gets. A distinguishable "too many
 * attempts" would be a new signal on a surface built to emit none.
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
}));

import { CURRENT_SURVEY_CONSENT_VERSION } from "@osteojp/i18n";
import { RULES } from "@osteojp/rate-limit";
import { EMPTY_SURVEY_FORM_STATE, type SurveyFormState } from "@/lib/surveys/survey-form";
import { submitSurveyAction } from "./actions";

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

const GENERIC = `/s/${CODE}?r=generic`;

let logged: string[];
let spies: Array<{ mockRestore(): void }>;

beforeEach(() => {
  H.verdicts = [];
  H.limiterCalls = [];
  H.submits = [];
  H.store = "recorded";
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

  it("is counted by the limiter, which is asked first", async () => {
    await run(form({ nps: null }));
    expect(H.limiterCalls).toHaveLength(1);
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
