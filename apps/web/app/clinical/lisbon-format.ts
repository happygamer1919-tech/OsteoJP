// The clinical pages render on the server, whose zone is UTC. A bare
// toLocaleString prints the server's hour, one hour early in summer. Both
// helpers pin Europe/Lisbon, so the page shows the clinic's wall clock all year.
const LISBON = "Europe/Lisbon";

/** Date and time in Lisbon, the same pt-PT shape as toLocaleString("pt-PT"). */
export function formatLisbonDateTime(instant: Date | string): string {
  return new Date(instant).toLocaleString("pt-PT", { timeZone: LISBON });
}

/** The calendar date in Lisbon, the same pt-PT shape as toLocaleDateString("pt-PT"). */
export function formatLisbonDate(instant: Date | string): string {
  return new Date(instant).toLocaleDateString("pt-PT", { timeZone: LISBON });
}
