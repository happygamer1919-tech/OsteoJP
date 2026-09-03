"use client";

import { GlassPanel, Select, StatusChip } from "@osteojp/ui";

import { s } from "@/lib/i18n";
import type { InspectedDay } from "@/lib/scheduling/schedule-inspection";
import type { ScheduleRule } from "@/lib/scheduling/availability";

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
  onTherapistChange,
  onPeriodChange,
}: {
  days: InspectedDay[];
  therapists: { id: string; label: string }[];
  therapistId: string;
  period: string;
  onTherapistChange: (id: string) => void;
  onPeriodChange: (p: string) => void;
}) {
  return (
    <GlassPanel className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-v2-text-primary">{s["inspector.title"]}</h2>
        <p className="text-sm text-v2-text-secondary">{s["inspector.subtitle"]}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["inspector.therapist"]}</span>
          <Select value={therapistId} onChange={(e) => onTherapistChange(e.target.value)}>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{s["inspector.period"]}</span>
          <Select value={period} onChange={(e) => onPeriodChange(e.target.value)}>
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
                  </tr>
                ));
              })}
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
