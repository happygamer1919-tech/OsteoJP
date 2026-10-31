/**
 * re-arming-saves.test.ts - strategy's ruling R33: THE SWEEP'S GATE COUNTS
 * EXACTLY THE SAVES THAT RE-ARM THE LIVE JOB.
 *
 *   "the gate does not count every save. It counts exactly the saves that
 *   make the live job re-plan this visit's reminders (the doors that emit
 *   appointment/scheduled with a re-arm). Derive them from code and pin them
 *   with a test listing those doors. A status-only save (an SMS "confirmo",
 *   a hand-set Confirmada) never counts."
 *
 * What this file holds, beside confirmation-key-per-save.test.ts (which pins
 * that every `appointment/scheduled` goes through `enqueueRemindersAfterCommit`):
 *   1. THE DOORS, from the source: every function that calls
 *      `enqueueRemindersAfterCommit` or `emitAcceptedPedidoReminders`, and
 *      they are exactly the doors of RE_ARMING_SAVES
 *      (./reminder-population.ts). A door added or removed fails here until
 *      the table says what its audit row is.
 *   2. EACH DOOR'S AUDIT ROW: the action the table names is the one the door
 *      writes in its own transaction.
 *   3. EACH DOOR'S CONDITION: the source lines the table's conditions are
 *      read from. A door that changes when it emits fails here.
 *   4. THE GATE'S SQL: one clause per entry of the table, and nothing else.
 *
 * That the gate does what it says on rows (a hand-set Confirmada and an SMS
 * "confirmo" on a booked visit do not count; the same on a request does) is
 * proven in sweep.db.test.ts and sweep-send.db.test.ts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql as rawSql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { RE_ARMING_SAVES, hasReArmingSaveAfter } = await import("./reminder-population");
type DbTx = import("@osteojp/db").DbTx;

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
const srcOf = (file: string) => {
  const found = APP_SOURCES.find((s) => s.file === file);
  if (!found) throw new Error(`no source ${file}`);
  return found.src;
};

/**
 * The top-level `async function`s of `src`, exported or not, each with its
 * body (to the first `}` at column 0). A helper that is not exported is read
 * too, so a call hidden in one is a door here until it is listed.
 */
function functionsOf(src: string): Map<string, string> {
  const lines = src.split("\n");
  const out = new Map<string, string>();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:export\s+)?async\s+function\s+(\w+)/.exec(lines[i]!);
    if (!m) continue;
    const end = lines.findIndex((l, j) => j > i && l === "}");
    out.set(m[1]!, lines.slice(i, end + 1).join("\n"));
  }
  return out;
}

const bodyOf = (door: string) => {
  const [file, fn] = door.split(":") as [string, string];
  const body = functionsOf(srcOf(file)).get(fn);
  if (!body) throw new Error(`no function ${door}`);
  return body;
};

/** Every `file:function` whose body calls `needle`, across the application sources. */
function doorsCalling(needle: string): string[] {
  const doors: string[] = [];
  for (const s of APP_SOURCES) {
    if (!s.src.includes(needle)) continue;
    for (const [fn, body] of functionsOf(s.src)) if (body.includes(needle)) doors.push(`${s.file}:${fn}`);
  }
  return doors.sort();
}

const TABLE_DOORS = [...new Set(RE_ARMING_SAVES.flatMap((c) => [...c.doors]))].sort();

