import { s } from "@/lib/i18n";
import type { ReminderNumbers } from "@/lib/reminders/reminder-numbers";

/**
 * The two counts the list cannot show (lib/reminders/reminder-numbers.ts), for
 * both channels. They are for every patient the viewer may read, and do NOT
 * follow the search or the filter below them: those narrow the list of
 * attempts, and these count what never became one.
 *
 * Each value is printed as a number beside its channel, so nothing here is
 * carried by colour.
 *
 * `null` MEANS THE READ FAILED, AND THE BLOCK SAYS SO. It never shows a zero
 * nobody counted: "0 missed" and "could not be counted" are different facts,
 * and reception acts on the first.
 *
 * Its own file, with no hook and no handler, so it renders on the server
 * inside the page and can be rendered alone by its test.
 */
export function ReminderNumbersBlock({ numbers }: { numbers: ReminderNumbers | null }) {
  const rows =
    numbers === null
      ? []
      : [
          {
            key: "unclaimed",
            label: s["remindersLog.numbersUnclaimed"],
            sms: numbers.sms.marksWithoutClaim,
            email: numbers.email.marksWithoutClaim,
          },
          {
            key: "no-outcome",
            label: s["remindersLog.numbersNoOutcome"],
            sms: numbers.sms.claimsWithoutOutcome,
            email: numbers.email.claimsWithoutOutcome,
          },
        ];
  return (
    <section
      aria-labelledby="reminder-numbers-title"
      data-testid="reminder-numbers"
      className="flex max-w-3xl flex-col gap-2 rounded-v2 border border-v2-border p-3"
    >
      <h2 id="reminder-numbers-title" className="text-sm font-semibold text-v2-text-primary">
        {s["remindersLog.numbersTitle"]}
      </h2>
      {numbers === null ? (
        <p data-testid="reminder-numbers-unavailable" className="text-sm text-v2-text-secondary">
          {s["remindersLog.numbersUnavailable"]}
        </p>
      ) : (
        <>
          <dl className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.key} data-testid={`reminder-numbers-${r.key}`} className="flex flex-col gap-0.5">
                <dt className="text-sm text-v2-text-secondary">{r.label}</dt>
                <dd className="text-sm font-medium tabular-nums text-v2-text-primary">
                  {s["remindersLog.numbersChannelSms"]}:{" "}
                  <span data-testid={`reminder-numbers-${r.key}-sms`}>{r.sms}</span>
                  {" · "}
                  {s["remindersLog.numbersChannelEmail"]}:{" "}
                  <span data-testid={`reminder-numbers-${r.key}-email`}>{r.email}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-v2-text-secondary">{s["remindersLog.numbersNote"]}</p>
        </>
      )}
    </section>
  );
}
