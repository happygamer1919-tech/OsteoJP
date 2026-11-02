"use client";
import { useState, useTransition } from "react";
import { Button, DatePicker, Dialog, TimeField } from "@osteojp/ui";
import {
  EXPORT_TEXT_MAX,
  isExportDate,
  isExportText,
  isExportTime,
  type ExportOverride,
  type ExportRow,
} from "@/lib/clinical/report/export-overrides";
import { s } from "@/lib/i18n";

/**
 * RODICA-export-edit-before-download (owner ruling 2026-11-02): THE QUESTION
 * EVERY REGISTOS EXPORT ASKS BEFORE ANYTHING DOWNLOADS. Used by "Exportar
 * ficha" and both "PDF do episódio" buttons; the button mounts it on a press
 * and does the download with what it answers.
 *
 *   "Manter os dados da consulta" (the default): `onExport(null)`, the export
 *       exactly as before.
 *   "Alterar": the export's registos are asked for (`loadRows`, the server's
 *       own selection), one row each, with the appointment's date and hour and
 *       the heading the registo prints ("Conteúdo importado" for an imported
 *       one). Each value may be changed; an emptied text prints no heading.
 *       "Sem hora" removes a row's hour. With more than one registo, one date
 *       and hour (or "Sem hora") can be applied to all. Each row is a
 *       fieldset named by its caption, so its controls are told apart.
 *       "Exportar" sends every row (`onExport(rows)`).
 *
 * The values are checked here so a mistake is shown, and checked again by the
 * server, which refuses the export on any bad value. Nothing here or there
 * writes a registo: the change is the file's, and the audit row records it.
 */
type Mode = "keep" | "change";
type Edit = { date: string; time: string; text: string };