describe("R33: the doors that re-arm the live job are the doors of the gate's table", () => {
  it("the extractor reads real files", () => {
    expect(APP_SOURCES.length).toBeGreaterThan(100);
    expect(functionsOf(srcOf("apps/web/lib/scheduling/actions.ts")).has("rescheduleAppointment")).toBe(true);
  });

  it("every function that emits appointment/scheduled is a door of the table, and every door of the table emits", () => {
    // The two helpers that emit on a door's behalf, and their own definitions, are not doors.
    const helpers = [
      "apps/web/lib/scheduling/pedido-acceptance.ts:emitAcceptedPedidoReminders",
      "apps/web/lib/scheduling/reminders.ts:enqueueRemindersAfterCommit",
    ];
    const direct = doorsCalling("enqueueRemindersAfterCommit(").filter((d) => !helpers.includes(d));
    const viaAcceptance = doorsCalling("emitAcceptedPedidoReminders(").filter((d) => !helpers.includes(d));
    expect([...new Set([...direct, ...viaAcceptance])].sort()).toEqual(TABLE_DOORS);
    expect(TABLE_DOORS).toEqual([
      "apps/web/lib/reminders/inbound-reply.ts:applyInboundReply",
      "apps/web/lib/reminders/inbound-store.ts:resolveReviewItem",
      "apps/web/lib/scheduling/actions.ts:batchScheduleAppointments",
      "apps/web/lib/scheduling/actions.ts:bulkRescheduleAppointments",
      "apps/web/lib/scheduling/actions.ts:cloneAppointment",
      "apps/web/lib/scheduling/actions.ts:confirmAppointmentRequest",
      "apps/web/lib/scheduling/actions.ts:createAppointment",
      "apps/web/lib/scheduling/actions.ts:rescheduleAppointment",
      "apps/web/lib/scheduling/actions.ts:updateAppointment",
    ]);
  });

  it("no call hides outside an exported function: every call in a file belongs to one of its doors", () => {
    const calls = (needle: string) => {
      const perFile: Record<string, number> = {};
      for (const s of APP_SOURCES) {
        const n = s.src.split(needle).length - 1;
        if (n > 0) perFile[s.file] = n;
      }
      return perFile;
    };
    // One call per door, and the helpers' own definitions and calls.
    expect(calls("enqueueRemindersAfterCommit(")).toEqual({
      "apps/web/lib/scheduling/actions.ts": 7,
      "apps/web/lib/scheduling/pedido-acceptance.ts": 1,
      "apps/web/lib/scheduling/reminders.ts": 1,
    });
    expect(calls("emitAcceptedPedidoReminders(")).toEqual({
      "apps/web/lib/reminders/inbound-reply.ts": 1,
      "apps/web/lib/reminders/inbound-store.ts": 1,
      "apps/web/lib/scheduling/pedido-acceptance.ts": 1,
    });
  });

  it("the table: seven clauses, each one audit action", () => {
    expect(RE_ARMING_SAVES.map((c) => `${c.clause}=${c.action}`)).toEqual([
      "booked=appointment.create",
      "moved=appointment.reschedule",
      "accepted_in_pedidos=appointment.update",
      "accepted_with_estado=appointment.update",
      "brought_back=appointment.update",
      "accepted_in_sms_review=appointment.sms_reply_reviewed",
      "accepted_by_sms_reply=appointment.patient_sms_reply",
    ]);
  });
});

/** The function that writes each door's audit row: the door itself, or the helper it calls. */
const AUDIT_WRITER: Record<string, { file: string; fn: string }> = {
  "apps/web/lib/scheduling/actions.ts:batchScheduleAppointments": { file: "apps/web/lib/scheduling/batch.ts", fn: "batchSchedule" },
  // APPT-BULK-01: both move doors run the one move, which writes the row per visit.
  "apps/web/lib/scheduling/actions.ts:rescheduleAppointment": { file: "apps/web/lib/scheduling/actions.ts", fn: "moveAppointment" },
  "apps/web/lib/scheduling/actions.ts:bulkRescheduleAppointments": {
    file: "apps/web/lib/scheduling/actions.ts",
    fn: "moveAppointment",
  },
};

