"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil } from "lucide-react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { editAppointmentNoteAction } from "@/lib/patients/actions";
import type { PatientNoteRevision } from "@/lib/patients/note-revisions";

/**
 * PL-13 (owner ruling 2026-07-30): the patient Notas thread is EDITABLE in place
 * with a last-edited stamp. Each note in the unified store (`editable: true`)
 * gets a pen affordance that opens an inline editor; saving calls
 * `editAppointmentNoteAction`, which stamps `edited_at` + `last_edited_by`. Legacy
 * revisions (`editable: false`) render read-only. The author + created line is
 * always shown; when a note has been edited, the "editada por … · …" stamp is
 * shown beneath it.
 */
/**
 * PL-16: `onChanged` lets a caller that is NOT a server-rendered page refresh
 * its own thread after an edit (the agenda notes board fetches through a server
 * action, where router.refresh() would repaint the page behind the drawer but
 * not the list inside it). Omitted -> the original router.refresh() behaviour,
 * which is what the patient profile tab needs.
 */
/**
 * LE-notes-list-hydration-mismatch — one instant, ONE string, on both sides.
 *
 * ==========================================================================
 * THE DEFECT: `toLocaleString("pt-PT")` WITH NO TIMEZONE.
 * ==========================================================================
 * A bare `toLocaleString` formats in whatever zone the RUNTIME is in. The
 * server is Node/ICU on Vercel (UTC); the browser is the viewer's machine. The
 * two produce different strings for the same instant, so React logs "Hydration
 * failed because the server rendered text didn't match the client" and
 * re-renders.
 *
 * ==========================================================================
 * WHY IT IS FIXED RATHER THAN LEFT, GIVEN NOTHING VISIBLY BREAKS.
 * ==========================================================================
 * React recovers, every test around it passes, and the card rates it LOW and
 * says so honestly. What it costs is a REAL ERROR IN THE LOG THAT TRAINS PEOPLE
 * TO IGNORE ERRORS IN THE LOG — and this project has already paid for that
 * habit twice, in INC-10 and in the isVisible probe, both found by somebody
 * finally reading a log line they had learned to scroll past.
 *
 * ==========================================================================
 * Europe/Lisbon, EXPLICITLY, AND IT IS NOT MERELY "A" FIXED ZONE.
 * ==========================================================================
 * It is THE zone this product renders in — CLAUDE.md: "All dates in UTC in DB,
 * Europe/Lisbon for display" — and the same choice the notification centre and
 * the declaração model already make. Pinning to UTC would have removed the
 * mismatch too, and shown a clinic in Lisbon a time nobody in the building
 * recognises.
 *
 * THREE CALL SITES, NOT ONE. The card names line 139; the same bare call was
 * also formatting the appointment instant and the edited-at stamp. A fix that
 * repaired only the line the card mentioned would have left two live instances
 * of the identical defect in the same component.
 */
const NOTE_STAMP: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Lisbon",
};

function stamp(value: string | Date): string {
  return new Date(value).toLocaleString("pt-PT", NOTE_STAMP);
}

export function NotesList({
  notes,
  onChanged,
  onOpenAppointment,
}: {
  notes: PatientNoteRevision[];
  onChanged?: () => void | Promise<void>;
  /**
   * PL-17: when given, a note that belongs to a marcação gets a button that
   * hands its id back so the caller can open that marcação's panel. Omitted ->
   * the visit is still NAMED on the note, just not openable (the surfaces that
   * are already scoped to one marcação have nothing to open).
   */
  onOpenAppointment?: (appointmentId: string) => void;
}) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} onChanged={onChanged} onOpenAppointment={onOpenAppointment} />
      ))}
    </ul>
  );
}

function NoteItem({
  note,
  onChanged,
  onOpenAppointment,
}: {
  note: PatientNoteRevision;
  onChanged?: () => void | Promise<void>;
  onOpenAppointment?: (appointmentId: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const content = text.trim();
    if (!content) {
      setError(s["patients.noteRequired"]);
      return;
    }
    startTransition(async () => {
      const r = await editAppointmentNoteAction(note.id, content);
      if (!r.ok) {
        setError(s["errors.generic"]);
        return;
      }
      setEditing(false);
      if (onChanged) await onChanged();
      else router.refresh();
    });
  }

  function onCancel() {
    setText(note.content);
    setError(null);
    setEditing(false);
  }

  return (
    <li className="rounded-lg border border-border-strong p-3">
      {editing ? (
        <form onSubmit={onSave} className="flex flex-col gap-2" data-testid="note-edit-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={5000}
            autoFocus
            aria-label={s["patients.noteEdit"]}
            className="w-full resize-none rounded-md border border-border-strong bg-transparent p-3 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {s["common.cancel"]}
            </Button>
            <Button type="submit" loading={pending} variant="primary">
              {s["common.save"]}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap text-sm text-text-primary">{note.content}</p>
            {note.editable && (
              <button
                type="button"
                onClick={() => {
                  setText(note.content);
                  setEditing(true);
                }}
                aria-label={s["patients.noteEdit"]}
                className="shrink-0 rounded-md p-1 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {note.authorName ?? s["patients.noteSystemAuthor"]} ·{" "}
            {stamp(note.createdAt)}
          </p>
          {/* PL-17 — which marcação this note documents. Owner CR 2026-07-30:
              "you can see the notes but it is not written to which appointment
              related". A patient-level note has none and shows nothing. */}
          {note.appointment && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span data-testid="note-appointment-line">
                {s["patients.noteAppointment"]}{" "}
                {stamp(note.appointment.startsAt)}
                {note.appointment.practitionerName ? ` · ${note.appointment.practitionerName}` : ""}
              </span>
              {onOpenAppointment && (
                <button
                  type="button"
                  data-testid="note-open-appointment"
                  onClick={() => onOpenAppointment(note.appointment!.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-accent-2-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
                  {s["patients.noteOpenAppointment"]}
                </button>
              )}
            </p>
          )}
          {note.editedAt && (
            <p className="mt-0.5 text-xs italic text-text-secondary" data-testid="note-edited-stamp">
              {s["patients.noteEditedBy"]} {note.editedByName ?? s["patients.noteSystemAuthor"]} ·{" "}
              {stamp(note.editedAt)}
            </p>
          )}
        </>
      )}
    </li>
  );
}
