/**
 * Item 5: channel is part of the reminder idempotency key.
 *
 * THE TRAP THIS CLOSES. Each offset carries one channel today (48h email, 24h
 * SMS), so channel looks derivable from offsetId and therefore redundant in the
 * key. It is not. The moment one offset carries both channels — a config change,
 * not a code change — a key without channel makes Inngest dedupe the second
 * channel against the first. No error, no log, no run. The patient simply never
 * receives one of the two, and nothing anywhere says so.
 *
 * These tests are written against that FUTURE shape (both channels at one offset,
 * same appointment, same send instant) precisely because it is the case the
 * current config cannot produce and therefore the one no other test covers.
 */
import { describe, it, expect } from "vitest";
import { reminderIdempotencyKey, computeDueReminders, REMINDER_OFFSETS } from "./offsets";

const APPT = "11111111-1111-1111-1111-111111111111";

describe("idempotency key includes channel", () => {
  it("gives email and SMS DIFFERENT keys at the same offset, same appointment", () => {
    const email = reminderIdempotencyKey(APPT, "24h", "email");
    const sms = reminderIdempotencyKey(APPT, "24h", "sms");

    expect(email).not.toBe(sms);
    // Both channels survive: neither dedupes the other away.
    expect(new Set([email, sms]).size).toBe(2);
  });

  it("still dedupes a genuine duplicate: same appointment, offset AND channel", () => {
    expect(reminderIdempotencyKey(APPT, "24h", "sms")).toBe(
      reminderIdempotencyKey(APPT, "24h", "sms"),
    );
  });

  it("keeps offsets distinct within one channel", () => {
    expect(reminderIdempotencyKey(APPT, "48h", "email")).not.toBe(
      reminderIdempotencyKey(APPT, "24h", "email"),
    );
  });

  it("names the channel in the key, so a run is identifiable from Inngest history", () => {
    expect(reminderIdempotencyKey(APPT, "24h", "sms")).toContain(":sms");
    expect(reminderIdempotencyKey(APPT, "48h", "email")).toContain(":email");
  });

  it("produces 4 distinct keys across 2 offsets x 2 channels", () => {
    const keys = (["48h", "24h"] as const).flatMap((o) =>
      (["email", "sms"] as const).map((c) => reminderIdempotencyKey(APPT, o, c)),
    );
    expect(new Set(keys).size).toBe(4);
  });
});

describe("per-channel offset split", () => {
  it("sends email at 48h and SMS at 24h, one channel each", () => {
    expect(REMINDER_OFFSETS.map((o) => [o.id, o.channel])).toEqual([
      ["48h", "email"],
      ["24h", "sms"],
    ]);
  });

  it("fans out one due reminder per (offset, channel), carrying its channel", () => {
    const startsAt = new Date("2026-09-10T09:00:00Z");
    const now = new Date("2026-09-01T09:00:00Z");

    const due = computeDueReminders(startsAt, now);

    expect(due).toHaveLength(2);
    expect(due.map((d) => ({ offsetId: d.offsetId, channel: d.channel }))).toEqual([
      { offsetId: "48h", channel: "email" },
      { offsetId: "24h", channel: "sms" },
    ]);
    // Every fanned-out reminder yields a distinct key.
    const keys = due.map((d) => reminderIdempotencyKey(APPT, d.offsetId, d.channel));
    expect(new Set(keys).size).toBe(due.length);
  });

  it("still drops offsets whose send time has already passed", () => {
    const startsAt = new Date("2026-09-10T09:00:00Z");
    // 30h before start: the 48h reminder is already in the past.
    const now = new Date("2026-09-09T03:00:00Z");

    const due = computeDueReminders(startsAt, now);
    expect(due.map((d) => d.offsetId)).toEqual(["24h"]);
    expect(due[0]!.channel).toBe("sms");
  });
});
