/**
 * The signing script must produce tokens the REAL verifier accepts.
 *
 * apps/web/scripts/sign-reminder-token.mjs reimplements the wire format, because
 * a .mjs script cannot import this TypeScript module without a build step and
 * adding one for a two-field payload is not worth it. The cost of that choice is
 * DRIFT: the script could go on signing a format the server stopped accepting,
 * and nobody would find out until the owner clicked a dead link on a deployed
 * URL — which is exactly the kind of discovery this project keeps trying to move
 * earlier.
 *
 * So this test pins them together. It builds a token the way the script does and
 * verifies it with `verifyRescheduleToken`. If the payload shape, the field
 * names, the encoding or the HMAC ever change, this goes red first.
 */
import { createHmac } from "node:crypto";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { verifyRescheduleToken } from "./link-token";

const SECRET = "test-secret-not-a-real-one";
const TENANT = "11111111-1111-1111-1111-111111111111";
const APPT = "22222222-2222-2222-2222-222222222222";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.REMINDERS_LINK_SECRET;
  process.env.REMINDERS_LINK_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.REMINDERS_LINK_SECRET;
  else process.env.REMINDERS_LINK_SECRET = saved;
});

/** Byte-for-byte what the script does. Kept in one place so a fix is one edit. */
function signLikeTheScript(scope: "confirm" | "confirm_cancel", exp: number): string {
  const wire = { t: TENANT, a: APPT, exp, s: scope };
  const payloadB64 = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

describe("sign-reminder-token.mjs parity with the real verifier", () => {
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;

  it.each(["confirm", "confirm_cancel"] as const)(
    "a %s token from the script verifies, with its scope intact",
    (scope) => {
      const payload = verifyRescheduleToken(signLikeTheScript(scope, exp));
      expect(payload).not.toBeNull();
      expect(payload).toMatchObject({ tenantId: TENANT, appointmentId: APPT, scope });
    },
  );

  it("an expired script token is refused, so the 30-minute window is real", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(verifyRescheduleToken(signLikeTheScript("confirm_cancel", past))).toBeNull();
  });

  it("a script token signed with the wrong secret is refused", () => {
    // Proves the parity above comes from a real signature check, not from the
    // verifier being permissive about anything shaped like a token.
    const wire = { t: TENANT, a: APPT, exp, s: "confirm_cancel" };
    const b64 = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url");
    const wrong = `${b64}.${createHmac("sha256", "other-secret").update(b64).digest("base64url")}`;
    expect(verifyRescheduleToken(wrong)).toBeNull();
  });
});
