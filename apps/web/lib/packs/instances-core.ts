/**
 * W8-01c — pure resolvers for pack-session consumption. No DB, no I/O: the
 * register / decrement / manual-adjust math is unit-testable in isolation (like
 * normalizePackInput in W8-01a). The 0037 DB checks (0 <= sessions_remaining <=
 * sessions_total) are the backstop; these keep the app layer from ever proposing
 * an out-of-range write.
 */

export type ActiveInstance = { sessionsTotal: number; sessionsRemaining: number };

export type BookingResolution =
  | { action: "register"; sessionsTotal: number; sessionsRemaining: number }
  | { action: "decrement"; sessionsRemaining: number };

/**
 * Booking a pack: with an ACTIVE instance (remaining > 0) decrement by 1; with
 * none active, register a fresh instance of `sessionCount` sessions and consume
 * session 1 (remaining = sessionCount - 1). Never proposes a negative balance —
 * an exhausted instance is treated as "none active", so booking registers a new
 * one rather than driving the balance below 0.
 */
export function resolvePackBooking(
  active: ActiveInstance | null,
  sessionCount: number,
): BookingResolution {
  if (active && active.sessionsRemaining > 0) {
    return { action: "decrement", sessionsRemaining: active.sessionsRemaining - 1 };
  }
  return { action: "register", sessionsTotal: sessionCount, sessionsRemaining: sessionCount - 1 };
}

export type AdjustDirection = "consume" | "restore";
export type AdjustResolution =
  | { ok: true; sessionsRemaining: number }
  | { ok: false; reason: "exhausted" | "complete" };

/**
 * Manual staff adjust (the under-24h / no-show rule, W8-01a business rule):
 * `consume` decrements by 1 but refuses below 0 (`exhausted`); `restore`
 * increments by 1 but refuses above the total (`complete`). NEVER a charge — the
 * platform only tracks the balance, it never bills.
 */
export function resolvePackAdjust(
  instance: ActiveInstance,
  direction: AdjustDirection,
): AdjustResolution {
  if (direction === "consume") {
    if (instance.sessionsRemaining <= 0) return { ok: false, reason: "exhausted" };
    return { ok: true, sessionsRemaining: instance.sessionsRemaining - 1 };
  }
  if (instance.sessionsRemaining >= instance.sessionsTotal) return { ok: false, reason: "complete" };
  return { ok: true, sessionsRemaining: instance.sessionsRemaining + 1 };
}

/** An instance is active (still bookable/consumable) while it has sessions left. */
export function instanceStatus(sessionsRemaining: number): "active" | "exhausted" {
  return sessionsRemaining > 0 ? "active" : "exhausted";
}
