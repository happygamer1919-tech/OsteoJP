"use client";

import { useState } from "react";
import { Button, GlassPanel, Select, StatusChip } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import { TimeFieldInput } from "@/components/time-field-input";
import type { InspectedDay } from "@/lib/scheduling/schedule-inspection";
import type { ScheduleRule } from "@/lib/scheduling/availability";
import {
  dayEditBlockingReasons,
  draftFromDay,
  type DayEditDraft,
} from "@/lib/scheduling/inspector-edit";

/**
 * SCHED-09 — the read-only schedule inspector.
 *
 * ==========================================================================
 * IT RENDERS WHAT IT IS GIVEN AND DECIDES NOTHING.
 * ==========================================================================
 * Every day, window, location and label in here came out of
 * `inspectSchedule`, which came out of `getTherapistAvailability` - the same
 * resolver the agenda books against. This component holds NO weekday
 * arithmetic, NO validity comparison and NO location filtering, deliberately:
 * the moment it computed any of that it would be a second opinion, and a second
 * opinion that agrees is indistinguishable from one that is about to disagree.
 *
 * THE THREE LABELS ARE THE OWNER'S (SR-37) and the middle one is honest about
 * its own limits: `dia_definido` covers BOTH semanas alternadas and dia a dia,
 * because those two write byte-identical rows and nothing stored can separate
 * them. Its tooltip says so rather than leaving the reader to assume the
 * inspector knows something it does not.
 */

const RULE_LABEL: Record<ScheduleRule, string> = {
  base: s["inspector.ruleBase"],
  dia_definido: s["inspector.ruleDiaDefinido"],
  excecao: s["inspector.ruleExcecao"],
};
const RULE_HINT: Record<ScheduleRule, string> = {
  base: s["inspector.ruleBaseHint"],
  dia_definido: s["inspector.ruleDiaDefinidoHint"],
  excecao: s["inspector.ruleExcecaoHint"],
};
const RULE_TONE: Record<ScheduleRule, "neutral" | "success" | "warning"> = {
  base: "neutral",
  dia_definido: "success",
  excecao: "warning",
};

const WEEKDAY_KEY = [
  "admin.workingHours.sun",
  "admin.workingHours.mon",
  "admin.workingHours.tue",
  "admin.workingHours.wed",
  "admin.workingHours.thu",
  "admin.workingHours.fri",
  "admin.workingHours.sat",
] as const;

/** "seg, 07/09" — short weekday plus the date, so a row is identifiable alone. */
function dayLabel(date: string, weekday: number): string {
  const [, m, d] = date.split("-");
  return `${s[WEEKDAY_KEY[weekday]!].slice(0, 3)}, ${d}/${m}`;
}

