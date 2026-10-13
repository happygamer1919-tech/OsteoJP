import { Card } from "@osteojp/ui";
import { getStrings, type Locale } from "@osteojp/i18n";

import { setSurveySwitchAction } from "./survey-switch-actions";

/**
 * SAT-01 (S8) - "Avaliações de satisfação" on the patient ficha: the patient's
 * survey switch (copy texts 58 to 60).
 *
 * On by default. Off, no satisfaction survey is sent to this patient, by the
 * automatic send or by staff. The patient can turn it off on the survey page;
 * staff turn it off here when the patient asks the clinic, and back on.
 *
 * THE PAGE DECIDES WHETHER THIS IS DRAWN (`offersSurveySwitch`): only for the
 * roles that set it, and never while the survey is switched off.
 *
 * NO CLIENT JAVASCRIPT, like the care team card beside it. The switch is a
 * submit button with `role="switch"`: it posts the value it would change to,
 * and the action revalidates and redirects.
 */
export function SurveySwitchCard({
  patientId,
  locale,
  enabled,
  error,
}: {
  patientId: string;
  locale: Locale;
  /** The switch as the database holds it. */
  enabled: boolean;
  /** The last change was not saved. */
  error?: boolean;
}) {
  const s = getStrings(locale);

  return (
    <Card title={s["patients.surveySwitchTitle"]}>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-error">
          {/* The sentence the card above uses for a change that was not saved. */}
          {s["patients.careTeamError"]}
        </p>
      ) : null}

      <form action={setSurveySwitchAction} className="flex items-center justify-between gap-4">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <span id="survey-switch-label" className="text-sm text-text-primary">
          {s["patients.surveySwitchLabel"]}
        </span>
        {/* The Switch of the design system, as a button: 36 by 20 track, 16px thumb. */}
        <button
          type="submit"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="survey-switch-label"
          aria-describedby={enabled ? undefined : "survey-switch-note"}
          data-testid="ficha-survey-switch"
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
            enabled ? "bg-accent-2-600" : "bg-neutral-300"
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-fast ease-standard ${
              enabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </form>

      {enabled ? null : (
        <p id="survey-switch-note" className="mt-3 text-body-sm text-text-secondary">
          {s["patients.surveySwitchOffNote"]}
        </p>
      )}
    </Card>
  );
}
