/**
 * THE SERVER ACTION, END TO END: WHAT A FAILED SEND LEAVES BEHIND.
 *
 * The lib tests prove `sendMessagingCheck` returns nothing a number could ride
 * in. This drives the ACTION, which is the thing that builds the redirect, with
 * the real lib behind it and only the edges replaced: the request, the rate
 * limit store, the provider, the code store and the audit insert.
 *
 * The redirect URL is the least private place this screen writes to - browser
 * history, the platform's request logs, a link pasted into a chat - and it used
 * to carry the provider's own error text as `&d=`. Twilio writes the recipient
 * into that text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: "owner" as string,
  limitOk: true,
  /** What the provider does with the message. */
  provider: null as null | (() => never),
  sent: [] as string[],
  audits: [] as Record<string, unknown>[],
  limitChecks: 0,
}));

vi.mock("server-only", () => ({}));

// A redirect in Next throws; so does this one, carrying where it pointed.
class Redirected extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
// 203.0.113.0/24 is reserved for documentation (RFC 5737).
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: async () => ({ role: h.role, tenantId: "t", userId: "u" }),
}));
vi.mock("@osteojp/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@osteojp/rate-limit")>();
  return {
    ...actual,
    createDurableRateLimitStore: () => ({}),
    checkDurableRateLimit: async () => {
      h.limitChecks += 1;
      return { ok: h.limitOk, limit: 5, remaining: 0, retryAfterSeconds: 1 };
    },
  };
});
vi.mock("@/lib/reminders/clients", () => ({
  sendSms: async (m: { body: string }) => {
    h.sent.push(m.body);
    if (h.provider) h.provider();
    return { channel: "sms", sandbox: false, id: "SM-test-accepted" };
  },
  suppressionReasonOf: () => undefined,
}));
vi.mock("@/lib/reminders/confirm-code-store", () => ({
  issueConfirmCode: async () => null,
  withdrawConfirmCode: async () => true,
}));
vi.mock("@/lib/reminders/messaging-check-target", () => ({
  loadMessagingCheckTarget: async () => null,
}));
vi.mock("@osteojp/db", () => ({
  auditLog: {},
  getDbAdmin: () => ({
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        h.audits.push(row);
      },
    }),
  }),
}));

import { CONFIRM_CODE_SECRET_VAR, CONFIRM_LINK_FLAG } from "@/lib/reminders/confirm-code";
import { sendMessagingCheckAction } from "./actions";

/** A number in a range assigned to nobody (98x). */
const SUBSCRIBER = "987654321";
const E164 = `+351${SUBSCRIBER}`;
const TYPED_FORMS = [
  E164,
  `00351${SUBSCRIBER}`,
  "+351 987 654 321",
  "987 654 321",
  SUBSCRIBER,
  "(+351) 987-654-321",
];

function digitRuns(min = 4): string[] {
  const digits = `351${SUBSCRIBER}`;
  const runs: string[] = [];
  for (let i = 0; i + min <= digits.length; i++) runs.push(digits.slice(i, i + min));
  return runs;
}
/** Everything that could sit between two digits of a number, taken out. */
const squeeze = (value: unknown) =>
  decodeURIComponent(JSON.stringify(value)).replace(/[\s.\-()+]/g, "");
function expectNoTraceOfTheNumber(what: string, value: unknown) {
  const haystack = squeeze(value);
  for (const run of digitRuns()) {
    expect(haystack.includes(run), `${what} carries the digits ${run}`).toBe(false);
  }
}

/** Run the action and hand back where it redirected. */
async function submit(fields: Record<string, string>): Promise<string> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  try {
    await sendMessagingCheckAction(form);
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error("the action returned without redirecting");
}

const saved = { ...process.env };
let logged: unknown[][] = [];

