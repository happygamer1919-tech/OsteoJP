import { s } from "@/lib/i18n";

/**
 * AI-04 — reception's list of recordings that never reached the AI partner.
 *
 * A SERVER COMPONENT WITH NO ACTIONS, deliberately. Every other block on this
 * page carries work a person can do: confirm a pedido, convert a guest request,
 * mark notifications read. There is nothing to press here — the recording is
 * gone, the partner will never receive it, and no button this screen could
 * offer would change that. Adding one would be worse than useless: a "retry"
 * that cannot succeed is a promise, and this whole family of cards exists
 * because a promise was made ("O processamento será retomado") that nothing
 * kept.
 *
 * SO THE ONLY JOB IS TO SAY WHICH CONSULTATION, WHOSE, AND WHEN, in enough
 * detail that a clinician recognises the appointment and can write the note
 * from memory before they stop remembering it.
 */

export type StuckConsultationRow = {
  id: string;
  patientName: string | null;
  clinicianName: string | null;
  /** Preformatted in Europe/Lisbon by the server — see page.tsx `stamp`. */
  when: string;
  lastAttempt: string | null;
  attemptCount: number;
  lastError: string | null;
};

export function StuckConsultations({ rows }: { rows: StuckConsultationRow[] }) {
  if (rows.length === 0) {
    /**
     * THE EMPTY STATE IS RENDERED RATHER THAN THE SECTION BEING HIDDEN, and it
     * says what empty MEANS rather than only that it is empty.
     *
     * INC-05 was a broken deployment rendering "you have no appointments" for a
     * failed fetch, and the owner found it by opening the app because no gate
     * could see it. A section that VANISHES when the list is empty is the same
     * conflation one step further on: absent and healthy look identical, and a
     * reader who has never seen the section cannot tell that a list exists at
     * all.
     *
     * The hint is the honest half. "Nothing has been given up on" is what an
     * empty list actually proves. It does not prove the delivery path works —
     * if the retry job stopped running, nothing would ever reach this state and
     * this box would look exactly like this.
     */
    return (
      <div className="rounded-v2 border border-v2-border bg-surface-muted p-8 text-center">
        <p className="text-sm font-medium text-v2-text-primary">
          {s["consultations.stuck.empty"]}
        </p>
        <p className="mt-1 text-sm text-v2-text-secondary">
          {s["consultations.stuck.emptyHint"]}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.id}
          /* role=alert is NOT used, and the omission is deliberate. These rows
             are present on load rather than arriving in response to something
             the reader just did, and an alert region announced on every page
             load is noise a screen-reader user learns to ignore. The section
             heading and the border carry it instead. */
          className="rounded-v2 border border-v2-red-700 bg-surface-base p-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-v2-text-primary">
              {r.patientName ?? s["consultations.stuck.unknownPatient"]}
            </span>
            <span className="text-xs text-v2-text-secondary">
              {s["consultations.stuck.recordedBy"]}{" "}
              {r.clinicianName ?? s["consultations.stuck.unknownClinician"]}
            </span>
          </div>

          {/* THE CONSULTATION INSTANT, not the failure instant, and it is the
              most prominent line for that reason: it is what a clinician
              recognises the appointment by. */}
          <p className="mt-1 text-sm text-v2-text-primary">{r.when}</p>

          <p className="mt-2 text-xs text-v2-text-secondary">
            {s["consultations.stuck.attempts"]}: {r.attemptCount}
            {r.lastAttempt !== null && (
              <>
                {" · "}
                {s["consultations.stuck.lastAttempt"]}: {r.lastAttempt}
              </>
            )}
          </p>

          {/* THE TECHNICAL REASON IS LABELLED AS TECHNICAL. Reception cannot act
              on "503" and should not be asked to; it is here so that whoever
              they escalate to does not have to go to the database for it.
              0064 constrains this column to a status code or an error class
              name, never a response body — so it is safe to render verbatim. */}
          <p className="mt-1 text-xs text-v2-text-secondary">
            {s["consultations.stuck.lastError"]}:{" "}
            <span className="font-mono">
              {r.lastError ?? s["consultations.stuck.noError"]}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
