"use client";
import { useRef, useState } from "react";
import { Button } from "@osteojp/ui";
import { s } from "@/lib/i18n";

import { SignConfirm } from "@/app/clinical/[id]/SignConfirm";
import { useAwaitableSave } from "@/app/clinical/[id]/use-awaitable-save";

export type ReviewSaveState = {
  ok: boolean;
  code?: string;
  /** Present when code === "not_narrative_field": rejected key → reason. */
  rejected?: Record<string, string>;
  /** SIGN-CONFIRM: fingerprint of the stored content after a successful save. */
  dataHash?: string;
};

const initialState: ReviewSaveState = { ok: false };

function reviewSaveErrorText(state: ReviewSaveState | null): string | null {
  if (!state) return s["review.error"];
  return state.code === "not_narrative_field"
    ? s["review.notNarrative"]
    : state.code === "invalidJson"
      ? s["review.invalidJson"]
      : state.code === "finalized"
        ? s["clinical.finalized"]
        : state.code
          ? s["review.error"]
          : null;
}

/**
 * Narrative-only review editor. The reviewer edits the draft's free-text
 * narrative fields as JSON; coded + safety fields are never shown here and are
 * rejected server-side if smuggled in. Finalize signs + locks the record.
 *
 * SIGN-CONFIRM-AND-SAVE-FIRST: Finalizar used to be a form of its own that
 * finalized on one press, so narrative typed and not saved was left out of an
 * immutable record. It now opens a confirmation, and an edited narrative is
 * saved through "Guardar narrativa"'s own path before the finalize runs.
 */
export function ReviewEditor({
  recordId,
  initialNarrative,
  saveAction,
  finalizeAction,
  dataHash: loadedDataHash,
}: {
  recordId: string;
  initialNarrative: Record<string, string>;
  saveAction: (prev: ReviewSaveState, formData: FormData) => Promise<ReviewSaveState>;
  finalizeAction: (expectedDataHash: string) => Promise<void>;
  /** Fingerprint of the stored content this page was rendered from. */
  dataHash: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [narrative, setNarrative] = useState<string>(() =>
    JSON.stringify(initialNarrative, null, 2),
  );
  // The narrative text as last saved (or loaded), and the stored content's
  // fingerprint; both move forward on every save that answers ok.
  const [savedNarrative, setSavedNarrative] = useState(narrative);
  const [dataHash, setDataHash] = useState(loadedDataHash);
  const { state, formAction, pending, saveAndWait } = useAwaitableSave(
    saveAction,
    initialState,
    (result, formData) => {
      if (!result.ok) return;
      setSavedNarrative(String(formData.get("narrative") ?? ""));
      if (result.dataHash) setDataHash(result.dataHash);
    },
  );

  const errorMessage = reviewSaveErrorText(state);

  return (
    <div className="space-y-5">
      <form ref={formRef} action={formAction} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor={`narrative-${recordId}`}>
          {s["review.narrativeLabel"]}
        </label>
        <p className="text-xs text-text-secondary">{s["review.narrativeHint"]}</p>
        <textarea
          id={`narrative-${recordId}`}
          name="narrative"
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={14}
          className="w-full rounded border px-3 py-2 font-mono text-xs"
        />
        {!state.ok && errorMessage && <p role="alert" className="text-sm text-error">{errorMessage}</p>}
        {!state.ok && state.rejected && (
          <p role="alert" className="text-xs text-error">
            {Object.keys(state.rejected).join(", ")}
          </p>
        )}
        {state.ok && <p role="status" className="text-sm text-success">{s["review.saved"]}</p>}
        <Button type="submit" loading={pending} variant="secondary" size="sm">
          {s["review.save"]}
        </Button>
      </form>

      <SignConfirm
        label={s["review.finalize"]}
        message={s["review.finalizeConfirm"]}
        size="sm"
        isDirty={() => narrative !== savedNarrative}
        save={() =>
          formRef.current ? saveAndWait(new FormData(formRef.current)) : Promise.resolve(null)
        }
        sign={finalizeAction}
        dataHash={dataHash}
        saveFailureReason={(result) => reviewSaveErrorText(result) ?? s["review.error"]}
        disabled={pending}
      />
    </div>
  );
}
