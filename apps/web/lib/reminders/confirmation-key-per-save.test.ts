/**
 * confirmation-key-per-save.test.ts - Q-N: THE CONFIRMATION'S DUPLICATE KEY IS
 * THE APPOINTMENT AND THE SAVE.
 *
 * Strategy's ruling of 2026-10-22: "Q-N a: per-save marker in the key, Tier B,
 * owner Resync after merge. A retried delivery of the same save must still
 * dedupe: prove it with a test."
 *
 * What this file holds, next to confirmation-resend-rule.test.ts (which drives
 * the two server actions through A to B to A and the retried delivery):
 *   1. EVERY EMITTER carries the marker. By source: the only sender of
 *      appointment/scheduled is lib/reminders/index.ts, its only caller is
 *      `enqueueRemindersAfterCommit`, and the functions that call that are
 *      the listed doors. By behaviour: the target each door builds comes out
 *      as an event with a fresh uuid `saveId`.
 *   2. AN EVENT WITHOUT A MARKER (the two owner-run scripts) never starts a
 *      confirmation run, and if it did, its key could not equal an
 *      application key.
 *
 * Modelled: Inngest's trigger filter and duplicate key, as in the two files
 * named above. Ids are invented.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  sent: [] as { name: string; data: Record<string, unknown> }[],
}));

vi.mock("./inngest/client", async () => {
  const actual = await vi.importActual<typeof import("./inngest/client")>("./inngest/client");
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      send: vi.fn(async (e: { name: string; data: Record<string, unknown> }) => {
        h.sent.push(e);
      }),
      createFunction: actual.inngest.createFunction.bind(actual.inngest),
    },
  };
});

import { enqueueRemindersAfterCommit, type ReminderEnqueueTarget } from "@/lib/scheduling/reminders";
import { acceptedPedidoTarget } from "@/lib/scheduling/pedido-acceptance";
import { acceptedGuestRequestTarget } from "@/lib/scheduling/guest-link";
import { CONFIRMATION_IDEMPOTENCY_KEY, CONFIRMATION_TRIGGER_FILTER } from "./inngest/functions";

const TENANT = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const APPT_2 = "33333333-3333-4333-8333-333333333333";
const APPT_3 = "44444444-4444-4444-8444-444444444444";
const PRAC = "55555555-5555-4555-8555-555555555555";
const T1 = new Date("2031-05-14T10:00:00.000Z");
const T2 = new Date("2031-05-21T10:00:00.000Z");
const T3 = new Date("2031-05-28T10:00:00.000Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  h.sent.length = 0;
});

/**
 * Evaluate a `+` chain of `event.data.<field>` reads and quoted literals. An
 * absent field reads as `absent`, so an arm can try each thing Inngest might
 * make of it.
 */
function evaluateKey(expression: string, data: Record<string, unknown>, absent = "undefined"): string {
  return expression
    .split("+")
    .map((part) => part.trim())
    .map((part) => {
      const field = /^event\.data\.([A-Za-z]+)$/.exec(part);
      if (field) return field[1]! in data ? String(data[field[1]!]) : absent;
      const literal = /^"([^"]*)"$/.exec(part) ?? /^'([^']*)'$/.exec(part);
      if (literal) return literal[1]!;
      throw new Error(`cannot evaluate idempotency key part ${JSON.stringify(part)}`);
    })
    .join("");
}

/** The trigger filter, then the key, inside one 24 hour window. */
function deliver(events: { name: string; data: Record<string, unknown> }[]) {
  expect(CONFIRMATION_TRIGGER_FILTER).toBe("event.data.confirmationEligible == true");
  const seen = new Set<string>();
  const runs: Record<string, unknown>[] = [];
  const dropped: string[] = [];
  for (const e of events) {
    if (e.name !== "appointment/scheduled" || e.data.confirmationEligible !== true) continue;
    const k = evaluateKey(CONFIRMATION_IDEMPOTENCY_KEY, e.data);
    if (seen.has(k)) dropped.push(k);
    else {
      seen.add(k);
      runs.push(e.data);
    }
  }
  return { runs, dropped };
}

/* ------------------------- 1. by behaviour ------------------------- */

/** The target each door builds, as its source builds it (see the source arms below). */
const DOORS: [string, ReminderEnqueueTarget[]][] = [
  ["createAppointment (one visit)", [{ appointmentId: APPT, startsAt: T1, practitionerId: PRAC }]],
  [
    "createAppointment / batchScheduleAppointments (a series)",
    [
      { appointmentId: APPT, startsAt: T1, practitionerId: PRAC },
      { appointmentId: APPT_2, startsAt: T2, practitionerId: PRAC },
      { appointmentId: APPT_3, startsAt: T3, practitionerId: PRAC },
    ],
  ],
  ["cloneAppointment", [{ appointmentId: APPT, startsAt: T1, practitionerId: PRAC }]],
  ["the four acceptance doors (acceptedPedidoTarget)", [acceptedPedidoTarget(APPT, T1, PRAC)]],
  ["the guest link (acceptedGuestRequestTarget)", [acceptedGuestRequestTarget(APPT, T1, PRAC)]],
  ["the uncancel (updateAppointment, back to Confirmada)", [{ appointmentId: APPT, startsAt: T1, practitionerId: PRAC, status: "confirmed" }]],
  ["rescheduleAppointment (a new start)", [{ appointmentId: APPT, startsAt: T2, practitionerId: PRAC, status: "confirmed" }]],
  [
    "rescheduleAppointment (the Terapeuta only)",
    [{ appointmentId: APPT, startsAt: T1, practitionerId: PRAC, status: "confirmed", confirmation: "therapist_only" }],
  ],
];

