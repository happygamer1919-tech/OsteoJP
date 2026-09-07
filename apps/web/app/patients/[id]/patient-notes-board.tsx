"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { appendPatientNoteAction, getPatientNotesAction } from "@/lib/patients/actions";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";
import { NotesList } from "./notes-list";

/**
 * RB-NOTES — the PATIENT note history, as a board, for surfaces that are not the
 * profile page.
 *
 * ==========================================================================
 * THE SAME COMPONENT SHAPE AS `AppointmentNotesBoard`, ONE AXIS OVER
 * ==========================================================================
 * That board is a thread for ONE VISIT and this one is the history of ONE
 * PERSON. Everything else is deliberately identical - the add affordance, the
 * composer, the `NotesList` thread with its PL-13 edit pen and "Editada por"
 * stamp - because reception should not have to learn two notes UIs depending on
 * which screen they opened it from. The Recuperação row's "Notas" button opens
 * this; the Marcações row's opens the other; both look and behave the same.
 *
 * IT IS NOT A SECOND NOTES UI AND MUST NOT BECOME ONE. It renders `NotesList`,
 * appends through `appendPatientNoteAction` and edits through the action
 * `NotesList` already calls. There is no read, write or format defined here.
 *
 * ==========================================================================
 * THE READ RE-CHECKS THE PATIENT. IT IS NOT A CONVENIENCE.
 * ==========================================================================
 * `getPatientNotesAction` resolves the patient through `getPatient`, which
 * applies the therapist own-patient narrowing and the reception/admin location
 * scope, exactly as `getAppointmentNotesAction` does for a visit. A component
 * fetching by a patient id from client state must never be the thing that
 * decides who may read the answer.
 */
export function PatientNotesBoard({ patientId }: { patientId: string }) {
  const [notes, setNotes] = useState<PatientNoteRevision[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const r = await getPatientNotesAction(patientId);
    setNotes(r.notes);
  }, [patientId]);

  useEffect(() => {
    let alive = true;
    void getPatientNotesAction(patientId).then((r) => {
      if (alive) setNotes(r.notes);
    });
    return () => {
      alive = false;
    };
  }, [patientId]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const content = text.trim();
    if (!content) {
      setError(s["patients.noteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await appendPatientNoteAction(patientId, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setText("");
      setComposing(false);
      await reload();
    });
  }

  return (
    <section className="flex flex-col gap-2" data-testid="patient-notes-board">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">{s["followup.notesLabel"]}</span>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid="patient-note-add"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent-2-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {s["patients.noteAdd"]}
          </button>
        )}
      </div>

      {composing && (
        // Not a <form>, matching AppointmentNotesBoard: this board is mounted
        // inside a Dialog which may itself sit inside a form on another surface,
        // and a nested form is invalid HTML the browser silently drops.
        <div className="flex flex-col gap-2" data-testid="patient-note-composer">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={5000}
            autoFocus
            placeholder={s["patients.noteComposerPlaceholder"]}
            aria-label={s["patients.noteAdd"]}
            className="w-full resize-none rounded-md border border-border-strong bg-transparent p-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setComposing(false);
                setText("");
                setError(null);
              }}
            >
              {s["common.cancel"]}
            </Button>
            <Button type="button" variant="primary" loading={pending} onClick={onAdd}>
              {s["patients.noteAdd"]}
            </Button>
          </div>
        </div>
      )}

      {notes === null ? (
        <p className="text-sm text-text-secondary">{s["common.loading"]}</p>
      ) : notes.length === 0 ? (
        // A NON-EMPTY ANSWER TO AN EMPTY LIST. "Sem notas" and "the read failed"
        // must not render as the same blank panel - INC-05's shape, and the
        // reason every empty state on this platform says what empty MEANS.
        <p className="text-sm text-text-secondary" data-testid="patient-notes-empty">
          {s["patients.notesEmpty"]}
        </p>
      ) : (
        <NotesList notes={notes} onChanged={reload} />
      )}
    </section>
  );
}
