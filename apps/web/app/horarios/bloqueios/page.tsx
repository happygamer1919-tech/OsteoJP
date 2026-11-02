import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { can } from "@osteojp/auth";
import { Button, GlassPanel } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getAgendaOptions } from "@/lib/scheduling/data";
import { resolveScheduleScope } from "@/lib/admin/schedule-scope";
import { listBloqueios } from "@/lib/admin/weekly-blocks";
import {
  groupByWeekday,
  pontualLine,
  sortNewestFirst,
  weeklyLine,
  WEEKDAY_DISPLAY_ORDER,
} from "@/lib/scheduling/weekly-blocks-core";
import { TimeFieldInput } from "@/components/time-field-input";
import { DateFieldInput } from "@/components/date-field-input";
import { adminInputInline, adminLabel } from "@/app/admin/admin-ui";
import {
  createPontualBlockAction,
  createWeeklyBlockAction,
  deletePontualBlockAction,
  deleteWeeklyBlockAction,
} from "./actions";
import { PontualList, RemoveBlockButton } from "./BlockListControls";
import { bannerFor } from "./banner";

/** 0 = Sunday .. 6 = Saturday -> Fisiozero's labels ("2ª feiras" ... "Domingos"). */
const WEEKDAY_LABEL_KEY = {
  0: "blocks.weekday.sun",
  1: "blocks.weekday.mon",
  2: "blocks.weekday.tue",
  3: "blocks.weekday.wed",
  4: "blocks.weekday.thu",
  5: "blocks.weekday.fri",
  6: "blocks.weekday.sat",
} as const;

/**
 * BLOQUEIOS NA AGENDA / FERIAS - Fisiozero's panel, in structure and behaviour,
 * in OsteoJP's design.
 *
 *   1. "Modo REPETICAO SEMANAL": Terapeuta, Todas as (2as feiras .. Domingos),
 *      Das, Ate, add. The list is grouped under the weekday, each line
 *      "[Terapeuta]: HH:MM -- HH:MM" with a remove cross.
 *   2. "Modo PONTUAL": Terapeuta, time, "•", Dia inicial, "ate", time, Dia
 *      final, Motivo, add ("Adicionar Bloqueio Pontual"). Below: "Filtrar..."
 *      and the list, newest first, each line "Nome: YYYY-MM-DD (HH:MM:SS) ate
 *      YYYY-MM-DD (HH:MM:SS) | Motivo" with a remove cross.
 *
 * WHO: `schedule:manage`, with its existing scoping. A therapist sees and
 * manages their own blocks; a located reception or admin the therapists of
 * their clinics; the owner everyone. The roster is /horarios' roster
 * (getAgendaOptions, narrowed by the schedule scope), and only the members the
 * actor may manage appear in the dropdowns and the lists. Every write
 * re-checks its target on the server.
 *
 * The "Terapeuta" list holds therapists only. Fisiozero's also holds
 * resources ("Clinica OsteoJP LX", "Externos", "NESA"); a clinic-wide block is
 * an owner question carried in the pull request, not built here.
 */
