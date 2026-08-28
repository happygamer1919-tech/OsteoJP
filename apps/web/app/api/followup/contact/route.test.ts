import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ==========================================================================
 * STRATEGY RULING SR-06, CLOSED HERE: EVERY FAILURE LEAVES A SERVER TRACE.
 * ==========================================================================
 * "A write path whose failure UI can be destroyed by navigation must be
 * observable on the server. Client-side alerting is NOT sufficient evidence of
 * loudness when the document may not survive the request."
 *
 * The route handler is the only witness that survives on two of the three
 * channels - `sms:` and `mailto:` carry no `target`, so they navigate the
 * CURRENT document and can tear down the React state holding the alert.
 *
 * EVERY ASSERTION HERE DRIVES THE REAL HANDLER. Nothing matches source text:
 * the module is imported, POST is called with a real Request, and the Sentry
 * module is the seam - because "was an event captured" is a fact about a call
 * that leaves this process, and there is no other honest way to observe it.
 */

// `@/lib/followup/scope` is server-only and this file imports its error type.
vi.mock("server-only", () => ({}));

const captureException = vi.fn();
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
  captureMessage: (...a: unknown[]) => captureMessage(...a),
}));

const getRequestContext = vi.fn();
vi.mock("@/lib/auth/context", () => ({
  getRequestContext: () => getRequestContext(),
}));

const recordFollowupContactFor = vi.fn();
vi.mock("@/lib/followup/record-contact", () => ({
  recordFollowupContactFor: (...a: unknown[]) => recordFollowupContactFor(...a),
}));

const { POST } = await import("./route");
const { FollowupScopeError } = await import("@/lib/followup/scope");
const { ForbiddenError } = await import("@osteojp/auth");

const CTX = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  role: "reception" as const,
  userId: "22222222-2222-2222-2222-222222222222",
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/followup/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const GOOD = { patientId: "33333333-3333-3333-3333-333333333333", channel: "whatsapp" };

/** Every capture, whichever function made it, with its tags. */
const captures = () =>
  [...captureException.mock.calls, ...captureMessage.mock.calls].map((c) => ({
    arg: c[0],
    opts: c[1] as { level?: string; tags?: Record<string, string> } | undefined,
  }));

beforeEach(() => {
  captureException.mockReset();
  captureMessage.mockReset();
  getRequestContext.mockReset().mockResolvedValue(CTX);
  recordFollowupContactFor.mockReset().mockResolvedValue(undefined);
});

describe("a FAILING INSERT produces a captured event", () => {
  it("captures the exception and answers 500", async () => {
    // THE ASSERTION THE RULING ASKS FOR, in the shape that actually happens: the
    // database refuses, `recordFollowupContactFor` throws, and the only witness
    // left is this handler.
    const boom = new Error("insert or update on table violates foreign key");
    recordFollowupContactFor.mockRejectedValue(boom);

    const res = await post(GOOD);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, code: "server_error" });

    expect(captureException).toHaveBeenCalledTimes(1);
    // THE REAL ERROR, not a re-wrapped string. A capture that lost the cause
    // would put an untraceable message in the tracker.
    expect(captureException.mock.calls[0]?.[0]).toBe(boom);
    const opts = captureException.mock.calls[0]?.[1] as { level: string; tags: Record<string, string> };
    expect(opts.level).toBe("error");
    expect(opts.tags.code).toBe("server_error");
    expect(opts.tags.route).toBe("followup.contact");
  });

  it("a SUCCESS captures nothing - the negative arm", () => {
    // Without this, a handler that captured on every request would pass every
    // test above and make the channel useless.
    return post(GOOD).then(async (res) => {
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
      expect(captures()).toHaveLength(0);
    });
  });
});

