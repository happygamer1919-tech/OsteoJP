import { Card } from "@osteojp/ui";
import { getStrings, type Locale } from "@osteojp/i18n";

import { assignTherapistAction, removeTherapistAction } from "./care-team-actions";

/**
 * CARE-01 — "Terapeutas atribuídos" on the patient ficha.
 *
 * A list, an add control and a per-row remove control. Rendered only for the
 * roles holding `care_team:manage` (reception and owner); the page decides that,
 * because the page is where `ctx.role` lives and a component that re-derived it
 * would be a second copy of the rule.
 *
 * PER-ROW REMOVE, NOT A CHECKBOX SET. The Equipa "Gerir" modal replaces a whole
 * membership set in one submit, which cannot express a SOFT removal: the row has
 * to be updated rather than absent, so that who-was-on-the-team-when survives.
 * Each row therefore carries its own tiny form, the shape TherapistBlocks uses.
 *
 * NO CLIENT JAVASCRIPT. Plain forms posting to server actions; the action
 * revalidates the path and redirects. That is the whole refresh mechanism on
 * this page already.
 */
export function CareTeamCard({
  patientId,
  locale,
  members,
  candidates,
  error,
}: {
  patientId: string;
  locale: Locale;
  members: { userId: string; fullName: string }[];
  /**
   * Assignable therapists, minus the ones already on the team.
   *
   * `{ id, label }` is the repo's own `Option` shape (lib/scheduling/types.ts),
   * taken as-is rather than remapped at the call site: a second shape for the
   * same list is a second thing to keep in step.
   */
  candidates: { id: string; label: string }[];
  error?: boolean;
}) {
  const s = getStrings(locale);
  const assigned = new Set(members.map((m) => m.userId));
  const pickable = candidates.filter((c) => !assigned.has(c.id));

  return (
    <Card title={s["patients.careTeamTitle"]}>
      <p className="mb-3 text-body-sm text-text-secondary">{s["patients.careTeamHelp"]}</p>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-error">
          {s["patients.careTeamError"]}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{s["patients.careTeamEmpty"]}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="care-team-list">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3">
              <span className="text-body-sm text-text-primary">{m.fullName}</span>
              <form action={removeTherapistAction}>
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="userId" value={m.userId} />
                <button
                  type="submit"
                  className="rounded border border-border px-2 py-1 text-body-sm text-text-secondary hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {s["patients.careTeamRemove"]}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {pickable.length > 0 ? (
        <form action={assignTherapistAction} className="mt-4 flex items-end gap-2">
          <input type="hidden" name="patientId" value={patientId} />
          <label className="flex flex-col gap-1 text-body-sm">
            <span className="text-text-secondary">{s["patients.careTeamPick"]}</span>
            <select
              name="userId"
              required
              aria-label={s["patients.careTeamPick"]}
              className="rounded border border-border bg-surface px-2 py-1"
            >
              {pickable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-brand-teal px-3 py-1.5 text-body-sm font-medium text-text-inverse hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {s["patients.careTeamAdd"]}
          </button>
        </form>
      ) : null}
    </Card>
  );
}
