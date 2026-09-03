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
}) {
  // WHICH ROW IS OPEN, by date. One at a time: two open editors on one screen
  // invite a save that reads as applying to both.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DayEditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowStatus, setRowStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [collisions, setCollisions] = useState<string[] | null>(null);
  const canEdit = onSaveDay != null && (locations?.length ?? 0) > 0;

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
      ) : (
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
                return rows.map((w, i) => (
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
                      {w && (
                        <span title={RULE_HINT[w.rule]}>
                          <StatusChip tone={RULE_TONE[w.rule]}>{RULE_LABEL[w.rule]}</StatusChip>
                        </span>
                      )}
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
                ));
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
              {days.flatMap((day) =>
                day.exceptions.map((x, i) => (
                  <tr key={`${day.date}-x-${i}`} className="border-b border-v2-border/60 last:border-0">
                    <td className="py-2 pr-3 align-top text-v2-text-primary">
                      {dayLabel(day.date, day.weekday)}
                    </td>
                    <td className="py-2 pr-3 align-top tabular-nums text-v2-text-primary">
                      {x.start}–{x.end}
                    </td>
                    <td className="py-2 pr-3 align-top text-v2-text-secondary">{x.reason}</td>
                    <td className="py-2 align-top">
                      <span title={RULE_HINT.excecao}>
                        <StatusChip tone={RULE_TONE.excecao}>{RULE_LABEL.excecao}</StatusChip>
                      </span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}