describe("every door's confirmation-eligible event carries a fresh save marker", () => {
  it.each(DOORS)("%s", async (_door, targets) => {
    await enqueueRemindersAfterCommit(TENANT, targets);
    expect(h.sent).toHaveLength(targets.length);
    const eligible = h.sent.filter((e) => e.data.confirmationEligible === true);
    expect(eligible).toHaveLength(1);
    const marker = eligible[0]!.data.saveId;
    expect(marker).toMatch(UUID);
    // One save, one marker, on every event it emits.
    expect(h.sent.every((e) => e.data.saveId === marker)).toBe(true);
    expect(evaluateKey(CONFIRMATION_IDEMPOTENCY_KEY, eligible[0]!.data)).toBe(
      `${String(eligible[0]!.data.appointmentId)}:confirmation:${String(marker)}`,
    );
  });

  it.each(DOORS)("%s, saved twice: two runs; one event delivered twice: one run", async (_door, targets) => {
    await enqueueRemindersAfterCommit(TENANT, targets);
    await enqueueRemindersAfterCommit(TENANT, targets);
    const twoSaves = deliver(h.sent);
    expect(twoSaves.dropped).toEqual([]);
    expect(twoSaves.runs).toHaveLength(2);

    const once = h.sent.find((e) => e.data.confirmationEligible === true)!;
    const redelivered = deliver([once, once]);
    expect(redelivered.runs).toHaveLength(1);
    expect(redelivered.dropped).toHaveLength(1);
  });

  it("a save that owes no confirmation (`none`) starts no run, marker or not", async () => {
    await enqueueRemindersAfterCommit(TENANT, [
      { appointmentId: APPT, startsAt: T1, practitionerId: PRAC, status: "confirmed", confirmation: "none" },
    ]);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.data.saveId).toMatch(UUID);
    expect(deliver(h.sent).runs).toEqual([]);
  });
});

/* ------------------------- 1. by source ------------------------- */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Non-test .ts/.tsx files under `dir`, as paths from the repository root, comments removed. */
function sources(dir: string): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "e2e") continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push({ file: full.slice(REPO.length + 1), src: strip(readFileSync(full, "utf8")) });
      }
    }
  };
  walk(dir);
  return out;
}

const APP_SOURCES = [
  ...sources(join(WEB, "lib")),
  ...sources(join(WEB, "app")),
  ...sources(join(REPO, "apps", "api", "app")),
  ...sources(join(REPO, "apps", "api", "lib")),
];

/** The names of the top-level `export async function`s of `src` whose body contains `needle`. */
function functionsCalling(src: string, needle: string): string[] {
  const lines = src.split("\n");
  const names: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^export\s+async\s+function\s+(\w+)/.exec(lines[i]!);
    if (!m) continue;
    const end = lines.findIndex((l, j) => j > i && l === "}");
    if (lines.slice(i + 1, end).join("\n").includes(needle)) names.push(m[1]!);
  }
  return names;
}