export default async function BloqueiosPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requireRequestContext();
  if (!can(actor.role, "schedule:manage")) redirect("/horarios");
  const { m } = await searchParams;

  const options = await getAgendaOptions(actor);
  const scope = await resolveScheduleScope(actor);
  const roster =
    scope.kind === "self" ? options.therapists.filter((t) => t.id === scope.userId) : options.therapists;
  const data = await listBloqueios(
    actor,
    roster.map((t) => ({ id: t.id, label: t.label })),
  );
  const manageable = new Set(data.manageable);
  const therapists = roster.filter((t) => manageable.has(t.id));
  const single = therapists.length === 1 ? therapists[0]!.id : "";

  const weeklyGroups = groupByWeekday(data.weekly);
  const pontualRows = sortNewestFirst(data.pontual).map((r) => ({
    id: r.id,
    line: pontualLine(r, s["blocks.until"]),
  }));
  const banner = bannerFor(m);

  const therapistSelect = (id: string) => (
    <select
      id={id}
      name="userId"
      required
      defaultValue={single}
      className={adminInputInline}
      data-testid={`${id}-select`}
    >
      {!single && (
        <option value="" disabled>
          {s["blocks.therapistChoose"]}
        </option>
      )}
      {therapists.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/horarios"
          className="w-fit text-sm text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["blocks.back"]}
        </Link>
        <h1 className="text-2xl font-semibold text-v2-text-primary">{s["blocks.title"]}</h1>
        <p className="text-sm text-v2-text-secondary">{s["blocks.subtitle"]}</p>
      </header>

      {banner && (
        <p
          role="status"
          data-testid="blocks-banner"
          className={
            banner.tone === "err"
              ? "rounded-v2 border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800"
              : "rounded-v2 border border-v2-border bg-v2-surface px-4 py-2 text-sm text-v2-text-primary"
          }
        >
          {banner.text}
        </p>
      )}

      {therapists.length === 0 ? (
        <GlassPanel className="p-6">
          <p className="text-sm text-v2-text-secondary">{s["blocks.noTherapists"]}</p>
        </GlassPanel>
      ) : (
        <>
          {/* ============================================================ */}
          {/* 1. Modo REPETICAO SEMANAL                                     */}
          {/* ============================================================ */}
          <div data-testid="blocks-weekly">
          <GlassPanel className="p-6">
           <div className="flex flex-col gap-4">
            <h2 className="border-l-2 border-accent-1-700 pl-3 text-base font-semibold text-v2-text-primary">
              {s["blocks.weeklyHeading"]}
            </h2>
            {!data.weeklyAvailable ? (
              <p className="text-sm text-v2-text-secondary" data-testid="blocks-weekly-unavailable">
                {s["blocks.weeklyUnavailable"]}
              </p>
            ) : (
              <>
                <form action={createWeeklyBlockAction} className="flex flex-wrap items-end gap-3" data-testid="weekly-form">
                  <span className="flex flex-col gap-1">
                    <label htmlFor="weekly-therapist" className={adminLabel}>
                      {s["blocks.therapist"]}
                    </label>
                    {therapistSelect("weekly-therapist")}
                  </span>
                  <span className="flex flex-col gap-1">
                    <label htmlFor="weekly-weekday" className={adminLabel}>
                      {s["blocks.every"]}
                    </label>
                    <select
                      id="weekly-weekday"
                      name="weekday"
                      required
                      defaultValue=""
                      className={adminInputInline}
                      data-testid="weekly-weekday-select"
                    >
                      <option value="" disabled>
                        {s["blocks.every"]}
                      </option>
                      {WEEKDAY_DISPLAY_ORDER.map((wd) => (
                        <option key={wd} value={wd}>
                          {s[WEEKDAY_LABEL_KEY[wd]]}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="flex flex-col gap-1" role="group" aria-label={s["blocks.from"]}>
                    <span className={adminLabel} aria-hidden="true">
                      {s["blocks.from"]}
                    </span>
                    <TimeFieldInput name="startTime" step={5} hourLabel={s["blocks.startTime"]} minuteLabel={s["blocks.startTime"]} />
                  </span>
                  <span className="flex flex-col gap-1" role="group" aria-label={s["blocks.to"]}>
                    <span className={adminLabel} aria-hidden="true">
                      {s["blocks.to"]}
                    </span>
                    <TimeFieldInput name="endTime" step={5} hourLabel={s["blocks.endTime"]} minuteLabel={s["blocks.endTime"]} />
                  </span>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    aria-label={s["blocks.addWeekly"]}
                    title={s["blocks.addWeekly"]}
                    data-testid="weekly-add"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                  </Button>
                </form>

                {weeklyGroups.length === 0 ? (
                  <p className="text-sm text-v2-text-secondary">{s["blocks.weeklyEmpty"]}</p>
                ) : (
                  <div className="flex flex-col gap-4" data-testid="weekly-list">
                    {weeklyGroups.map((g) => (
                      <section key={g.weekday} aria-labelledby={`weekday-${g.weekday}`} data-testid={`weekly-group-${g.weekday}`}>
                        <h3 id={`weekday-${g.weekday}`} className="text-sm font-semibold text-v2-text-primary">
                          {s[WEEKDAY_LABEL_KEY[g.weekday as keyof typeof WEEKDAY_LABEL_KEY]]}
                        </h3>
                        <ul className="mt-1 flex flex-col divide-y divide-v2-border">
                          {g.rows.map((r) => {
                            const line = weeklyLine(r);
                            return (
                              <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm text-v2-text-primary" data-testid="weekly-row">
                                <span className="min-w-0 flex-1 tabular-nums">{line}</span>
                                <RemoveBlockButton
                                  id={r.id}
                                  line={`${s[WEEKDAY_LABEL_KEY[g.weekday as keyof typeof WEEKDAY_LABEL_KEY]]}, ${line}`}
                                  action={deleteWeeklyBlockAction}
                                  label={s["blocks.remove"]}
                                  confirmText={s["blocks.removeConfirm"]}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}
           </div>
          </GlassPanel>
          </div>

          {/* ============================================================ */}
          {/* 2. Modo PONTUAL                                               */}
          {/* ============================================================ */}
          <div data-testid="blocks-pontual">
          <GlassPanel className="p-6">
           <div className="flex flex-col gap-4">
            <h2 className="border-l-2 border-accent-1-700 pl-3 text-base font-semibold text-v2-text-primary">
              {s["blocks.pontualHeading"]}
            </h2>
            <form action={createPontualBlockAction} className="flex flex-wrap items-end gap-3" data-testid="pontual-form">
              <span className="flex flex-col gap-1">
                <label htmlFor="pontual-therapist" className={adminLabel}>
                  {s["blocks.therapist"]}
                </label>
                {therapistSelect("pontual-therapist")}
              </span>
              <span className="flex flex-col gap-1" role="group" aria-label={s["blocks.startTime"]}>
                <span className={adminLabel} aria-hidden="true">
                  {s["blocks.startTime"]}
                </span>
                <TimeFieldInput name="startTime" step={5} hourLabel={s["blocks.startTime"]} minuteLabel={s["blocks.startTime"]} />
              </span>
              <span aria-hidden="true" className="pb-2 text-v2-text-secondary">
                •
              </span>
              <span className="flex flex-col gap-1">
                <span className={adminLabel}>{s["blocks.startDay"]}</span>
                <DateFieldInput name="startDate" required label={s["blocks.startDay"]} />
              </span>
              <span className="pb-2 text-sm text-v2-text-secondary">{s["blocks.until"]}</span>
              <span className="flex flex-col gap-1" role="group" aria-label={s["blocks.endTime"]}>
                <span className={adminLabel} aria-hidden="true">
                  {s["blocks.endTime"]}
                </span>
                <TimeFieldInput name="endTime" step={5} hourLabel={s["blocks.endTime"]} minuteLabel={s["blocks.endTime"]} />
              </span>
              <span className="flex flex-col gap-1">
                <span className={adminLabel}>{s["blocks.endDay"]}</span>
                <DateFieldInput name="endDate" required label={s["blocks.endDay"]} />
              </span>
              <span className="flex min-w-48 flex-1 flex-col gap-1">
                <label htmlFor="pontual-note" className="sr-only">
                  {s["blocks.reason"]}
                </label>
                <input
                  id="pontual-note"
                  name="note"
                  required
                  maxLength={500}
                  placeholder={s["blocks.reason"]}
                  className={adminInputInline}
                  data-testid="pontual-note"
                />
              </span>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                aria-label={s["blocks.addPontual"]}
                title={s["blocks.addPontual"]}
                data-testid="pontual-add"
              >
                <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
              </Button>
            </form>
            <PontualList
              rows={pontualRows}
              action={deletePontualBlockAction}
              labels={{
                filter: s["blocks.filter"],
                empty: s["blocks.pontualEmpty"],
                filterEmpty: s["blocks.filterEmpty"],
                count: s["blocks.filterCount"],
                remove: s["blocks.remove"],
                removeConfirm: s["blocks.removeConfirm"],
              }}
            />
           </div>
          </GlassPanel>
          </div>
        </>
      )}
    </main>
  );
}
