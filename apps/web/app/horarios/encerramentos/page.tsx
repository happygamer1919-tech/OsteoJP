import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { Button, GlassPanel } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listAffectedVisits, listClosures } from "@/lib/admin/closed-days";
import { CLOSED_DAY_KINDS, MAX_LABEL_CHARS } from "@/lib/scheduling/closed-days-core";
import { closedDayKindLabel, closedDayReason } from "@/lib/scheduling/closed-day-labels";
import { formatTimeOfDay, lisbonParts, todayInLisbon } from "@/lib/scheduling/time";
import { DateFieldInput } from "@/components/date-field-input";
import {
  adminHelp,
  adminInputInline,
  adminLabel,
  adminTd,
  adminTh,
  adminTrBorder,
} from "@/app/admin/admin-ui";
import { createClosureAction, deleteClosureAction } from "./actions";
import { closureDates, closureHours, closuresBannerFor, ptDate } from "./banner";
import { RemoveClosureButton } from "./RemoveClosureButton";
import { ClosureHoursFields } from "./ClosureHoursFields";

/**
 * ENCERRAMENTOS DA CLINICA - a clinic's dated closures (Tier C 0114).
 *
 * Beside Bloqueios, under Horarios, because it is where the clinic manages who
 * and what is unavailable; but it is NOT a block. A block is one person and
 * "Guardar mesmo assim" overrides it; a closure is the building and nobody
 * books over it, staff or patient (owner, C1).
 *
 *   1. The form: Clinica (one clinic, or every clinic the actor manages, for a
 *      national holiday, C3), Dia inicial, Dia final, Dia inteiro or Das/Ate,
 *      Tipo, Descricao.
 *   2. On save, the visits already booked inside the new closure, for
 *      reception to move (C5). Nothing is cancelled and nobody is told.
 *   3. The list of closures that have not ended, each with its count of
 *      visits still inside it. One that has not started can be removed.
 *
 * WHO: `closures:manage` (owner, admin, reception; C2). A located receptionist
 * or admin sees and writes only their own clinics; the server re-checks every
 * write.
 *
 * Online booking shows no slot on a closed day and no note (C9): nothing on
 * this page is patient-facing.
 */
