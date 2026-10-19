// The appointment statuses a booking confirmation may still go out for
// (pre-visit only). Pure and import-free, so the confirmation dispatch
// (./dispatch.ts) and the choice of which occurrence of a save carries the
// confirmation (lib/scheduling/reminders.ts, `confirmationEligibleIndex`)
// read ONE list and cannot disagree about it.
export const CONFIRMABLE_STATUSES: ReadonlySet<string> = new Set(["scheduled", "confirmed"]);
