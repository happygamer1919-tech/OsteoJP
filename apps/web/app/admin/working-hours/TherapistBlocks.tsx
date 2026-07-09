"use client";

import { useState } from "react";
import { Button, StatusBadge, useAnimatedDialog } from "@osteojp/ui";
import { adminInputInline, adminLabel } from "../admin-ui";
import {
  createTimeOffBlockAction,
  updateTimeOffBlockAction,
  deleteTimeOffBlockAction,
} from "./actions";

export type BlockView = {
  id: string;
  mode: "pontual" | "prolongada";
  reason: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  note: string;
};

export type BlockLabels = {
  block: string; // "Bloquear horário"
  blocksFor: string; // "Bloqueios de"
  none: string; // "Sem bloqueios"
  addBlock: string; // "Adicionar bloqueio"
  mode: string; // "Tipo"
  pontual: string; // "Bloqueio pontual"
  prolongada: string; // "Ausência prolongada"
  date: string; // "Data"
  fromDate: string; // "De"
  toDate: string; // "Até"
  start: string; // "Início"
  end: string; // "Fim"
  note: string; // "Nota"
  save: string; // "Guardar"
  cancel: string; // "Cancelar"
  edit: string; // "Editar"
  remove: string; // "Eliminar"
  close: string; // "Fechar"
};

/** Format a Lisbon "yyyy-mm-dd" as "dd/mm/yyyy" for display (no locale dep). */
function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function blockSummary(b: BlockView): string {
  if (b.mode === "prolongada") {
    return b.startDate === b.endDate
      ? fmtDate(b.startDate)
      : `${fmtDate(b.startDate)} a ${fmtDate(b.endDate)}`;
  }
  return `${fmtDate(b.startDate)} · ${b.startTime}–${b.endTime}`;
}

/**
 * W5-12 — the Bloquear horário modal for one therapist. Lists existing blocks
 * (edit/remove), plus a create form supporting BOTH modes:
 *   - Bloqueio pontual: a date + hour range (a single time_off row, reason other).
 *   - Ausência prolongada: a date range, e.g. ferias (a single time_off row,
 *     reason vacation).
 * Each control posts to its existing server action; overlapping appointments are
 * warned about on the page (never cancelled).
 */
export function TherapistBlocks({
  therapistId,
  therapistName,
  blocks,
  labels,
}: {
  therapistId: string;
  therapistName: string;
  blocks: BlockView[];
  labels: BlockLabels;
}) {
  const [open, setOpen] = useState(false);
  const { ref, shown } = useAnimatedDialog(open);
  const [editing, setEditing] = useState<BlockView | null>(null);
  const [mode, setMode] = useState<"pontual" | "prolongada">("pontual");

  const startEdit = (b: BlockView) => {
    setEditing(b);
    setMode(b.mode);
  };
  const startCreate = () => {
    setEditing(null);
    setMode("pontual");
  };

  // Form field defaults come from the block being edited, or blank for create.
  const f = editing;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          startCreate();
          setOpen(true);
        }}
        data-testid="open-blocks"
      >
        {labels.block}
      </Button>

      <dialog
        ref={ref}
        aria-label={`${labels.blocksFor} ${therapistName}`}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className={[
          "m-auto w-full max-w-2xl rounded-v2 bg-v2-surface p-0 shadow-v2-float",
          "backdrop:bg-text-primary/40",
          "transition-opacity duration-base ease-standard",
          shown ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="flex flex-col gap-4 p-6">
          <h3 className="text-lg font-semibold text-v2-text-primary">
            {labels.blocksFor} {therapistName}
          </h3>

          {/* Existing blocks */}
          {blocks.length === 0 ? (
            <p className="text-sm text-v2-text-secondary">{labels.none}</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="blocks-list">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-2 rounded-v2 border border-v2-border p-3 text-sm"
                >
                  <StatusBadge tone={b.mode === "prolongada" ? "pending" : "cancelled"}>
                    {b.mode === "prolongada" ? labels.prolongada : labels.pontual}
                  </StatusBadge>
                  <span className="text-v2-text-primary">{blockSummary(b)}</span>
                  {b.note ? (
                    <span className="text-v2-text-secondary">· {b.note}</span>
                  ) : null}
                  <span className="ml-auto flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(b)}
                    >
                      {labels.edit}
                    </Button>
                    <form
                      action={deleteTimeOffBlockAction}
                      onSubmit={() => setOpen(false)}
                    >
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="userId" value={therapistId} />
                      <Button type="submit" variant="destructive" size="sm">
                        {labels.remove}
                      </Button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Create / edit form */}
          <form
            action={editing ? updateTimeOffBlockAction : createTimeOffBlockAction}
            onSubmit={() => setOpen(false)}
            className="flex flex-col gap-3 rounded-v2 border border-v2-border p-3"
            key={editing?.id ?? "new"}
          >
            <p className="text-sm font-medium text-v2-text-primary">
              {editing ? labels.edit : labels.addBlock}
            </p>
            <input type="hidden" name="userId" value={therapistId} />
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <label className="flex flex-col gap-1">
              <span className={adminLabel}>{labels.mode}</span>
              <select
                name="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "pontual" | "prolongada")}
                aria-label={labels.mode}
                className={adminInputInline}
              >
                <option value="pontual">{labels.pontual}</option>
                <option value="prolongada">{labels.prolongada}</option>
              </select>
            </label>

            {mode === "pontual" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.date}</span>
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={f?.startDate ?? ""}
                    required
                    aria-label={labels.date}
                    className={adminInputInline}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.start}</span>
                  <input
                    type="time"
                    name="startTime"
                    step={900}
                    defaultValue={f?.startTime ?? "09:00"}
                    required
                    aria-label={labels.start}
                    className={adminInputInline}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.end}</span>
                  <input
                    type="time"
                    name="endTime"
                    step={900}
                    defaultValue={f?.endTime ?? "10:00"}
                    required
                    aria-label={labels.end}
                    className={adminInputInline}
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.fromDate}</span>
                  <input
                    type="date"
                    name="startDate"
                    defaultValue={f?.startDate ?? ""}
                    required
                    aria-label={labels.fromDate}
                    className={adminInputInline}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={adminLabel}>{labels.toDate}</span>
                  <input
                    type="date"
                    name="endDate"
                    defaultValue={f?.endDate ?? ""}
                    required
                    aria-label={labels.toDate}
                    className={adminInputInline}
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className={adminLabel}>{labels.note}</span>
              <input
                type="text"
                name="note"
                defaultValue={f?.note ?? ""}
                aria-label={labels.note}
                className={adminInputInline}
              />
            </label>

            <div className="flex justify-end gap-2">
              {editing ? (
                <Button type="button" variant="ghost" size="sm" onClick={startCreate}>
                  {labels.cancel}
                </Button>
              ) : null}
              <Button type="submit" variant="primary" size="sm">
                {labels.save}
              </Button>
            </div>
          </form>

          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {labels.close}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
