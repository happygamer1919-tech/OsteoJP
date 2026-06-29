"use client";

import { useActionState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { saveQuickNotesAction } from "@/lib/dashboard/actions";

const MAX_LEN = 2000;

/**
 * Notas rápidas — per-staff private scratchpad. Each staff member has their
 * own isolated note; notes are NOT shared across the team. Persists via a
 * server action; RLS enforces staff_user_id = auth.uid() at the DB layer.
 */
export function NotasRapidas({ initialNotes }: { initialNotes: string }) {
  const [state, formAction, isPending] = useActionState(saveQuickNotesAction, {
    content: initialNotes,
    saved: false,
  });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="notes"
        defaultValue={state.content}
        maxLength={MAX_LEN}
        rows={4}
        aria-label={s["dashboard.notes"]}
        placeholder={s["dashboard.notesPlaceholder"]}
        className="w-full resize-none rounded-md border border-v2-border bg-transparent p-3 text-sm text-v2-text-primary placeholder:text-v2-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      />
      <div className="flex items-center justify-end gap-3">
        {state.saved && !isPending && (
          <p role="status" className="text-xs text-v2-text-secondary">
            {s["dashboard.notesSaved"]}
          </p>
        )}
        <Button type="submit" loading={isPending} variant="primary">
          {s["common.save"]}
        </Button>
      </div>
    </form>
  );
}