describe("every emitter of appointment/scheduled goes through the one that makes the marker", () => {
  it("the extractor reads real files", () => {
    expect(APP_SOURCES.length).toBeGreaterThan(100);
    expect(APP_SOURCES.some((s) => s.file === "apps/web/lib/scheduling/actions.ts")).toBe(true);
    expect(APP_SOURCES.some((s) => s.file.startsWith("apps/api/"))).toBe(true);
  });

  it("only lib/reminders/index.ts sends the event, and it writes the marker", () => {
    const senders = APP_SOURCES.filter((s) => /\bEVENT_APPOINTMENT_SCHEDULED\b/.test(s.src)).map((s) => s.file);
    expect(senders.sort()).toEqual([
      "apps/web/lib/reminders/index.ts",
      "apps/web/lib/reminders/inngest/client.ts",
      "apps/web/lib/reminders/inngest/functions.ts",
    ]);
    // The literal appears only where the constant is defined, and in the
    // notification registry, which lists events and sends nothing.
    const literal = APP_SOURCES.filter((s) => s.src.includes('"appointment/scheduled"')).map((s) => s.file);
    expect(literal.sort()).toEqual([
      "apps/web/lib/reminders/inngest/client.ts",
      "apps/web/lib/reminders/notification-registry.ts",
    ]);
    const index = APP_SOURCES.find((s) => s.file === "apps/web/lib/reminders/index.ts")!.src;
    expect(index).toContain("saveId: args.saveId,");
    expect(index).toMatch(/saveId: string;/);
  });

  it("apps/api sends no Inngest event at all", () => {
    const api = APP_SOURCES.filter((s) => s.file.startsWith("apps/api/"));
    expect(api.filter((s) => /from\s+"inngest"|appointment\/scheduled/.test(s.src)).map((s) => s.file)).toEqual([]);
  });

  it("only enqueueRemindersAfterCommit calls the sender, and it makes the marker once per call", () => {
    const callers = APP_SOURCES.filter((s) => /\benqueueAppointmentReminders\(/.test(s.src)).map((s) => s.file);
    // index.ts holds the definition; reminders.ts is the one caller.
    expect(callers.sort()).toEqual(["apps/web/lib/reminders/index.ts", "apps/web/lib/scheduling/reminders.ts"]);
    const bridge = APP_SOURCES.find((s) => s.file === "apps/web/lib/scheduling/reminders.ts")!.src;
    expect(bridge).toContain("const saveId = randomUUID();");
    expect((bridge.match(/randomUUID\(\)/g) ?? []).length).toBe(1);
  });

  it("the doors that call it are the listed ones: a new door fails this arm until it is listed", () => {
    const files = APP_SOURCES.filter((s) => /\benqueueRemindersAfterCommit\(/.test(s.src)).map((s) => s.file);
    expect(files.sort()).toEqual([
      "apps/web/lib/scheduling/actions.ts",
      "apps/web/lib/scheduling/pedido-acceptance.ts",
      "apps/web/lib/scheduling/reminders.ts",
    ]);
    const actions = APP_SOURCES.find((s) => s.file === "apps/web/lib/scheduling/actions.ts")!.src;
    expect(functionsCalling(actions, "enqueueRemindersAfterCommit(").sort()).toEqual([
      // create (and the guest link), batch (and the guest link), clone,
      // the acceptance and the uncancel, the move, the Pedidos acceptance.
      "batchScheduleAppointments",
      "cloneAppointment",
      "confirmAppointmentRequest",
      "createAppointment",
      "rescheduleAppointment",
      "updateAppointment",
    ]);
    const pedido = APP_SOURCES.find((s) => s.file === "apps/web/lib/scheduling/pedido-acceptance.ts")!.src;
    expect(functionsCalling(pedido, "enqueueRemindersAfterCommit(")).toEqual(["emitAcceptedPedidoReminders"]);
    // ...which the review queue and the SMS reply call: the other two acceptance doors.
    const viaPedido = APP_SOURCES.filter((s) => /\bemitAcceptedPedidoReminders\(/.test(s.src)).map((s) => s.file);
    expect(viaPedido.sort()).toEqual([
      "apps/web/lib/reminders/inbound-reply.ts",
      "apps/web/lib/reminders/inbound-store.ts",
      "apps/web/lib/scheduling/pedido-acceptance.ts",
    ]);
  });
});

/* ------------------------- 2. the owner-run scripts ------------------------- */

const SCRIPTS = [
  "packages/db/scripts/inc-1007-rearm-reminders-emit.mjs",
  "packages/db/scripts/obs-05-backfill-emit.mjs",
];

describe("an event without a marker: the two owner-run scripts", () => {
  it.each(SCRIPTS)("%s sends confirmationEligible false and no marker", (file) => {
    const src = readFileSync(join(REPO, file), "utf8");
    const payloads = src.match(/data: \{[^}]*confirmationEligible[^}]*\}/g) ?? [];
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toContain("confirmationEligible: false");
    expect(payloads[0]).not.toContain("saveId");
  });

  it("their event never starts a confirmation run", () => {
    const script = {
      name: "appointment/scheduled",
      data: { appointmentId: APPT, tenantId: TENANT, startsAt: T1.toISOString(), confirmationEligible: false },
    };
    expect(deliver([script, script]).runs).toEqual([]);
  });

  it("IF one did pass the filter, its key could never equal an application key, however Inngest reads the absent field", async () => {
    await enqueueRemindersAfterCommit(TENANT, [{ appointmentId: APPT, startsAt: T1, practitionerId: PRAC }]);
    const appKey = evaluateKey(CONFIRMATION_IDEMPOTENCY_KEY, h.sent[0]!.data);
    const markerless = { appointmentId: APPT, tenantId: TENANT, startsAt: T1.toISOString(), confirmationEligible: true };
    for (const absent of ["", "null", "undefined"]) {
      const k = evaluateKey(CONFIRMATION_IDEMPOTENCY_KEY, markerless, absent);
      // Every marker-less event of one appointment shares this key...
      expect(k).toBe(`${APPT}:confirmation:${absent}`);
      // ...and no application event has it: an application key ends in a uuid.
      expect(k).not.toBe(appKey);
      expect(absent).not.toMatch(UUID);
    }
  });
});
