/**
 * reminder-numbers.test.ts: what the two counts on Lembretes SMS rest on,
 * without a database. The counts themselves are proven on seeded rows, as the
 * viewer, in reminder-log.db.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({ runScoped: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ runScoped: h.runScoped }));

const { CLAIM_OUTCOME_WINDOW_MS, NUMBERS_REMINDABLE_STATUSES, NUMBERS_SETTLE_MS, readReminderNumbers } =
  await import("./reminder-numbers");
const {
  REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER,
  SCHEDULING_SAVE_ACTIONS,
  SCHEDULING_SMS_REPLY_ACTION,
  SCHEDULING_SMS_REVIEW_ACTION,
  SCHEDULING_UPDATE_ACTION,
} = await import("./reminder-population");
const { getStrings } = await import("@osteojp/i18n");

describe("the Lembretes SMS counts", () => {
  it("count the visits the dispatcher would still remind: the same statuses, read from dispatch.ts", () => {
    // The dispatcher keeps its set private, so the copy here is held to the
    // source text. A status added there and not here fails this line.
    const dispatch = readFileSync(join(__dirname, "dispatch.ts"), "utf8");
    const inDispatch = dispatch.match(/REMINDABLE_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1];
    expect(inDispatch, "REMINDABLE_STATUSES not found in dispatch.ts").toBeTruthy();
    const theirs = [...inDispatch!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(theirs.length).toBeGreaterThan(0);
    expect([...NUMBERS_REMINDABLE_STATUSES].sort()).toEqual(theirs);
  });

  it("leave a mark or a claim alone for 30 minutes, and look back seven days for a claim", () => {
    expect(NUMBERS_SETTLE_MS).toBe(30 * 60_000);
    expect(CLAIM_OUTCOME_WINDOW_MS).toBe(7 * 24 * 60 * 60_000);
  });

  /**
   * THE SWITCH IS OFF, AND THE PAGE CANNOT TURN IT ON. Whether a visit that
   * never had a reminder is owed one is the owner's open question; until he
   * rules, the first count leaves those visits out. Three things are held
   * together here, so that a flip is one deliberate change and not a drift:
   * the constant, the page's call, and the sentence reception reads.
   */
  it("leave out the visits that never had a reminder: the switch is off, the page passes none, and the note says so", () => {
    expect(REMIND_VISITS_THAT_NEVER_HAD_A_REMINDER).toBe(false);

    // The page reads the counts with the context alone: the option that turns
    // every visit on exists for the DB test and is passed by nothing else.
    const page = readFileSync(join(__dirname, "../../app/comunicacoes/lembretes-sms/page.tsx"), "utf8");
    expect(page.match(/readReminderNumbers\(/g)).toHaveLength(1);
    expect(page).toContain("readReminderNumbers(ctx)");
    const callers = ["../../app/comunicacoes/lembretes-sms/page.tsx", "reminder-numbers.ts", "reminder-population.ts"];
    for (const file of callers) {
      const text = readFileSync(join(__dirname, file), "utf8");
      expect(text, file).not.toMatch(/includeNeverReminded:\s*true/);
    }

    // The sentence under the counts names what is left out, in both languages.
    expect(getStrings("pt")["remindersLog.numbersNote"]).toContain("as importadas e os pedidos online ainda por tratar ficam de fora");
    expect(getStrings("en")["remindersLog.numbersNote"]).toContain("imported visits and online requests not yet handled are left out");
  });

  /**
   * EVERY NAME IS HELD TO THE FILE THAT WRITES IT. The count looks for audit
   * rows by action and by metadata key. A name nobody writes matches nothing,
   * and "nothing" would read as "this visit never had a reminder": the count
   * would go quiet instead of red. So each action, key and value the predicate
   * reads is found here in its writer's own source.
   */
  it("call a visit handed to the reminder job by the audit rows its saves really write", () => {
    const src = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
    const population = src("reminder-population.ts");

    // Booking and moving: actions of the scheduling audit writer's own type.
    expect([...SCHEDULING_SAVE_ACTIONS]).toEqual(["appointment.create", "appointment.reschedule"]);
    expect(SCHEDULING_UPDATE_ACTION).toBe("appointment.update");
    const union = src("../scheduling/audit.ts").match(/export type AppointmentAuditAction =([\s\S]*?);/)?.[1];
    expect(union, "AppointmentAuditAction not found in scheduling/audit.ts").toBeTruthy();
    for (const action of [...SCHEDULING_SAVE_ACTIONS, SCHEDULING_UPDATE_ACTION]) {
      expect(union, action).toContain(`| "${action}"`);
    }

    // A change counts only as a status set to scheduled or confirmed, or as
    // the acceptance of an online request: the keys actions.ts writes.
    const actions = src("../scheduling/actions.ts");
    expect(actions).toContain("toStatus: patch.status");
    expect(actions).toContain('via: "portal_request_confirm"');
    expect(population).toContain("->>'toStatus' in ('scheduled', 'confirmed')");
    expect(population).toContain("->>'via' = 'portal_request_confirm'");

    // The two SMS doors that can accept a request, with the keys each writes.
    const review = src("inbound-store.ts");
    expect(review).toContain(`action: "${SCHEDULING_SMS_REVIEW_ACTION}"`);
    expect(review).toContain("resolution: row.resolution");
    expect(review).toContain("applied: row.applied");
    expect(population).toContain("->>'resolution' = 'confirmed'");
    expect(population).toContain("->>'applied' = 'true'");
    const reply = src("inbound-reply.ts");
    expect(reply).toContain(`action: "${SCHEDULING_SMS_REPLY_ACTION}"`);
    expect(reply).toContain("outcome: row.outcome");
    expect(reply).toContain('outcome: "confirmed"');
    expect(population).toContain("->>'outcome' = 'confirmed'");
  });

  it("refuse a therapist at the capability, before any read", async () => {
    const { ForbiddenError } = await import("@osteojp/auth");
    const therapist = {
      tenantId: "22222222-2222-2222-2222-222222222222",
      role: "therapist" as const,
      userId: "44444444-4444-4444-4444-444444444444",
    };
    await expect(readReminderNumbers(therapist)).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.runScoped).not.toHaveBeenCalled();
  });
});
