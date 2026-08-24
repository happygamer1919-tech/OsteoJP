import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-web-surface-limiter-adoption, route 6: staff document generation.
 *
 * ==========================================================================
 * WHAT CAN GO WRONG HERE IS NOT WHAT WENT WRONG ON ROUTES 1 TO 4
 * ==========================================================================
 * Those were unauthenticated, so the subject was an address and the risk was
 * ordering against a body read or a key comparison. This caller is a KNOWN
 * NAMED PRINCIPAL, and the things that can go wrong follow from that:
 *
 *   - keying on anything but the user, which either throttles a whole clinic
 *     behind one NAT (an address key) or hands an attacker a fresh budget;
 *   - ONE BUCKET FOR ALL THREE DOCUMENTS, so a therapist printing reports
 *     consumes the receptionist's declaration allowance - or, worse, three
 *     separate buckets that each allow the full ceiling, tripling it;
 *   - a refusal that is INDISTINGUISHABLE FROM A RENDER FAILURE everywhere,
 *     including in the logs, which is the section 1.3 collapse.
 */

const hit = vi.fn<(key: string, windowMs: number) => Promise<{ count: number; resetAt: Date }>>(
  async () => ({ count: 1, resetAt: new Date(Date.now() + 60_000) }),
);

// The repo's standing pattern for a `server-only` module under vitest.
vi.mock("server-only", () => ({}));

vi.mock("@osteojp/rate-limit", async (orig) => {
  const real = await orig<typeof import("@osteojp/rate-limit")>();
  return { ...real, createDurableRateLimitStore: () => ({ hit }) };
});

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const counting = (n: number) =>
  hit.mockImplementation(async () => ({ count: n, resetAt: new Date(Date.now() + 60_000) }));

describe("staff document generation is rate limited per user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counting(1);
  });

  it("allows an ordinary call and checks BOTH windows", async () => {
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    expect(await documentGenerationAllowed(USER)).toBe(true);
    expect(hit).toHaveBeenCalledTimes(2);
    const [minute, hour] = hit.mock.calls.map((c) => String(c[0]));
    expect(minute).toContain("staff_doc_gen:sub:");
    expect(hour).toContain("staff_doc_gen_hour:sub:");
  });

  it("keys on the USER ALONE - the address cannot enter the bucket", async () => {
    // An address key would throttle a whole clinic behind one NAT and would
    // hand anyone rotating addresses a fresh budget. The helper takes NO
    // headers at all, which is the strongest form of that guarantee: there is
    // no address in scope to key on even by accident.
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    await documentGenerationAllowed(USER);
    expect(hit.mock.calls.map((c) => String(c[0]))).toEqual([
      `staff_doc_gen:sub:${USER}`,
      `staff_doc_gen_hour:sub:${USER}`,
    ]);
  });

  it("gives two different staff their own budgets", async () => {
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    await documentGenerationAllowed(USER);
    const first = String(hit.mock.calls[0][0]);
    vi.clearAllMocks();
    counting(1);
    await documentGenerationAllowed(OTHER);
    expect(String(hit.mock.calls[0][0])).not.toBe(first);
  });

  it("stops at the MINUTE window without spending the hour window", async () => {
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    counting(999);
    expect(await documentGenerationAllowed(USER)).toBe(false);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(String(hit.mock.calls[0][0])).toContain("staff_doc_gen:sub:");
  });

  it("LOGS the refusal, because the screen cannot tell it from a render failure", async () => {
    // All three actions collapse every failure into { url: null }. Section 1.3
    // forbids mapping a new case onto a harmless-looking existing one with no
    // way to tell them apart, so the cases must be separable SOMEWHERE.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    counting(999);
    await documentGenerationAllowed(USER);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("rate-limit");
    warn.mockRestore();
  });

  it("does NOT put the user id in the log line", async () => {
    // The durable store already holds the bucket key, so WHO is recoverable
    // from an access-controlled place. A log line only has to establish THAT.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    counting(999);
    await documentGenerationAllowed(USER);
    expect(String(warn.mock.calls[0][0])).not.toContain(USER);
    warn.mockRestore();
  });

  it("does NOT log when the call is allowed", async () => {
    // A warning on every successful print would make the signal worthless.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { documentGenerationAllowed } = await import("./document-rate-limit");
    await documentGenerationAllowed(USER);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("the three document actions share ONE ceiling", () => {
  /**
   * SOURCE GUARDS, LABELLED AS SUCH. They prove each action is WIRED to the
   * shared helper, not that it throttles - every behavioural assertion above
   * passes just as happily with the helper called from nowhere, and "the
   * action has no ceiling" is the whole defect this card is about.
   *
   * THEY ALSO PROVE THE THREE DO NOT EACH DEFINE THEIR OWN. Three call sites
   * with three bucket scopes would allow 3x the ceiling while every test above
   * stayed green.
   */
  const read = async (rel: string) => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL(rel, import.meta.url), "utf8");
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  };

  it("the clinical report action calls the shared helper", async () => {
    const code = await read("../../app/clinical/[id]/actions.ts");
    expect(code).toContain("documentGenerationAllowed");
    expect(code).not.toContain("createDurableRateLimitStore");
  });

  it("the RGPD form action calls it too, in the same file", async () => {
    const code = await read("../../app/clinical/[id]/actions.ts");
    // Two guarded actions in one file -> the call must appear twice.
    expect(code.match(/documentGenerationAllowed\(/g)?.length).toBe(2);
  });

  it("the declaracao action calls the shared helper", async () => {
    const code = await read("../../app/patients/[id]/declaracao-actions.ts");
    expect(code).toContain("documentGenerationAllowed");
    expect(code).not.toContain("createDurableRateLimitStore");
  });

  it("the ceiling is defined in ONE place", async () => {
    const code = await read("./document-rate-limit.ts");
    expect(code).toContain("RULES.staffDocumentGeneration");
    expect(code).toContain("RULES.staffDocumentGenerationHour");
  });
});
