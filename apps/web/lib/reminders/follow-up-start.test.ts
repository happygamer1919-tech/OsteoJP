/**
 * follow-up-start.test.ts - R37 (R26 CUT): the 24 hour run after a concluded
 * visit starts only when a message can result.
 *
 * Strategy's ruling, verbatim: "send-follow-up-notification starts only when a
 * message can result: survey off: not started; canary: only the canary patient
 * ids; on: every completed visit. The mode is read when the visit is
 * completed."
 *
 * This file holds the decision (`followUpRunCanResult`) and the one sender
 * (`enqueueFollowUp`), with `inngest.send` captured. The two doors that reach
 * the sender (the Estado save and "Corrigir estado") are
 * lib/scheduling/follow-up-start.test.ts; a run waking under either order of
 * the SAT-01 canary is ./follow-up-start-orders.test.ts.
 *
 * Ids are invented.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRegistry, type TemplateEntry } from "@osteojp/notify";

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
}));

vi.mock("@/lib/reminders/inngest/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reminders/inngest/client")>(
    "@/lib/reminders/inngest/client",
  );
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
    },
  };
});

import { FOLLOW_UP_TEMPLATES, followUpMessageApproved, followUpRunCanResult } from "./follow-up-start";
import { enqueueFollowUp } from "./index";
import { WEB_TEMPLATES, webRegistry } from "./notification-registry";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const LISTED = "33333333-3333-4333-8333-333333333333";
const UNLISTED = "44444444-4444-4444-8444-444444444444";
const ENDS_AT = new Date("2031-05-14T14:15:00.000Z");

/** The switch as one deployment would hold it. The list names LISTED only. */
const envFor = (mode: string | undefined) => ({
  ...(mode === undefined ? {} : { SURVEY_SEND_MODE: mode }),
  SURVEY_CANARY_PATIENT_IDS: LISTED,
});

/** The production registry with ONE follow-up body approved, as JP might one day. */
const approvedFollowUp = (id: "follow_up.email" | "follow_up.sms") =>
  buildRegistry(
    WEB_TEMPLATES.map(
      (e): TemplateEntry =>
        e.id === id ? { ...e, approved: true, approvedBy: "TEST", approvedAt: "2031-01-01" } : e,
    ),
  );

