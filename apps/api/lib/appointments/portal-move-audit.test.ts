/**
 * R44 (strategy, 2026-11-02): the portal move's audit row is the row the
 * reminder sweep's `moved` clause reads, key for key.
 *
 * The clause is SQL (apps/web/lib/reminders/reminder-population.ts,
 * `reArmingClause`, case "moved", and `startAtTheMark`), so it cannot be run on
 * a row without a database. What this file does instead, with no database:
 *   1. the row's shape: action, entity, tenant, and `fromStartsAt` equal to the
 *      start before the move, as `toISOString()` text;
 *   2. the REAL exported gate from reminder-population.ts, rendered to SQL with
 *      a query builder (as re-arming-saves.test.ts renders it): the action its
 *      `moved` alternative binds, the entity type it binds, and the two
 *      metadata keys it reads are the ones this row carries, in the text form
 *      the gate compares against;
 *   3. the staff writer's source (actions.ts `moveAppointment`, audit.ts
 *      `writeAppointmentAudit`): the same action, entity type, tenant column and
 *      start keys, so the two writers of a move row cannot drift apart.
 * That the gate then does the right thing on rows is sweep.db.test.ts's job,
 * and needs a database (not run here).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql as rawSql } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { portalMoveAuditRow } from "./portal-move-audit";

vi.mock("server-only", () => ({}));

const REPO = join(__dirname, "..", "..", "..", "..");
// The real gate, imported from the web app's source, not copied.
const {
  RE_ARMING_SAVES,
  SCHEDULING_SAVE_ACTIONS,
  SCHEDULING_UPDATE_ACTION,
  SCHEDULING_SMS_REVIEW_ACTION,
  SCHEDULING_SMS_REPLY_ACTION,
  hasReArmingSaveAfter,
  hasSchedulingEvent,
} = await import(
  "../../../web/lib/reminders/reminder-population"
);

const BEFORE = new Date("2026-11-20T10:30:00.000Z");
const AFTER = new Date("2026-11-21T14:00:00.000Z");
const AFTER_END = new Date("2026-11-21T14:45:00.000Z");

const row = portalMoveAuditRow({
  tenantId: "11111111-1111-4111-8111-111111111111",
  appointmentId: "22222222-2222-4222-8222-222222222222",
  practitionerId: "33333333-3333-4333-8333-333333333333",
  locationId: "44444444-4444-4444-8444-444444444444",
  fromStartsAt: BEFORE,
  startsAt: AFTER,
  endsAt: AFTER_END,
  unacceptedRequest: false,
});

/** The same move, of a request the clinic has not accepted yet. */
const pedidoRow = portalMoveAuditRow({
  tenantId: "11111111-1111-4111-8111-111111111111",
  appointmentId: "22222222-2222-4222-8222-222222222222",
  practitionerId: "33333333-3333-4333-8333-333333333333",
  locationId: "44444444-4444-4444-8444-444444444444",
  fromStartsAt: BEFORE,
  startsAt: AFTER,
  endsAt: AFTER_END,
  unacceptedRequest: true,
});

/** The text `startNowText()` in reminder-population.ts compares against: to_char 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'. */
const MILLISECOND_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("R44: the portal move's audit row", () => {
  it("is an appointment.reschedule on the appointment, in its tenant, with no actor and no PII", () => {
    expect(row).toEqual({
      tenantId: "11111111-1111-4111-8111-111111111111",
      actorUserId: null,
      action: "appointment.reschedule",
      entityType: "appointment",
      entityId: "22222222-2222-4222-8222-222222222222",
      metadata: {
        practitionerId: "33333333-3333-4333-8333-333333333333",
        locationId: "44444444-4444-4444-8444-444444444444",
        fromStartsAt: "2026-11-20T10:30:00.000Z",
        startsAt: "2026-11-21T14:00:00.000Z",
        endsAt: "2026-11-21T14:45:00.000Z",
        via: "patient_portal",
      },
      ip: null,
    });
  });

  it("records the start BEFORE the move as fromStartsAt and the new start as startsAt, as millisecond text", () => {
    expect(row.metadata.fromStartsAt).toBe(BEFORE.toISOString());
    expect(row.metadata.startsAt).toBe(AFTER.toISOString());
    expect(row.metadata.fromStartsAt).not.toBe(row.metadata.startsAt);
    for (const v of [row.metadata.fromStartsAt, row.metadata.startsAt, row.metadata.endsAt]) {
      expect(v).toMatch(MILLISECOND_TEXT);
    }
  });

  it("carries ids and instants only: every metadata value is a uuid, an ISO instant, or the via marker", () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const [k, v] of Object.entries(row.metadata)) {
      if (k === "via") expect(v).toBe("patient_portal");
      else expect(UUID.test(v) || MILLISECOND_TEXT.test(v), `${k}=${v}`).toBe(true);
    }
  });
});