describe("R33: each door writes the audit row its clause reads, in its own transaction", () => {
  it.each(RE_ARMING_SAVES.flatMap((c) => c.doors.map((door) => [door, c.action] as const)))("%s writes %s", (door, action) => {
    const writer = AUDIT_WRITER[door];
    if (writer) {
      expect(bodyOf(door)).toContain(`${writer.fn}(`);
      expect(bodyOf(`${writer.file}:${writer.fn}`)).toContain(`action: "${action}"`);
      return;
    }
    const body = bodyOf(door);
    if (body.includes(`action: "${action}"`)) return;
    // The two SMS doors write their row through a helper of their own file.
    const [file] = door.split(":") as [string];
    const helper = { "appointment.sms_reply_reviewed": "writeResolveAudit", "appointment.patient_sms_reply": "writeReplyAudit" }[
      action as string
    ];
    expect(helper, door).toBeDefined();
    expect(body).toContain(`${helper!}(`);
    expect(srcOf(file)).toContain(`action: "${action}"`);
  });
});

/**
 * THE CONDITIONS, read where each door decides. A line here is the source of
 * one condition in the table; if it changes, the table is read again.
 */
const CONDITIONS: [door: string, lines: string[]][] = [
  // booked: every created row is a target, and every target emits.
  ["apps/web/lib/scheduling/actions.ts:createAppointment", ["reminderTargets = created.map((c) =>"]],
  ["apps/web/lib/scheduling/actions.ts:batchScheduleAppointments", ["result.booked.map((b) =>"]],
  ["apps/web/lib/scheduling/actions.ts:cloneAppointment", ["reminderTargets = ["]],
  // moved: each door emits the targets the one move handed back (below, HELPER_CONDITIONS).
  [
    "apps/web/lib/scheduling/actions.ts:rescheduleAppointment",
    ['const moved = await moveAppointment(actor, ip, id, input, "apply");', "await enqueueRemindersAfterCommit(actor.tenantId, moved.reminderTargets);"],
  ],
  [
    "apps/web/lib/scheduling/actions.ts:bulkRescheduleAppointments",
    [
      "moved = await moveAppointment(",
      'if (mode === "apply") committed.push(moved);',
      'if (mode === "apply" && committed.length > 0) {',
      "committed.flatMap((m) => m.reminderTargets),",
    ],
  ],
  // accepted_in_pedidos: always, and the row says so.
  [
    "apps/web/lib/scheduling/actions.ts:confirmAppointmentRequest",
    ['via: "portal_request_confirm"', "reminderTargets = [acceptedPedidoTarget("],
  ],
  // accepted_with_estado and brought_back.
  [
    "apps/web/lib/scheduling/actions.ts:updateAppointment",
    [
      'if (patch.status === "confirmed" && affected.some((a) => a.status === "scheduled")) {',
      'acceptedPedidos = affected.filter((a) => a.status === "scheduled" && pedidoIds.has(a.id));',
      "? affected.filter((a) => isUncancel(a.status, patch.status!))",
      ".filter((a) => a.startsAt.getTime() > nowMs)",
      ".filter((a) => !backAsPedido.has(a.id))",
      'patch.status === "scheduled"',
      "? await unconfirmedPedidoIdsAmong(tx, uncancelling.map((a) => a.id))",
      "fromStatus: statusBefore.get(aid) ?? null,",
      "toStatus: patch.status,",
    ],
  ],
  // accepted_in_sms_review: confirmed, applied, and a request.
  [
    "apps/web/lib/reminders/inbound-store.ts:resolveReviewItem",
    [
      'resolution === "confirmed" && (await isUnconfirmedPedido(tx, item.appointmentId));',
      'and(eq(appointments.id, item.appointmentId), eq(appointments.status, "scheduled")),',
      "applied = updated.length > 0;",
      "if (applied && pedido) {",
    ],
  ],
  // accepted_by_sms_reply: confirmed, a request, and only a scheduled visit.
  [
    "apps/web/lib/reminders/inbound-reply.ts:applyInboundReply",
    [
      'if (appt.status !== "scheduled") return review("wrong_status");',
      "const pedido = await isUnconfirmedPedido(tx, appt.id);",
      "if (pedido) accepted = [acceptedPedidoTarget(appt.id, appt.startsAt, appt.practitionerId)];",
      'outcome: "confirmed",',
    ],
  ],
];

/**
 * The conditions that live in a helper a door runs, not in the door itself.
 * `moveAppointment` (APPT-BULK-01) is the one move: every moved row is a
 * target, but an unaccepted request (the open question: its row records no
 * status), and it writes one `appointment.reschedule` per row.
 */