export default async function EncerramentosPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; c?: string }>;
}) {
  const actor = await requireRequestContext();
  if (!can(actor.role, "closures:manage")) redirect("/horarios");
  const { m, c } = await searchParams;

  const data = await listClosures(actor);
  const shownIds = (c ?? "").split(",").filter(Boolean);
  const affected = shownIds.length > 0 ? await listAffectedVisits(actor, shownIds) : [];
  const banner = closuresBannerFor(m);
  const today = todayInLisbon();
  const single = data.clinics.length === 1 ? data.clinics[0]!.id : "";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/horarios"
          className="w-fit text-sm text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["closures.back"]}
        </Link>
        <h1 className="text-2xl font-semibold text-v2-text-primary">{s["closures.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["closures.subtitle"]}</p>
      </header>

      {banner && (
        <p
          role="status"
          data-testid="closures-banner"
          className={
            banner.tone === "err"
              ? "rounded-v2 border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
              : banner.tone === "warn"
                ? "rounded-v2 border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
                : "rounded-v2 border border-v2-border bg-v2-surface px-4 py-2 text-sm text-v2-text-primary"
          }
        >
          {banner.text}
        </p>
      )}

      {!data.available ? (
        <GlassPanel className="p-6">
          <p className="text-sm text-v2-text-secondary" data-testid="closures-unavailable">
            {s["closures.unavailable"]}
          </p>
        </GlassPanel>
      ) : data.clinics.length === 0 ? (
        <GlassPanel className="p-6">
          <p className="text-sm text-v2-text-secondary">{s["closures.noClinics"]}</p>
        </GlassPanel>
      ) : (
        <>
          {/* ============================================================ */}
          {/* 1. Adicionar encerramento                                     */}
          {/* ============================================================ */}
          <GlassPanel className="p-6">
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-semibold text-v2-text-primary">{s["closures.addHeading"]}</h2>
              <form action={createClosureAction} className="flex flex-col gap-4" data-testid="closure-form">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="flex flex-col gap-1">
                    <label htmlFor="closure-clinic" className={adminLabel}>
                      {s["closures.clinic"]}
                    </label>
                    <select
                      id="closure-clinic"
                      name="locationId"
                      required
                      defaultValue={single}
                      className={adminInputInline}
                      data-testid="closure-clinic-select"
                    >
                      {!single && (
                        <option value="" disabled>
                          {s["closures.clinicChoose"]}
                        </option>
                      )}
                      {data.clinics.length > 1 && <option value="all">{s["closures.allClinics"]}</option>}
                      {data.clinics.map((cl) => (
                        <option key={cl.id} value={cl.id}>
                          {cl.name}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className={adminLabel}>{s["closures.startDay"]}</span>
                    <DateFieldInput name="startsOn" required min={today} label={s["closures.startDay"]} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className={adminLabel}>{s["closures.endDay"]}</span>
                    <DateFieldInput name="endsOn" min={today} label={s["closures.endDay"]} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <label htmlFor="closure-kind" className={adminLabel}>
                      {s["closures.kind"]}
                    </label>
                    <select
                      id="closure-kind"
                      name="kind"
                      required
                      defaultValue="feriado_nacional"
                      className={adminInputInline}
                      data-testid="closure-kind-select"
                    >
                      {CLOSED_DAY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {closedDayKindLabel(k)}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="flex min-w-48 flex-1 flex-col gap-1">
                    <label htmlFor="closure-label" className={adminLabel}>
                      {s["closures.label"]}
                    </label>
                    <input
                      id="closure-label"
                      name="label"
                      maxLength={MAX_LABEL_CHARS}
                      placeholder={s["closures.labelPlaceholder"]}
                      className={adminInputInline}
                      data-testid="closure-label"
                    />
                  </span>
                </div>
                <fieldset className="flex flex-wrap items-end gap-3">
                  <legend className="sr-only">{s["closures.hours"]}</legend>
                  <ClosureHoursFields
                    labels={{
                      wholeDay: s["closures.wholeDay"],
                      wholeDayNote: s["closures.wholeDayNote"],
                      from: s["closures.from"],
                      fromHours: s["closures.fromHours"],
                      fromMinutes: s["closures.fromMinutes"],
                      to: s["closures.to"],
                      toHours: s["closures.toHours"],
                      toMinutes: s["closures.toMinutes"],
                    }}
                  />
                  <Button type="submit" variant="primary" size="sm" data-testid="closure-add">
                    {s["closures.add"]}
                  </Button>
                </fieldset>
                <p className={adminHelp}>{s["closures.formHelp"]}</p>
                <p className={adminHelp}>{s["closures.formHelpStarted"]}</p>
              </form>
            </div>
          </GlassPanel>

          {/* ============================================================ */}
          {/* 2. The visits already booked inside the closure just saved   */}
          {/* ============================================================ */}
          {shownIds.length > 0 && (
            <GlassPanel className="p-6">
              <div className="flex flex-col gap-3" data-testid="closure-affected">
                <h2 className="text-base font-semibold text-v2-text-primary">
                  {s["closures.affectedHeading"].replace("{n}", String(affected.length))}
                </h2>
                {affected.length === 0 ? (
                  <p className="text-sm text-v2-text-secondary">{s["closures.affectedNone"]}</p>
                ) : (
                  <>
                    <p className={adminHelp}>{s["closures.affectedHelp"]}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className={adminTrBorder}>
                            <th className={adminTh}>{s["closures.col.date"]}</th>
                            <th className={adminTh}>{s["closures.col.time"]}</th>
                            <th className={adminTh}>{s["closures.col.clinic"]}</th>
                            <th className={adminTh}>{s["closures.col.patient"]}</th>
                            <th className={adminTh}>{s["closures.col.therapist"]}</th>
                            <th className={adminTh}>{s["closures.col.actions"]}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {affected.map((v) => {
                            const date = lisbonParts(new Date(v.startsAt)).date;
                            return (
                              <tr key={v.id} className={adminTrBorder} data-testid="closure-affected-row">
                                <td className={adminTd}>{ptDate(date)}</td>
                                <td className={`${adminTd} tabular-nums`}>
                                  {formatTimeOfDay(new Date(v.startsAt))} - {formatTimeOfDay(new Date(v.endsAt))}
                                </td>
                                <td className={adminTd}>{v.locationName}</td>
                                <td className={adminTd}>{v.patientName}</td>
                                <td className={adminTd}>{v.practitionerName}</td>
                                <td className={adminTd}>
                                  <Link
                                    href={`/agenda?view=day&date=${date}`}
                                    className="text-sm text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                                  >
                                    {s["closures.openAgenda"]}
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </GlassPanel>
          )}

          {/* ============================================================ */}
          {/* 3. Closures that have not ended                               */}
          {/* ============================================================ */}
          <GlassPanel className="p-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-v2-text-primary">{s["closures.listHeading"]}</h2>
              {data.closures.length === 0 ? (
                <p className="text-sm text-v2-text-secondary">{s["closures.empty"]}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="closure-list">
                    <thead>
                      <tr className={adminTrBorder}>
                        <th className={adminTh}>{s["closures.col.clinic"]}</th>
                        <th className={adminTh}>{s["closures.col.dates"]}</th>
                        <th className={adminTh}>{s["closures.col.hours"]}</th>
                        <th className={adminTh}>{s["closures.col.reason"]}</th>
                        <th className={adminTh}>{s["closures.col.visits"]}</th>
                        <th className={adminTh}>{s["closures.col.status"]}</th>
                        <th className={adminTh}>{s["closures.col.actions"]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.closures.map((r) => {
                        const dates = closureDates(r.startsOn, r.endsOn);
                        const reason = closedDayReason(r.kind, r.label);
                        return (
                          <tr key={r.id} className={adminTrBorder} data-testid="closure-row">
                            <td className={adminTd}>{r.locationName}</td>
                            <td className={`${adminTd} tabular-nums`}>{dates}</td>
                            <td className={`${adminTd} tabular-nums`}>{closureHours(r.closedFrom, r.closedTo)}</td>
                            <td className={adminTd}>{reason}</td>
                            <td className={adminTd}>
                              {r.affectedCount > 0 ? (
                                <Link
                                  href={`/horarios/encerramentos?c=${r.id}`}
                                  className="text-sm font-medium text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                                  data-testid="closure-visits-link"
                                >
                                  {s["closures.visitsToMove"].replace("{n}", String(r.affectedCount))}
                                </Link>
                              ) : (
                                <span className="text-v2-text-secondary">0</span>
                              )}
                            </td>
                            <td className={adminTd}>
                              <span className="inline-flex rounded-full border border-v2-border px-2 py-0.5 text-xs font-medium text-v2-text-secondary">
                                {r.started ? s["closures.status.ongoing"] : s["closures.status.upcoming"]}
                              </span>
                            </td>
                            <td className={adminTd}>
                              {r.started ? (
                                <span className="text-xs text-v2-text-secondary">{s["closures.cannotRemove"]}</span>
                              ) : (
                                <RemoveClosureButton
                                  id={r.id}
                                  line={`${r.locationName}, ${dates}, ${reason}`}
                                  action={deleteClosureAction}
                                  label={s["closures.remove"]}
                                  confirmText={s["closures.removeConfirm"]}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GlassPanel>
        </>
      )}
    </main>
  );
}