beforeEach(() => {
  h.sent.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ------------------------------ the decision ------------------------------ */

describe("followUpRunCanResult, with the follow-up unapproved (the registry today)", () => {
  // [mode, patient, surveyOnly, starts]. Every value that reads `off` is one
  // row each, so a typo in the switch can never start a run.
  const TABLE: [string | undefined, string, boolean, boolean][] = [
    [undefined, LISTED, false, false],
    ["off", LISTED, false, false],
    ["ON", LISTED, false, false],
    ["on ", LISTED, false, false],
    ["Canary", LISTED, false, false],
    [undefined, LISTED, true, false],
    ["off", LISTED, true, false],
    ["canary", LISTED, false, true],
    ["canary", LISTED, true, true],
    ["canary", UNLISTED, false, false],
    ["canary", UNLISTED, true, false],
    ["on", LISTED, false, true],
    ["on", UNLISTED, false, true],
    ["on", UNLISTED, true, true],
  ];

  it.each(TABLE)("SURVEY_SEND_MODE=%j, patient %s, surveyOnly %s: starts %s", (mode, patientId, surveyOnly, starts) => {
    expect(followUpRunCanResult({ patientId, surveyOnly }, envFor(mode))).toBe(starts);
  });

  it("a patient that could not be read: on still starts (it names nobody), canary does not", () => {
    expect(followUpRunCanResult({ patientId: null, surveyOnly: false }, envFor("on"))).toBe(true);
    expect(followUpRunCanResult({ patientId: null, surveyOnly: false }, envFor("canary"))).toBe(false);
    expect(followUpRunCanResult({ patientId: null, surveyOnly: false }, envFor("off"))).toBe(false);
  });

  it("the canary list is the dispatch's own: case and spaces in the stored list are read the same way", () => {
    const env = { SURVEY_SEND_MODE: "canary", SURVEY_CANARY_PATIENT_IDS: ` ${LISTED.toUpperCase()} ,junk` };
    expect(followUpRunCanResult({ patientId: LISTED, surveyOnly: false }, env)).toBe(true);
    expect(followUpRunCanResult({ patientId: UNLISTED, surveyOnly: false }, env)).toBe(false);
  });
});

describe("followUpRunCanResult, the day a follow-up body is approved: off must not suppress it", () => {
  it.each(["follow_up.email", "follow_up.sms"] as const)("%s approved: off starts, canary unlisted starts", (id) => {
    const registry = approvedFollowUp(id);
    expect(followUpMessageApproved(registry)).toBe(true);
    // Off and an unlisted canary patient wake into `dispatchFollowUp`.
    expect(followUpRunCanResult({ patientId: LISTED, surveyOnly: false }, envFor(undefined), registry)).toBe(true);
    expect(followUpRunCanResult({ patientId: LISTED, surveyOnly: false }, envFor("off"), registry)).toBe(true);
    expect(followUpRunCanResult({ patientId: UNLISTED, surveyOnly: false }, envFor("canary"), registry)).toBe(true);
    expect(followUpRunCanResult({ patientId: null, surveyOnly: false }, envFor("canary"), registry)).toBe(true);
  });

  it("approved or not, a correction's run (surveyOnly) never sends the follow-up, so it starts only for a survey", () => {
    const registry = approvedFollowUp("follow_up.email");
    expect(followUpRunCanResult({ patientId: LISTED, surveyOnly: true }, envFor("off"), registry)).toBe(false);
    expect(followUpRunCanResult({ patientId: UNLISTED, surveyOnly: true }, envFor("canary"), registry)).toBe(false);
    expect(followUpRunCanResult({ patientId: LISTED, surveyOnly: true }, envFor("canary"), registry)).toBe(true);
  });

  it("an approval for the WRONG channel approves nothing (resolveApproved matches id and channel)", () => {
    const wrong = buildRegistry(
      WEB_TEMPLATES.map(
        (e): TemplateEntry =>
          e.id === "follow_up.email"
            ? { ...e, channel: "sms", approved: true, approvedBy: "TEST", approvedAt: "2031-01-01" }
            : e,
      ),
    );
    expect(followUpMessageApproved(wrong)).toBe(false);
  });
});

describe("the follow-up approval is read from the registry, not assumed", () => {
  it("today both follow-up bodies are unapproved in the production registry", () => {
    // A STATE, not a rule: when JP approves a body this arm is updated, and the
    // arms above already show the cut then lets the run start.
    expect(followUpMessageApproved(webRegistry)).toBe(false);
  });

  it("the two ids are registered against appointment/completed, on the channel this module asks", () => {
    for (const t of FOLLOW_UP_TEMPLATES) {
      const entry = webRegistry.get(t.id);
      expect(entry, t.id).toBeDefined();
      expect(entry?.channel).toBe(t.channel);
      expect(entry?.triggerEvent).toBe("appointment/completed");
    }
  });

  it("they are the ids `dispatchFollowUp` sends under, so a rename there cannot slip past this module", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "dispatch.ts"), "utf8");
    const start = src.indexOf("export async function dispatchFollowUp(");
    const end = src.indexOf("\n}\n", start);
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, end);
    expect([...body.matchAll(/templateId: "([^"]+)"/g)].map((m) => m[1])).toEqual(
      FOLLOW_UP_TEMPLATES.map((t) => t.id),
    );
  });
});

/* ------------------------------ the sender ------------------------------ */

describe("enqueueFollowUp sends appointment/completed exactly where a message can result", () => {
  const send = (patientId: string | null, surveyOnly?: boolean) =>
    enqueueFollowUp({
      appointmentId: APPT,
      tenantId: TENANT,
      endsAt: ENDS_AT,
      patientId,
      ...(surveyOnly ? { surveyOnly } : {}),
    });

  it("off: nothing is sent, for a completion or a correction, listed or not", async () => {
    vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", LISTED);
    for (const mode of [undefined, "off", "ON"]) {
      if (mode === undefined) vi.stubEnv("SURVEY_SEND_MODE", undefined);
      else vi.stubEnv("SURVEY_SEND_MODE", mode);
      expect(await send(LISTED)).toBe(false);
      expect(await send(LISTED, true)).toBe(false);
    }
    expect(h.sent).toEqual([]);
  });

  it("canary: the listed patient's completion and correction are sent; the unlisted patient's are not", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "canary");
    vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", LISTED);
    expect(await send(UNLISTED)).toBe(false);
    expect(await send(UNLISTED, true)).toBe(false);
    expect(await send(LISTED)).toBe(true);
    expect(await send(LISTED, true)).toBe(true);
    expect(h.sent.map((e) => [e.name, e.data.surveyOnly])).toEqual([
      ["appointment/completed", undefined],
      ["appointment/completed", true],
    ]);
  });

  it("on: every completion and every correction is sent, with the payload it always had (no patient id on it)", async () => {
    vi.stubEnv("SURVEY_SEND_MODE", "on");
    vi.stubEnv("SURVEY_CANARY_PATIENT_IDS", "");
    expect(await send(UNLISTED)).toBe(true);
    expect(await send(LISTED, true)).toBe(true);
    expect(h.sent).toEqual([
      {
        name: "appointment/completed",
        data: { appointmentId: APPT, tenantId: TENANT, endsAt: ENDS_AT.toISOString() },
      },
      {
        name: "appointment/completed",
        data: { appointmentId: APPT, tenantId: TENANT, endsAt: ENDS_AT.toISOString(), surveyOnly: true },
      },
    ]);
  });
});
