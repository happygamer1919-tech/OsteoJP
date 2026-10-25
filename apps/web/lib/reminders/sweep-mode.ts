// SWEEP-47: the two switches of the reminder sweep. Strategy ruling of
// 2026-10-13 (the shape of the survey's switch, survey-mode.ts on main): the
// sweep stays in shadow by default, the send mode is behind its own switch,
// and reminding the visits that never had a reminder is behind a second one.
//
// THE SEND SWITCH, REMINDERS_SWEEP_MODE
//
//   shadow  what the sweep does today: a pass writes down what it would hand
//           over and hands nothing over. The sleeping job sends every
//           reminder, at its mark, exactly as before. Also what an unset or
//           unrecognised value reads as.
//   send    the sweep hands the due reminders to the dispatcher. With it, and
//           only with it: a claim blocks a second sender at any age, a claim
//           that cannot be read or written stops the send, a reminder may go
//           late only inside the late limit, and a sleeping job waits for the
//           sweep before it tries.
//
// THE SECOND SWITCH, REMINDERS_SWEEP_NEVER_REMINDED
//
//   on      a sending pass also takes the visits no save ever handed to the
//           reminder job (an imported visit, for one). Read by a sending pass
//           only: in shadow it changes nothing.
//   else    they are left out, as today.
//
// FAIL CLOSED, AND EXACT MEANS EXACT. Each value is compared as it was set: no
// trim, no lower-casing. `SEND`, `Send`, `send` with a space or a line break
// beside it, `true`, `1` and `on` all read `shadow`; `ON`, `true` and `send`
// all leave the second switch off. A careless paste leaves the sweep in
// shadow, which is seen and corrected; a tolerant compare would let a value
// nobody meant start sending.
//
// Pure module: no DB, no SDK, no `server-only`. The scheduled function, the
// dispatcher and the sleeping job all read it, so they cannot disagree about
// whether the sweep is the sender.

export type ReminderSweepMode = "shadow" | "send";

type Env = Record<string, string | undefined>;

/** The send switch. The raw value, compared exactly; everything else is `shadow`. */
export function reminderSweepMode(env: Env = process.env): ReminderSweepMode {
  return env.REMINDERS_SWEEP_MODE === "send" ? "send" : "shadow";
}

/** Is the sweep the sender? The one question every reader of the switch asks. */
export function sweepSends(env: Env = process.env): boolean {
  return reminderSweepMode(env) === "send";
}

/**
 * Does a SENDING pass also take the visits that never had a reminder? Its own
 * switch, off unless the value is exactly `on`. It does not turn sending on.
 */
export function sweepRemindsNeverReminded(env: Env = process.env): boolean {
  return env.REMINDERS_SWEEP_NEVER_REMINDED === "on";
}