export function ScheduleInspector({
  days,
  therapists,
  therapistId,
  period,
  locations,
  onTherapistChange,
  onPeriodChange,
  onSaveDay,
  onRemoveBlock,
  onEditBlock,
}: {
  days: InspectedDay[];
  therapists: { id: string; label: string }[];
  therapistId: string;
  period: string;
  /** SCHED-10: the clinics an edited day can be moved to. Empty disables editing. */
  locations?: { id: string; name: string }[];
  onTherapistChange: (id: string) => void;
  onPeriodChange: (p: string) => void;
  /**
   * SCHED-10: save ONE day. Returns the collision dates when the day already
   * carries dated work and the caller has not asked to replace it, so the row
   * can offer that as a second, explicit action.
   */
  onSaveDay?: (
    date: string,
    draft: DayEditDraft,
    opts: { replace?: boolean },
  ) => Promise<{ ok: boolean; collisionDates?: string[]; error?: string }>;
  /**
   * SCHED-21 - the two things a block row can do, supplied by the page because
   * only the page knows WHOSE blocks these are.
   *
   * THE INSPECTOR IS WHERE THE PROBLEM IS VISIBLE AND IT OFFERED NOTHING. The
   * affordance to remove a block lived only inside the Bloquear horario modal,
   * below nineteen expired entries, on a screen you reach from somewhere else.
   * A row that shows a block and cannot act on it is the shape that made the
   * owner report there was no UI at all.
   */
  onRemoveBlock?: (blockId: string) => void;
  onEditBlock?: (blockId: string) => void;
}) {
  // WHICH ROW IS OPEN, by date. One at a time: two open editors on one screen
  // invite a save that reads as applying to both.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DayEditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowStatus, setRowStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [collisions, setCollisions] = useState<string[] | null>(null);
  const canEdit = onSaveDay != null && (locations?.length ?? 0) > 0;
  /**
   * THE THERAPIST THIS PANEL IS SHOWING, RESOLVED AGAINST THE ROSTER - or null.
   *
   * Looked up rather than trusted: `therapistId` is a URL parameter, and a stale
   * or hand-edited `?t=` naming somebody who is not on this roster must produce
   * "nothing chosen" rather than a name printed over an empty table. The page
   * already validates it the same way; agreeing here means the panel cannot
   * render a name the rows below do not belong to.
   */
  const selected = therapists.find((t) => t.id === therapistId) ?? null;

  const openEditor = (day: InspectedDay) => {
    setEditing(day.date);
    setDraft(draftFromDay(day, locations?.[0]?.id ?? ""));
    setRowStatus(null);
    setCollisions(null);
  };
  const closeEditor = () => {
    setEditing(null);
    setDraft(null);
    setRowStatus(null);
    setCollisions(null);
  };

  const save = async (date: string, replace: boolean) => {
    if (!draft || !onSaveDay) return;
    setBusy(true);
    const res = await onSaveDay(date, draft, { replace });
    setBusy(false);
    if (!res.ok) {
      // A DAY THAT ALREADY CARRIES DATED WORK IS REPORTED, NOT OVERWRITTEN. The
      // second action below is the explicit replace, exactly as the alternating
      // and day-by-day panels do it: rewriting one person's dated schedule from
      // another surface, silently, is not a thing this system does.
      if (res.collisionDates && res.collisionDates.length > 0) {
        setCollisions(res.collisionDates);
        setRowStatus(null);
        return;
      }
      setCollisions(null);
      setRowStatus({ tone: "err", text: s["inspector.editError"] });
      return;
    }
    closeEditor();
  };

  return (
    <GlassPanel className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-v2-text-primary">{s["inspector.title"]}</h2>
        <p className="text-sm text-v2-text-secondary">{s["inspector.subtitle"]}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["inspector.therapist"]}</span>
          {/* A TEST ID, because the accessible name of a select wrapped in a
              <label> includes its OPTION text - so "Terapeuta" is never an exact
              label match and a substring one is ambiguous on a page that has a
              Terapeuta control per schedule card. */}
          <Select
            value={therapistId}
            data-testid="inspector-therapist"
            onChange={(e) => onTherapistChange(e.target.value)}
          >
            {/* LE-inspector-and-editor-select-different-therapists: "nobody" is
                a REAL, REACHABLE option, not a rendering accident. The page no
                longer defaults to therapists[0], so a <Select> whose value is ""
                with no matching <option> would show the first name while
                holding none - a control lying about its own state, which is a
                sharper version of the defect being fixed. */}
            <option value="">{s["inspector.chooseTherapist"]}</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["inspector.period"]}</span>
          <Select
            value={period}
            data-testid="inspector-period"
            onChange={(e) => onPeriodChange(e.target.value)}
          >
            <option value="week">{s["inspector.periodWeek"]}</option>
            <option value="fortnight">{s["inspector.periodFortnight"]}</option>
            <option value="month">{s["inspector.periodMonth"]}</option>
          </Select>
        </label>
      </div>

      {therapists.length === 0 ? (
        <p className="text-sm text-v2-text-secondary">{s["inspector.empty"]}</p>
      ) : selected === null ? (
        /* NOTHING CHOSEN, NOTHING SHOWN, AND IT SAYS SO. An empty table would
           read as "this person works no days"; a table for whoever happened to
           be first in the roster is the defect this card exists to remove. */
        <p data-testid="inspector-none-chosen" className="text-sm text-v2-text-secondary">
          {s["inspector.noneChosen"]}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* WHOSE WEEK THIS IS, IN PROSE, BESIDE THE ANSWER ITSELF.
              The <Select> above already carries the name, but a dropdown is a
              CONTROL: it is read as "what you may choose", not as "what you are
              looking at". The owner's ruling asks each surface to state whose
              week it is showing at the moment of the action, and the moment of
              the action is when somebody reads a row - not when they last
              touched the filter. */}
          <p data-testid="inspector-showing" className="text-sm text-v2-text-secondary">
            {s["inspector.showing"]}{" "}
            <span className="font-medium text-v2-text-primary">{selected.label}</span>
          </p>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm" data-testid="inspector-table">
            <thead>
              <tr className="border-b border-v2-border text-left text-xs text-v2-text-secondary">
                <th className="py-2 pr-3 font-medium">{s["admin.workingHours.weekday"]}</th>
                <th className="py-2 pr-3 font-medium">{s["admin.workingHours.hours"]}</th>
                <th className="py-2 pr-3 font-medium">{s["admin.workingHours.location"]}</th>
                <th className="py-2 font-medium">{s["inspector.period"]}</th>
                {canEdit && <th className="py-2 pl-3 font-medium">{s["common.edit"]}</th>}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                // A DAY WITH NO WINDOWS IS A ROW, NOT AN ABSENCE FROM THE TABLE.
                // "Not working" and "not shown" are different facts, and a table
                // that silently omits the second teaches nobody anything.
                const rows = day.windows.length === 0 ? [null] : day.windows;
                return [
                  ...rows.map((w, i) => (
                  <tr
                    key={`${day.date}-${i}`}
                    className="border-b border-v2-border/60 last:border-0"
                    data-testid={`inspector-row-${day.date}`}
                  >
                    <td className="py-2 pr-3 align-top text-v2-text-primary">
                      {i === 0 ? dayLabel(day.date, day.weekday) : ""}
                    </td>
                    <td className="py-2 pr-3 align-top tabular-nums text-v2-text-primary">
                      {w ? `${w.start}–${w.end}` : (
                        <span className="text-v2-text-secondary">{s["inspector.noWork"]}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top text-v2-text-secondary">
                      {w?.locationName ?? ""}
                    </td>
                    <td className="py-2 align-top">
                      {w &&
                        /* SCHED-21 - THE GREEN CHIP IS A CLAIM ABOUT BOOKABILITY
                           AND IT WAS BEING MADE ON DAYS NOTHING COULD BE BOOKED.
                           `dia_definido` renders in the SUCCESS tone, which on a
                           day a block has taken whole is the screen saying "this
                           is set up correctly" about a day the agenda greys out
                           end to end. The hours are still true and still shown -
                           the day IS defined - so the row keeps its times and
                           swaps the verdict for the one the agenda would give. */
                        (day.fullyBlocked ? (
                          <span title={s["inspector.blockedFullyHint"]}>
                            <StatusChip tone="warning">{s["inspector.blockedFully"]}</StatusChip>
                          </span>
                        ) : (
                          <span title={RULE_HINT[w.rule]}>
                            <StatusChip tone={RULE_TONE[w.rule]}>{RULE_LABEL[w.rule]}</StatusChip>
                          </span>
                        ))}
                    </td>
                    {canEdit && (
                      <td className="py-2 pl-3 align-top">
                        {/* ONE affordance per DAY, on its first line: a day is
                            what the write is bounded to, so offering the action
                            beside a second window would suggest a window-level
                            edit this path cannot express. */}
                        {i === 0 && (
                          <button
                            type="button"
                            className="text-xs underline decoration-dotted underline-offset-2 text-v2-text-secondary hover:text-v2-text-primary"
                            data-testid={`inspector-edit-${day.date}`}
                            onClick={() => (editing === day.date ? closeEditor() : openEditor(day))}
                          >
                            {editing === day.date ? s["common.cancel"] : s["common.edit"]}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  )),
                  /* SCHED-21 - THE BLOCK SITS UNDER THE DAY IT BLOCKS.
                     These rows used to be appended AFTER the entire table, so a
                     blocked Monday and the block that blocked it could be twenty
                     rows apart, and nothing on the Monday row referred to it.
                     Rendering them inline is the whole fix: the reader sees the
                     hours and the thing that cancels them in one glance. */
                  ...day.blocks.map((b) => (
                    <tr
                      key={`${day.date}-b-${b.blockId}`}
                      className="border-b border-v2-border/60 bg-amber-50/40 last:border-0"
                      data-testid={`inspector-block-${day.date}`}
                    >
                      <td className="py-2 pr-3 align-top text-v2-text-secondary" />
                      <td className="py-2 pr-3 align-top tabular-nums text-v2-text-primary">
                        {/* CLIPPED TO THE DAY, and an all-day block says so in a
                            word. The old rendering printed the row's raw bounds,
                            so a five-day absence showed `00:00-00:00` under each
                            of its days - the same two midnights three times over,
                            which reads as a broken time rather than as a day. */}
                        {b.allDay ? s["inspector.blockAllDay"] : `${b.start}–${b.end}`}
                        {(b.continuesBefore || b.continuesAfter) && (
                          <span className="ml-1 text-xs text-v2-text-secondary">
                            ({s["inspector.blockContinues"]})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 align-top text-v2-text-secondary">
                        {b.note ? (
                          <span className="font-medium text-v2-text-primary">{b.note}</span>
                        ) : (
                          <span className="italic">{b.reason}</span>
                        )}
                      </td>
                      <td className="py-2 align-top">
                        <span title={RULE_HINT.excecao}>
                          <StatusChip tone={RULE_TONE.excecao}>{RULE_LABEL.excecao}</StatusChip>
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-2 pl-3 align-top">
                          <span className="flex gap-2">
                            {onEditBlock && (
                              <button
                                type="button"
                                className="text-xs underline decoration-dotted underline-offset-2 text-v2-text-secondary hover:text-v2-text-primary"
                                data-testid={`inspector-block-edit-${b.blockId}`}
                                onClick={() => onEditBlock(b.blockId)}
                              >
                                {s["common.edit"]}
                              </button>
                            )}
                            {onRemoveBlock && (
                              <button
                                type="button"
                                className="text-xs underline decoration-dotted underline-offset-2 text-red-700 hover:text-red-900"
                                data-testid={`inspector-block-remove-${b.blockId}`}
                                onClick={() => {
                                  // A block removal frees availability and
                                  // touches no appointment, so it is safe - but
                                  // it is still somebody else's schedule, and an
                                  // undo does not exist.
                                  if (window.confirm(s["inspector.blockRemoveConfirm"])) {
                                    onRemoveBlock(b.blockId);
                                  }
                                }}
                              >
                                {s["admin.workingHours.blockRemove"]}
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  )),
                ];
              })}
              {/* THE EDITOR IS ITS OWN ROW, under the day it edits, so nothing
                  about the day's rendering moves when it opens. */}
              {canEdit && editing !== null && draft !== null && (
                <tr data-testid="inspector-editor">
                  <td colSpan={5} className="py-3">
                    <div className="flex flex-col gap-3 rounded-v2 border border-v2-border bg-v2-surface p-3">
                      <p className="text-sm text-v2-text-primary">
                        {s["inspector.editTitle"]} {editing}
                      </p>

                      {/* NO "does not work" OPTION HERE, and that is the write
                          path's ruling rather than an omission:
                          applyDayByDaySchedule refuses an empty window because
                          "the deliberate version has its own tool: blocked time
                          removes availability without touching the schedule that
                          resumes afterwards". Offering it here would put a
                          refusal behind a checkbox. */}
                      <p className="text-xs text-v2-text-secondary">{s["inspector.editAbsenceHint"]}</p>

                      {(
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium">{s["admin.workingHours.location"]}</span>
                            <Select
                              value={draft.locationId}
                              data-testid="inspector-edit-location"
                              onChange={(e) => setDraft({ ...draft, locationId: e.target.value })}
                            >
                              {(locations ?? []).map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </Select>
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium">{s["admin.workingHours.start"]}</span>
                            <TimeFieldInput
                              name="inspectorStart"
                              value={draft.startTime}
                              onChange={(v) => setDraft({ ...draft, startTime: v })}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="font-medium">{s["admin.workingHours.end"]}</span>
                            <TimeFieldInput
                              name="inspectorEnd"
                              value={draft.endTime}
                              onChange={(v) => setDraft({ ...draft, endTime: v })}
                            />
                          </label>
                        </div>
                      )}

                      {(() => {
                        const blocking = dayEditBlockingReasons(draft);
                        return (
                          <>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => void save(editing, false)}
                                disabled={busy || blocking.length > 0}
                                data-testid="inspector-edit-save"
                              >
                                {s["common.save"]}
                              </Button>
                              <Button variant="secondary" onClick={closeEditor} disabled={busy}>
                                {s["common.cancel"]}
                              </Button>
                            </div>
                            {blocking.length > 0 && (
                              <ul
                                className="list-disc pl-5 text-sm text-v2-text-secondary"
                                data-testid="inspector-edit-blocked"
                              >
                                {blocking.map((key) => (
                                  <li key={key}>{s[key as keyof typeof s]}</li>
                                ))}
                              </ul>
                            )}
                          </>
                        );
                      })()}

                      {collisions && collisions.length > 0 && (
                        <div
                          role="status"
                          data-testid="inspector-edit-collision"
                          className="flex flex-col gap-2 rounded-v2 border border-v2-border p-3"
                        >
                          <p className="text-sm text-v2-text-primary">{s["schedule.windowCollision"]}</p>
                          <ul className="list-disc pl-5 text-sm text-v2-text-secondary">
                            {collisions.map((d) => (
                              <li key={d}>{d}</li>
                            ))}
                          </ul>
                          <Button
                            variant="secondary"
                            onClick={() => void save(editing, true)}
                            disabled={busy}
                            data-testid="inspector-edit-replace"
                          >
                            {s["schedule.windowReplace"]}
                          </Button>
                        </div>
                      )}

                      {rowStatus && (
                        <p
                          role="status"
                          data-testid="inspector-edit-status"
                          className={
                            rowStatus.tone === "ok"
                              ? "text-sm text-v2-text-primary"
                              : "text-sm text-red-800"
                          }
                        >
                          {rowStatus.text}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