describe("R44: the row matches the sweep's `moved` clause (the real exported gate, rendered)", () => {
  const render = async () => {
    const { appointments } = await import("@osteojp/db");
    const qb = new QueryBuilder();
    return qb
      .select({ one: appointments.id })
      .from(appointments)
      .where(hasReArmingSaveAfter(qb as never, rawSql`now()`))
      .toSQL();
  };

  it("the clause's action is the row's action, and it is a scheduling save", async () => {
    const moved = RE_ARMING_SAVES.find((c) => c.clause === "moved");
    expect(moved?.action).toBe(row.action);
    expect([...SCHEDULING_SAVE_ACTIONS] as string[]).toContain(row.action);
  });

  it("the rendered gate binds the row's action and entity type, and reads the two start keys the row writes", async () => {
    const { sql, params } = await render();
    // The `moved` alternative: its action, bound as a parameter.
    const actions = [...sql.matchAll(/"reminder_re_arming_save"\."action" = \$(\d+)/g)].map((m) => params[Number(m[1]) - 1]);
    expect(actions).toContain(row.action);
    // Every audit row the gate reads is matched on entity type, and the type is the row's.
    const entityTypes = new Set(
      [...sql.matchAll(/"(?:reminder_re_arming_save|reminder_move_after_the_mark|reminder_start_at_the_mark)"\."entity_type" = \$(\d+)/g)].map(
        (m) => params[Number(m[1]) - 1],
      ),
    );
    expect([...entityTypes]).toEqual([row.entityType]);
    // ...and on entity id against the appointment, which is the row's entityId.
    expect(sql).toContain(`"reminder_re_arming_save"."entity_id" = "appointments"."id"`);
    // The start at the mark: `fromStartsAt` of the first move after it, else `startsAt` of the last row at or before it.
    expect(sql).toContain(`"reminder_move_after_the_mark"."metadata"->>'fromStartsAt'`);
    expect(sql).toContain(`"reminder_start_at_the_mark"."metadata"->>'startsAt'`);
    expect(Object.keys(row.metadata)).toEqual(expect.arrayContaining(["fromStartsAt", "startsAt"]));
    // ...compared as millisecond text, which is the form the row writes.
    expect(sql).toContain(`'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`);
    // The move-after-the-mark read is on the row's own action.
    const nextAction = /"reminder_move_after_the_mark"\."action" = \$(\d+)/.exec(sql);
    expect(nextAction && params[Number(nextAction[1]) - 1]).toBe(row.action);
  });
});

describe("R44: an unaccepted request's portal move writes an action the sweep does not read (SOLO, R4 of #1693)", () => {
  it("the action is appointment.pedido_reschedule.portal; everything else is the same row", () => {
    expect(pedidoRow.action).toBe("appointment.pedido_reschedule.portal");
    expect({ ...pedidoRow, action: null }).toEqual({ ...row, action: null });
    // ...and a visit that is not an unaccepted request still writes the move action.
    expect(row.action).toBe("appointment.reschedule");
  });

  it("the sweep's real exported vocabulary does not contain it", () => {
    expect([...SCHEDULING_SAVE_ACTIONS] as string[]).not.toContain(pedidoRow.action);
    expect(RE_ARMING_SAVES.map((c) => c.action) as string[]).not.toContain(pedidoRow.action);
    expect([SCHEDULING_UPDATE_ACTION, SCHEDULING_SMS_REVIEW_ACTION, SCHEDULING_SMS_REPLY_ACTION] as string[]).not.toContain(
      pedidoRow.action,
    );
  });

  it("neither rendered read binds it: not the re-arming gate, not hasSchedulingEvent", async () => {
    const { appointments } = await import("@osteojp/db");
    const qb = new QueryBuilder();
    for (const where of [hasReArmingSaveAfter(qb as never, rawSql`now()`), hasSchedulingEvent(qb as never)]) {
      const { params } = qb.select({ one: appointments.id }).from(appointments).where(where).toSQL();
      expect(params).not.toContain(pedidoRow.action);
      expect(params).toContain("appointment.reschedule");
    }
  });
});

describe("R44: the row matches the staff writer of the same action", () => {
  const actions = readFileSync(join(REPO, "apps/web/lib/scheduling/actions.ts"), "utf8");
  const audit = readFileSync(join(REPO, "apps/web/lib/scheduling/audit.ts"), "utf8");

  /** The staff move's `writeAppointmentAudit({...})` call, from `moveAppointment`. */
  const staffCall = (() => {
    const start = actions.indexOf('action: "appointment.reschedule",');
    expect(start).toBeGreaterThan(0);
    const open = actions.lastIndexOf("await writeAppointmentAudit(tx, {", start);
    const close = actions.indexOf("ip,\n", start);
    return actions.slice(open, close);
  })();

  it("there is one staff writer of the action, and its row is written through writeAppointmentAudit", () => {
    expect(actions.match(/action: "appointment\.reschedule"/g)).toHaveLength(1);
    expect(staffCall).toContain("await writeAppointmentAudit(tx, {");
    expect(staffCall).toContain("tenantId: actor.tenantId,");
    expect(staffCall).toContain("appointmentId: t.id,");
  });

  it("writeAppointmentAudit puts entity type 'appointment', the tenant and the id in the same columns this row fills", () => {
    expect(audit).toContain("tenantId: args.tenantId,");
    expect(audit).toContain('entityType: "appointment",');
    expect(audit).toContain("entityId: args.appointmentId,");
    expect(audit).toContain("metadata: args.metadata,");
    expect(row.entityType).toBe("appointment");
  });

  it("the start keys are written the same way: fromStartsAt is the start the move left, startsAt the new one, both toISOString()", () => {
    expect(staffCall).toContain("fromStartsAt: startBeforeTheMove.get(t.id)?.toISOString() ?? null,");
    expect(staffCall).toContain("startsAt: t.startsAt.toISOString(),");
    expect(staffCall).toContain("endsAt: t.endsAt.toISOString(),");
  });

  it("the metadata keys are the staff keys, minus scope and allowConflict, plus via", () => {
    const meta = /metadata: \{([\s\S]*?)\n\s*\},/.exec(staffCall);
    expect(meta).not.toBeNull();
    const staffKeys = [...meta![1]!.matchAll(/^\s*(\w+)(?::|,)/gm)].map((m) => m[1]);
    expect(staffKeys).toEqual(["practitionerId", "locationId", "fromStartsAt", "startsAt", "endsAt", "scope", "allowConflict"]);
    const expected = [...staffKeys.filter((k) => k !== "scope" && k !== "allowConflict"), "via"];
    expect(Object.keys(row.metadata)).toEqual(expected);
  });
});
