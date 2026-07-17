import { StickyNote } from "lucide-react";

import { s } from "@/lib/i18n";

// W9-06 (CB QA item 9) - a staff-side hover card that reveals a marcacao's note
// on hover/focus, so staff no longer have to open the marcacao to read the
// historico. Staff-authenticated surfaces ONLY (agenda + marcacoes list); the
// portal never receives note content (item 6's guard test locks that - the note
// field is not in the portal AppointmentView at all).
//
// Self-contained: its own `group/note` scope + an absolute popover, so it works
// inside a flex row without a positioned wrapper. The trigger icon is
// focusable (tabIndex 0) so the note is reachable by keyboard, not mouse-only
// (the popover shows on `group-hover` AND `group-focus-within`). Renders nothing
// when there is no note, so a note-less marcacao shows no affordance.

export function NoteHoverCard({ note }: { note: string | null }) {
  const text = note?.trim();
  if (!text) return null;

  return (
    <span className="group/note relative inline-flex shrink-0">
      <StickyNote
        size={14}
        strokeWidth={1.75}
        tabIndex={0}
        role="button"
        aria-label={s["appointment.noteHoverLabel"]}
        className="cursor-help rounded-sm text-v2-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-56 max-w-[16rem] whitespace-pre-line rounded-v2 border border-v2-border bg-v2-surface p-2 text-xs text-v2-text-primary shadow-v2-float group-hover/note:block group-focus-within/note:block"
      >
        <span className="mb-1 block font-medium text-v2-text-secondary">
          {s["appointment.noteHoverLabel"]}
        </span>
        {text}
      </span>
    </span>
  );
}
