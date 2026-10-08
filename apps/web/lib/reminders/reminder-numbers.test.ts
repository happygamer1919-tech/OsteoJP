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