beforeEach(() => {
  h.role = "owner";
  h.limitOk = true;
  h.provider = null;
  h.sent.length = 0;
  h.audits.length = 0;
  h.limitChecks = 0;
  for (const k of ["REMINDERS_REPLY_CAPABLE", "TWILIO_MESSAGING_SERVICE_SID"]) delete process.env[k];
  process.env[CONFIRM_LINK_FLAG] = "true";
  process.env[CONFIRM_CODE_SECRET_VAR] = "messaging-check-action-test-secret";
  // `.invalid` is reserved (RFC 2606): no test names a host that could answer.
  process.env.REMINDERS_RESCHEDULE_BASE_URL = "https://app.x.invalid";
  process.env.TWILIO_SMS_FROM = "OsteoJP";
  logged = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  }
});

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("a provider error: what reaches the URL, the audit row and the logs", () => {
  for (const typed of TYPED_FORMS) {
    it(`typed as "${typed}": the redirect is markers only, and nothing holds the number`, async () => {
      h.provider = () => {
        throw Object.assign(
          new Error(`The 'To' number ${typed} (sent as ${E164}) is not a valid mobile number`),
          { code: 21614, status: 400 },
        );
      };

      const url = await submit({ phone: typed });

      // The whole address. A reason from the closed list and a provider code.
      expect(url).toBe("/admin/messaging-check?m=send_failed&c=21614");
      expect(h.sent).toHaveLength(1);
      expect(h.audits).toHaveLength(1);

      expectNoTraceOfTheNumber("the redirect URL", url);
      expectNoTraceOfTheNumber("the audit row", h.audits[0]);
      expectNoTraceOfTheNumber("a log call", logged);
      expect(JSON.stringify([url, h.audits, logged])).not.toContain("mobile number");
    });
  }

  it("the URL never has a free-text parameter, whatever the provider throws", async () => {
    const thrown: unknown[] = [
      new Error(`plain error naming ${E164}`),
      Object.assign(new Error(`no code ${E164}`), { status: 503 }),
      Object.assign(new Error(`code is prose ${E164}`), { code: `bad ${E164}` }),
      Object.assign(new Error(`code is the number`), { code: Number(SUBSCRIBER) }),
      `a thrown string ${E164}`,
      { message: `a thrown object ${E164}`, moreInfo: `see ${E164}` },
    ];
    for (const value of thrown) {
      h.provider = () => {
        throw value;
      };
      const url = await submit({ phone: E164 });
      expect(url).toBe("/admin/messaging-check?m=send_failed");
      expectNoTraceOfTheNumber("the redirect URL", url);
    }
    expectNoTraceOfTheNumber("the audit rows", h.audits);
    expectNoTraceOfTheNumber("the log calls", logged);
  });

  it("every parameter the action can put on the URL is from a closed set", async () => {
    // One of each outcome the action can produce here, and the only keys seen.
    const urls: string[] = [];
    urls.push(await submit({ phone: E164 })); // sent
    urls.push(await submit({ phone: "not a number" }));
    urls.push(await submit({ phone: "+351210000000" })); // a landline
    urls.push(await submit({ phone: E164, appointmentId: "not-an-id" }));
    h.provider = () => {
      throw Object.assign(new Error("x"), { code: 21211 });
    };
    urls.push(await submit({ phone: E164 }));
    h.limitOk = false;
    urls.push(await submit({ phone: E164 }));

    expect(urls).toEqual([
      expect.stringMatching(/^\/admin\/messaging-check\?m=sent&len=\d+&live=0$/),
      "/admin/messaging-check?m=invalid_phone",
      "/admin/messaging-check?m=landline",
      "/admin/messaging-check?m=invalid_appointment",
      "/admin/messaging-check?m=send_failed&c=21211",
      "/admin/messaging-check?m=limited",
    ]);
    for (const url of urls) {
      const keys = [...new URL(url, "https://x.invalid").searchParams.keys()];
      for (const key of keys) expect(["m", "len", "live", "c", "w"]).toContain(key);
      expect(url).not.toContain("d=");
    }
  });
});

describe("the gates in front of the send are where they were", () => {
  it("anybody but the owner is sent away before the limit is touched or anything is sent", async () => {
    for (const role of ["admin", "reception", "therapist"]) {
      h.role = role;
      expect(await submit({ phone: E164 })).toBe("/dashboard");
    }
    expect(h.limitChecks).toBe(0);
    expect(h.sent).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it("a refused limit sends nothing", async () => {
    h.limitOk = false;
    expect(await submit({ phone: E164 })).toBe("/admin/messaging-check?m=limited");
    expect(h.limitChecks).toBe(1);
    expect(h.sent).toEqual([]);
  });
});