const HELPER_CONDITIONS: [helper: string, lines: string[]][] = [
  [
    "apps/web/lib/scheduling/actions.ts:moveAppointment",
    [
      "reminderTargets = targets",
      ".filter((t) => !unacceptedPedidoIds.has(t.id))",
      'action: "appointment.reschedule"',
    ],
  ],
];

describe("R33: the conditions the table's clauses are read from", () => {
  it("every door is listed here once", () => {
    expect(CONDITIONS.map(([door]) => door).sort()).toEqual(TABLE_DOORS);
  });

  it.each(CONDITIONS)("%s", (door, lines) => {
    const body = bodyOf(door);
    for (const line of lines) expect(body, line).toContain(line);
  });

  it.each(HELPER_CONDITIONS)("the helper %s", (helper, lines) => {
    const body = bodyOf(helper);
    for (const line of lines) expect(body, line).toContain(line);
  });

  it("an un-cancel is from Cancelada to Agendada or Confirmada, and nothing else", () => {
    expect(srcOf("apps/web/lib/scheduling/uncancel.ts")).toContain(
      'return from === "cancelled" && (to === "scheduled" || to === "confirmed");',
    );
  });

  it("a request is `origin` patient_portal: what the portal writes and what the dispatcher reads", () => {
    expect(srcOf("apps/api/lib/appointments/store.ts")).toContain('origin: "patient_portal",');
    expect(srcOf("apps/web/lib/reminders/dispatch.ts")).toContain('const PEDIDO_ORIGINS = new Set(["patient_portal"]);');
    expect(srcOf("apps/web/lib/reminders/dispatch.ts")).toContain(
      'return data.status === "scheduled" && PEDIDO_ORIGINS.has(data.origin);',
    );
  });

  it("every event re-plans: the reminders' function reads no field of the event but the visit and its start", () => {
    const fns = srcOf("apps/web/lib/reminders/inngest/functions.ts");
    expect(fns).toContain("const due = computeDueReminders(new Date(startsAt), new Date());");
    expect(fns).toContain("triggers: [{ event: EVENT_APPOINTMENT_SCHEDULED }],");
  });
});

describe("R33: the gate's SQL is the table, clause for clause", () => {
  const qb = new QueryBuilder();
  const render = async () => {
    const { appointments } = await import("@osteojp/db");
    return qb
      .select({ one: appointments.id })
      .from(appointments)
      .where(hasReArmingSaveAfter(qb as unknown as DbTx, rawSql`now()`))
      .toSQL();
  };

  it("one alternative per clause, each naming its action, and nothing a status-only save could match on a booked visit", async () => {
    const { sql, params } = await render();
    // Seven alternatives, one action each, in the table's order.
    const actions = [...sql.matchAll(/"reminder_re_arming_save"\."action" = \$(\d+)/g)].map((m) => params[Number(m[1]) - 1]);
    expect(actions).toEqual(RE_ARMING_SAVES.map((c) => c.action));
    // The three acceptances read on a visit that is a request, and a return to Agendada on one that is not.
    expect([...sql.matchAll(/"appointments"\."origin" = \$(\d+)/g)].map((m) => params[Number(m[1]) - 1])).toEqual([
      "patient_portal",
      "patient_portal",
      "patient_portal",
    ]);
    expect([...sql.matchAll(/"appointments"\."origin" <> \$(\d+)/g)].map((m) => params[Number(m[1]) - 1])).toEqual([
      "patient_portal",
    ]);
    // No clause reads a `toStatus` without the `fromStatus` beside it.
    expect(sql.match(/->>'toStatus'/g)).toHaveLength(3);
    expect(sql.match(/->>'fromStatus'/g)).toHaveLength(2);
    // Strictly after.
    expect(sql).toContain(`"reminder_re_arming_save"."created_at" > now()`);
    expect(sql).not.toContain(`"reminder_re_arming_save"."created_at" >= `);
  });
});