/** "YYYY-MM-DD" as dd/mm/aaaa, for the row's caption. */
function shownDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** What a row is called: its section, the appointment it came from, and its version after the first. */
function caption(row: ExportRow): string {
  const when = `${shownDate(row.date)} ${row.time === "" ? s["patients.exportEdit.noTime"] : row.time}`;
  return [
    row.group,
    s["patients.exportEdit.recordOf"].replace("{when}", when),
    row.version > 1 ? `${s["report.record.version"]} ${row.version}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ExportEditDialog({
  onClose,
  loadRows,
  onExport,
  testId,
}: {
  onClose: () => void;
  /** The export's registos and their defaults, from the server; `rows: null` when they cannot be read. */
  loadRows: () => Promise<{ rows: ExportRow[] | null }>;
  /** null: keep the appointment's details. A list: the value of every registo for this file. */
  onExport: (overrides: ExportOverride[] | null) => void;
  /** The prefix of every test id in the dialog. */
  testId: string;
}) {
  const [mode, setMode] = useState<Mode>("keep");
  const [rows, setRows] = useState<ExportRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [allDate, setAllDate] = useState("");
  const [allTime, setAllTime] = useState("");
  const [invalid, setInvalid] = useState(false);
  /** "Aplicar a todos" with "Sem hora": every row loses its hour. */
  const [allNoTime, setAllNoTime] = useState(false);
  const [loading, startLoading] = useTransition();

  function choose(next: Mode) {
    setMode(next);
    setInvalid(false);
    if (next !== "change" || rows !== null || loading) return;
    setLoadFailed(false);
    startLoading(async () => {
      const { rows: loaded } = await loadRows();
      if (!loaded || loaded.length === 0) {
        setLoadFailed(true);
        return;
      }
      setRows(loaded);
      setEdits(Object.fromEntries(loaded.map((r) => [r.recordId, { date: r.date, time: r.time, text: r.text }])));
    });
  }

  function edit(recordId: string, change: Partial<Edit>) {
    setEdits((prev) => ({ ...prev, [recordId]: { ...prev[recordId]!, ...change } }));
    setInvalid(false);
  }

  function applyAll() {
    if (!rows) return;
    setEdits((prev) =>
      Object.fromEntries(
        rows.map((r) => [
          r.recordId,
          {
            ...prev[r.recordId]!,
            ...(allDate ? { date: allDate } : {}),
            ...(allNoTime ? { time: "" } : allTime ? { time: allTime } : {}),
          },
        ]),
      ),
    );
    setInvalid(false);
  }

  function confirm() {
    if (mode === "keep") {
      onExport(null);
      return;
    }
    if (!rows) return;
    const out: ExportOverride[] = rows.map((r) => ({ recordId: r.recordId, ...edits[r.recordId]! }));
    if (!out.every((o) => isExportDate(o.date) && isExportTime(o.time) && isExportText(o.text))) {
      setInvalid(true);
      return;
    }
    onExport(out);
  }

  const field =
    "rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
  const radio = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

  return (
    <Dialog
      open
      onClose={onClose}
      title={s["patients.exportEdit.title"]}
      confirmLabel={s["patients.exportEdit.export"]}
      onConfirm={confirm}
      confirmDisabled={mode === "change" && rows === null}
      cancelLabel={s["common.cancel"]}
    >
      <div className="flex flex-col gap-3" data-testid={testId}>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-text-secondary">{s["patients.exportEdit.question"]}</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${testId}-mode`}
              checked={mode === "keep"}
              onChange={() => choose("keep")}
              className={radio}
              data-testid={`${testId}-keep`}
            />
            <span>{s["patients.exportEdit.keep"]}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`${testId}-mode`}
              checked={mode === "change"}
              onChange={() => choose("change")}
              className={radio}
              data-testid={`${testId}-change`}
            />
            <span>{s["patients.exportEdit.change"]}</span>
          </label>
        </fieldset>

        {mode === "change" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-secondary">{s["patients.exportEdit.note"]}</p>
            {rows === null && !loadFailed && (
              <p role="status" className="text-sm text-text-secondary">
                {s["patients.exportEdit.loading"]}
              </p>
            )}
            {loadFailed && (
              <p role="alert" className="text-sm text-error" data-testid={`${testId}-load-error`}>
                {s["patients.exportEdit.loadError"]}
              </p>
            )}

            {rows && rows.length > 1 && (
              <fieldset className="flex flex-col gap-2 rounded border border-border-strong p-3" data-testid={`${testId}-all`}>
                <legend className="px-1 text-sm font-medium">{s["patients.exportEdit.applyAllHeading"]}</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span>{s["patients.exportEdit.date"]}</span>
                    <DatePicker
                      value={allDate === "" ? null : allDate}
                      onChange={setAllDate}
                      triggerLabel={s["patients.exportEdit.date"]}
                      testId={`${testId}-all-date`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>{s["patients.exportEdit.time"]}</span>
                    <div data-testid={`${testId}-all-time`}>
                      <TimeField
                        value={allNoTime ? "" : allTime}
                        onChange={setAllTime}
                        step={5}
                        disabled={allNoTime}
                        hourLabel={s["patients.exportEdit.hours"]}
                        minuteLabel={s["patients.exportEdit.minutes"]}
                      />
                    </div>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allNoTime}
                      onChange={(e) => setAllNoTime(e.target.checked)}
                      className={radio}
                      data-testid={`${testId}-all-no-time`}
                    />
                    <span>{s["patients.exportEdit.clearTime"]}</span>
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={applyAll}
                    disabled={allDate === "" && allTime === "" && !allNoTime}
                    data-testid={`${testId}-apply-all`}
                  >
                    {s["patients.exportEdit.applyAll"]}
                  </Button>
                </div>
              </fieldset>
            )}

            {rows && (
              // Not a scroll box of its own: the DatePicker's calendar is an
              // absolute popover, and a scrolling list would clip it. The
              // dialog scrolls as a whole, as the Declaração's does.
              <ul className="flex flex-col gap-3" data-testid={`${testId}-rows`}>
                {rows.map((row) => {
                  const value = edits[row.recordId]!;
                  const name = caption(row);
                  return (
                    <li key={row.recordId} className="border-t border-border-strong pt-3" data-testid={`${testId}-row`}>
                      {/* One group per registo, named by its caption, so a
                          screen reader tells the rows' Data, Hora and Texto apart. */}
                      <fieldset className="flex flex-col gap-2">
                        <legend className="text-sm font-medium">{name}</legend>
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="flex flex-col gap-1 text-sm">
                            <span>{s["patients.exportEdit.date"]}</span>
                            <DatePicker
                              value={value.date === "" ? null : value.date}
                              onChange={(date) => edit(row.recordId, { date })}
                              triggerLabel={`${s["patients.exportEdit.date"]}: ${name}`}
                              testId={`${testId}-row-date`}
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span>{s["patients.exportEdit.time"]}</span>
                            <div data-testid={`${testId}-row-time`}>
                              <TimeField
                                value={value.time}
                                onChange={(time) => edit(row.recordId, { time })}
                                step={5}
                                hourLabel={s["patients.exportEdit.hours"]}
                                minuteLabel={s["patients.exportEdit.minutes"]}
                              />
                            </div>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => edit(row.recordId, { time: "" })}
                            disabled={value.time === ""}
                            data-testid={`${testId}-row-clear-time`}
                          >
                            {s["patients.exportEdit.clearTime"]}
                          </Button>
                        </div>
                        <label className="flex flex-col gap-1 text-sm">
                          <span>{s["patients.exportEdit.text"]}</span>
                          <input
                            type="text"
                            value={value.text}
                            maxLength={EXPORT_TEXT_MAX}
                            onChange={(e) => edit(row.recordId, { text: e.target.value })}
                            className={field}
                            data-testid={`${testId}-row-text`}
                          />
                          <span className="text-xs text-text-secondary">{s["patients.exportEdit.textHint"]}</span>
                        </label>
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
            )}

            {invalid && (
              <p role="alert" className="text-sm text-error" data-testid={`${testId}-invalid`}>
                {s["patients.exportEdit.invalid"]}
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
