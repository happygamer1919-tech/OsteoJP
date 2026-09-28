"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { runAction } from "@/lib/actions/run-action";
import { useActionOwner } from "@/lib/actions/use-action-owner";
import { useLatestCallback } from "@/lib/actions/use-latest-callback";
import {
  appendAppointmentNoteAction,
  getAppointmentNotesAction,
} from "@/lib/patients/actions";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";
import { NotesList } from "@/app/patients/[id]/notes-list";

/**
 * PL-16 — the appointment note THREAD, as a board.
 *
 * Owner CR 2026-07-30: "a button right above the notes where you press 'add
 * note' and you can start typing, after submitting on the right of the note the
 * date and time stamp + who wrote the note ... because it is important for
 * communication between reception and therapists, they exchange with notes".
 *
 * No migration: every appointment save has APPENDED an `appointment_notes` row
 * since W12-13, so the thread already existed in the data — the booking panel
 * just rendered the latest one in a textarea, which read as a single
 * overwritable note. This renders the whole thread, newest first, each note
 * carrying its author + timestamp, with the PL-13 pen edit and "Editada por"
 * stamp. That sentence used to end "notes cannot be deleted (no DELETE policy)".
 * It stopped being true when 0084 added the policy, and NOTES-04 added the
 * control: a note is deleted from its row in `NotesList`, behind a confirm step,
 * with a `patient.note_delete` audit row.
 *
 * Client-side because it lives inside the drawer/popup, which is client-rendered
 * and opens without a navigation: the thread is fetched through a server action
 * (`getAppointmentNotesAction`, which re-applies the therapist own-patient rule)
 * and re-fetched after every append/edit.
 */
export function AppointmentNotesBoard({ appointmentId }: { appointmentId: string }) {
  const [notes, setNotes] = useState<PatientNoteRevision[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // SKEW-01: every read and write below goes through runAction, which never
  // rejects, so none of them can reach the agenda's error boundary any more.
  const reload = useCallback(async () => {
    async function load(): Promise<void> {
      const out = await runAction(() => getAppointmentNotesAction(appointmentId), {
        kind: "read",
        retry: () => void load(),
      });
      if (!out.failed) setNotes(out.value.notes);
    }
    await load();
  }, [appointmentId]);

  useEffect(() => {
    let alive = true;
    function load() {
      void runAction(() => getAppointmentNotesAction(appointmentId), {
        kind: "read",
        retry: () => { if (alive) load(); },
      }).then((out) => {
        if (alive && !out.failed) setNotes(out.value.notes);
      });
    }
    load();
    return () => {
      alive = false;
    };
  }, [appointmentId]);

  const retryAdd = useLatestCallback(() => onAdd());
  // The board lives in the drawer: a failed note's toast closes with it
  // (lib/actions/use-action-owner.ts).
  const actionOwner = useActionOwner();

  function onAdd(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const content = text.trim();
    if (!content) {
      setError(s["patients.noteRequired"]);
      return;
    }
    startTransition(async () => {
      const out = await runAction(() => appendAppointmentNoteAction(appointmentId, content), {
        kind: "write",
        retry: retryAdd,
        owner: actionOwner,
      });
      if (out.failed) return;
      const r = out.value;
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
    <section className="flex flex-col gap-2" data-testid="appointment-notes-board">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-secondary">{s["appointment.notes"]}</span>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid="appointment-note-add"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent-2-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {s["patients.noteAdd"]}
          </button>
        )}
      </div>

      {composing && (
        // Not a <form>: this board is rendered INSIDE the appointment form, and a
        // nested form is invalid HTML — the browser drops it and the inner submit
        // would save the appointment instead of the note.
        <div className="flex flex-col gap-2" data-testid="appointment-note-composer">
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
        <p className="text-sm text-text-secondary" data-testid="appointment-notes-empty">
          {s["appointment.notesEmpty"]}
        </p>
      ) : (
        // The SAME thread component the patient profile uses (PL-13): one
        // authorship/stamp format, one edit affordance, no second notes UI.
        <NotesList notes={notes} onChanged={reload} />
      )}
    </section>
  );
}
