import { Card } from "@osteojp/ui";
import { getStrings, type Locale } from "@osteojp/i18n";

import { assignTherapistAction, removeTherapistAction } from "./care-team-actions";

/** One entry on the card. `source` and `assignedAt` are CARE-02c's. */
export type CareTeamCardMember = {
  userId: string;
  fullName: string;
  /** "automatic" when a booking wrote the row; "manual" when Atribuir did. */
  source: "manual" | "automatic";
  assignedAt: Date;
};

/**
 * Europe/Lisbon, day precision. The clinic reads these dates against its own
 * calendar, and a UTC day would put an evening assignment on the next day.
 */
const assignedDateFmt = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * CARE-01 — "Terapeutas atribuídos" on the patient ficha.
 *
 * A list, an add control and a per-row remove control, for the roles holding
 * `care_team:manage` (reception and owner); a therapist gets the list alone
 * (`readOnly`, below). The page decides which, because the page is where
 * `ctx.role` lives and a component that re-derived it would be a second copy of
 * the rule.
 *
 * PER-ROW REMOVE, NOT A CHECKBOX SET. The Equipa "Gerir" modal replaces a whole
 * membership set in one submit, which cannot express a SOFT removal: the row has
 * to be updated rather than absent, so that who-was-on-the-team-when survives.
 * Each row therefore carries its own tiny form, the shape TherapistBlocks uses.
 *
 * CARE-02c: EACH ENTRY SAYS HOW IT GOT THERE, AND WHEN. A booking now adds its
 * therapist automatically, so the list mixes two kinds. Remover is offered on a
 * MANUAL entry only; removeTherapist refuses an automatic one on the server too.
 *
 * CARE-02b: `readOnly` renders the same list with no control at all, which is
 * the card a therapist sees. CARE-02a (0098) wired it: the page renders it for a
 * therapist only when `listCareTeamForTherapist` read the whole team (the
 * patient is in the clinic-limited care-team set and the list names them), so
 * it never says "Nenhum terapeuta atribuído", or lists the viewer alone, about
 * a patient whose team the viewer cannot read (not on it, on it at another
 * clinic, or 0098 not yet applied).
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
  readOnly = false,
}: {
  patientId: string;
  locale: Locale;
  members: CareTeamCardMember[];
  /**
   * Assignable therapists, minus the ones already on the team.
   *
   * `{ id, label }` is the repo's own `Option` shape (lib/scheduling/types.ts),
   * taken as-is rather than remapped at the call site: a second shape for the
   * same list is a second thing to keep in step.
   */
  candidates: { id: string; label: string }[];
  error?: boolean;
  /** CARE-02b: the list alone, with no Atribuir and no Remover. */
  readOnly?: boolean;
}) {
  const s = getStrings(locale);
  const assigned = new Set(members.map((m) => m.userId));
  const pickable = readOnly ? [] : candidates.filter((c) => !assigned.has(c.id));

  return (
    <Card title={s["patients.careTeamTitle"]}>
      <p className="mb-1 text-body-sm text-text-secondary">{s["patients.careTeamHelp"]}</p>
      <p className="mb-3 text-body-sm text-text-secondary">{s["patients.careTeamAutoHelp"]}</p>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-error">
          {s["patients.careTeamError"]}
        </p>
      ) : null}

      {members.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{s["patients.careTeamEmpty"]}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="care-team-list">
          {members.map((m) => {
            const when = assignedDateFmt.format(m.assignedAt);
            const provenance =
              m.source === "automatic"
                ? s["patients.careTeamSourceAuto"].replace("{date}", when)
                : s["patients.careTeamSourceManual"].replace("{date}", when);
            return (
              <li
                key={m.userId}
                data-testid="care-team-member"
                data-source={m.source}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-sm text-text-primary">{m.fullName}</span>
                  <span className="text-body-sm text-text-secondary">{provenance}</span>
                </span>
                {!readOnly && m.source === "manual" ? (
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
                ) : null}
              </li>
            );
          })}
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