describe("EVERY failure branch leaves a trace, including the 401", () => {
  it("401 unauthenticated - the branch SR-06 names", async () => {
    // It looks least like an error and is where a contact is most certainly
    // lost: the write did not happen and the receptionist has already left for
    // WhatsApp.
    getRequestContext.mockResolvedValue(null);
    const res = await post(GOOD);
    expect(res.status).toBe(401);
    expect(captures()).toHaveLength(1);
    expect(captures()[0]?.opts?.tags?.code).toBe("unauthenticated");
    expect(captures()[0]?.opts?.level).toBe("warning");
  });

  it("400 on an unparseable body", async () => {
    const res = await POST(
      new Request("http://localhost/api/followup/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(captures()).toHaveLength(1);
    expect(captures()[0]?.opts?.tags?.code).toBe("bad_request");
  });

  it("400 on a missing patientId", async () => {
    const res = await post({ channel: "whatsapp" });
    expect(res.status).toBe(400);
    expect(captures()).toHaveLength(1);
  });

  it("404 when the patient is outside this viewer's scope", async () => {
    recordFollowupContactFor.mockRejectedValue(new FollowupScopeError());
    const res = await post(GOOD);
    expect(res.status).toBe(404);
    expect(captures()).toHaveLength(1);
    expect(captures()[0]?.opts?.tags?.code).toBe("not_found");
    // A refusal is the system working. Levelling it with a 500 would make the
    // 500s unfindable in a list of expired sessions.
    expect(captures()[0]?.opts?.level).toBe("warning");
  });

  it("403 when the role lacks the capability", async () => {
    recordFollowupContactFor.mockRejectedValue(new ForbiddenError("reception", "followup:read"));
    const res = await post(GOOD);
    expect(res.status).toBe(403);
    expect(captures()).toHaveLength(1);
    expect(captures()[0]?.opts?.tags?.code).toBe("forbidden");
  });

  it("NO branch answers a failure without capturing - the whole ruling in one test", async () => {
    // Drives every failure the handler can produce and counts. A branch added
    // later that returns a bare NextResponse fails HERE, which is why `fail()`
    // is the only way to answer a failure from this route.
    const arms: Array<[string, () => void]> = [
      ["401", () => getRequestContext.mockResolvedValue(null)],
      ["404", () => recordFollowupContactFor.mockRejectedValue(new FollowupScopeError())],
      ["403", () => recordFollowupContactFor.mockRejectedValue(new ForbiddenError("reception", "followup:read"))],
      ["500", () => recordFollowupContactFor.mockRejectedValue(new Error("boom"))],
    ];
    for (const [name, arrange] of arms) {
      captureException.mockReset();
      captureMessage.mockReset();
      getRequestContext.mockResolvedValue(CTX);
      recordFollowupContactFor.mockResolvedValue(undefined);
      arrange();
      const res = await post(GOOD);
      expect(res.ok, `${name} answered 2xx`).toBe(false);
      expect(captures().length, `${name} answered without capturing`).toBe(1);
    }
  });
});

describe("the capture carries no PII - rule 7", () => {
  it("never tags the patient id", async () => {
    recordFollowupContactFor.mockRejectedValue(new Error("boom"));
    await post(GOOD);
    const tags = captureException.mock.calls[0]?.[1] as { tags: Record<string, string> };
    const values = Object.values(tags.tags).join(" ");
    expect(values).not.toContain(GOOD.patientId);
    expect(values).not.toContain(CTX.userId);
    expect(Object.keys(tags.tags)).not.toContain("patientId");
  });

  it("DOES tag the channel and the role, which are not PII and are what triage needs", async () => {
    // The positive arm: a capture with no context at all is a count, not a
    // report. channel is one of three enum values; role is one of four.
    recordFollowupContactFor.mockRejectedValue(new Error("boom"));
    await post({ ...GOOD, channel: "sms" });
    const tags = (captureException.mock.calls[0]?.[1] as { tags: Record<string, string> }).tags;
    expect(tags.channel).toBe("sms");
    expect(tags.role).toBe("reception");
  });
});
