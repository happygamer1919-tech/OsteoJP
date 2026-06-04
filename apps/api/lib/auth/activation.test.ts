import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// activation.ts pulls in "server-only" (and the supabase admin client + db).
// Neutralise it for the node runner; we exercise the pure orchestration with
// injected deps, never the real IO.
vi.mock("server-only", () => ({}));

import {
  resolveActivationChannel,
  buildActivationMessage,
  sendPatientActivation,
  ActivationError,
  type ActivationDeps,
  type PatientForActivation,
} from "./activation";

const PATIENT: PatientForActivation = {
  id: "p-1",
  tenantId: "t-1",
  email: "maria@example.pt",
  phone: "+351912345678",
  authUserId: null,
};

// A deps double whose IO is fully observable + offline.
function fakeDeps(over: Partial<ActivationDeps> = {}): {
  deps: ActivationDeps;
  provisionAuthUser: ReturnType<typeof vi.fn>;
  generateLink: ReturnType<typeof vi.fn>;
  deliver: ReturnType<typeof vi.fn>;
} {
  const provisionAuthUser = vi.fn(async () => ({ userId: "auth-1" }));
  const generateLink = vi.fn(async () => "https://auth.example/verify#token");
  const deliver = vi.fn(async ({ channel }: { channel: string }) => ({
    channel: channel as "sms" | "email",
    sandbox: false,
    id: "sent-1",
  }));
  const deps: ActivationDeps = { provisionAuthUser, generateLink, deliver, ...over };
  return { deps, provisionAuthUser, generateLink, deliver };
}

const ENV_KEYS = ["PATIENT_ACTIVATION_CHANNEL"] as const;
let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("resolveActivationChannel", () => {
  it("defaults to SMS (owner-chosen channel)", () => {
    expect(resolveActivationChannel()).toBe("sms");
  });
  it("honours PATIENT_ACTIVATION_CHANNEL=email", () => {
    process.env.PATIENT_ACTIVATION_CHANNEL = "email";
    expect(resolveActivationChannel()).toBe("email");
  });
  it("falls back to SMS for any other value", () => {
    process.env.PATIENT_ACTIVATION_CHANNEL = "carrier-pigeon";
    expect(resolveActivationChannel()).toBe("sms");
  });
});

describe("buildActivationMessage", () => {
  it("includes the link", () => {
    const body = buildActivationMessage("pt", "https://link");
    expect(body).toContain("https://link");
  });
});

describe("sendPatientActivation", () => {
  it("provisions an auth user when not yet linked, then delivers over SMS", async () => {
    const { deps, provisionAuthUser, generateLink, deliver } = fakeDeps();
    const res = await sendPatientActivation(PATIENT, { deps });

    expect(provisionAuthUser).toHaveBeenCalledWith({
      patientId: "p-1",
      tenantId: "t-1",
      email: "maria@example.pt",
    });
    expect(generateLink).toHaveBeenCalledWith("maria@example.pt");
    // SMS delivery → recipient is the phone, never the email.
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", to: "+351912345678" }),
    );
    expect(res).toEqual({ channel: "sms", delivery: "sent" });
  });

  it("does NOT re-provision when already linked", async () => {
    const { deps, provisionAuthUser } = fakeDeps();
    await sendPatientActivation({ ...PATIENT, authUserId: "existing" }, { deps });
    expect(provisionAuthUser).not.toHaveBeenCalled();
  });

  it("reports sandbox delivery when the send is config-gated off", async () => {
    const { deps } = fakeDeps({
      deliver: vi.fn(async () => ({ channel: "sms" as const, sandbox: true, id: "sandbox:sms" })),
    });
    const res = await sendPatientActivation(PATIENT, { deps });
    expect(res.delivery).toBe("sandbox");
  });

  it("reports not_delivered when the link cannot be generated", async () => {
    const { deps, deliver } = fakeDeps({ generateLink: vi.fn(async () => null) });
    const res = await sendPatientActivation(PATIENT, { deps });
    expect(res.delivery).toBe("not_delivered");
    expect(deliver).not.toHaveBeenCalled();
  });

  it("delivers to the email when channel=email", async () => {
    const { deps, deliver } = fakeDeps();
    await sendPatientActivation(PATIENT, { deps, channel: "email" });
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "email", to: "maria@example.pt" }),
    );
  });

  it("throws missing_email when the patient has no email (recovery link needs it)", async () => {
    const { deps } = fakeDeps();
    await expect(
      sendPatientActivation({ ...PATIENT, email: null }, { deps }),
    ).rejects.toBeInstanceOf(ActivationError);
  });

  it("throws missing_phone for SMS channel when there is no phone", async () => {
    const { deps } = fakeDeps();
    await expect(
      sendPatientActivation({ ...PATIENT, phone: null }, { deps, channel: "sms" }),
    ).rejects.toMatchObject({ code: "missing_phone" });
  });
});
