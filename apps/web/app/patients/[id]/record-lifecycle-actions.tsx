"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Button } from "@osteojp/ui";
import {
  hardDeleteRecordAction,
  annulRecordAction,
  type RecordActionError,
} from "./actions";

const s = getStrings(DEFAULT_LOCALE);

const ERROR_TEXT: Partial<Record<RecordActionError, string>> = {
  password: s["clinical.recordActionWrongPassword"],
  not_draft: s["clinical.recordDeleteNotDraft"],
  not_signed: s["clinical.recordAnnulNotSigned"],
  already_annulled: s["clinical.recordAlreadyAnnulled"],
};

/**
 * W5-30 — per-ficha destructive controls on the Registos clínicos tab. A DRAFT
 * (or AI-pending) ficha shows a password-gated "Eliminar"; a SIGNED ficha shows a
 * password-gated "Anular" (optional reason). Both gates are entirely
 * server-enforced (scrypt password + status check + immutability trigger); this
 * UI is only the affordance. Rendered only when the caller can author.
 */
export function RecordLifecycleActions({
  recordId,
  patientId,
  status,
  annulled,
}: {
  recordId: string;
  patientId: string;
  status: "draft" | "locked" | "signed";
  annulled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "delete" | "annul">(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(null);
    setPassword("");
    setReason("");
  }

  function submit() {
    if (!password) return;
    setError(null);
    startTransition(async () => {
      const result =
        open === "delete"
          ? await hardDeleteRecordAction(recordId, patientId, password)
          : await annulRecordAction(recordId, patientId, password, reason.trim() || null);
      if (result.ok) {
        reset();
        router.refresh();
        return;
      }
      setError(ERROR_TEXT[result.error] ?? s["errors.generic"]);
    });
  }

  // A draft can be hard-deleted; a signed (not-yet-annulled) ficha can be annulled.
  const canDelete = status === "draft";
  const canAnnul = status === "signed" && !annulled;
  if (!canDelete && !canAnnul) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {open === null && (
        <div className="flex gap-2">
          {canDelete && (
            <Button type="button" disabled={pending} onClick={() => setOpen("delete")} variant="destructive" size="sm">
              {s["clinical.recordDelete"]}
            </Button>
          )}
          {canAnnul && (
            <Button type="button" disabled={pending} onClick={() => setOpen("annul")} variant="destructive" size="sm">
              {s["clinical.recordAnnul"]}
            </Button>
          )}
        </div>
      )}

      {open !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col items-end gap-2"
        >
          {open === "annul" && (
            <input
              type="text"
              aria-label={s["clinical.recordAnnulReasonLabel"]}
              placeholder={s["clinical.recordAnnulReasonLabel"]}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              autoComplete="off"
              aria-label={s["clinical.recordActionPasswordLabel"]}
              placeholder={s["clinical.recordActionPasswordLabel"]}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
            <Button type="submit" disabled={pending || password.length === 0} variant="destructive" size="sm">
              {open === "delete" ? s["clinical.recordDeleteConfirm"] : s["clinical.recordAnnulConfirm"]}
            </Button>
            <Button type="button" disabled={pending} onClick={reset} variant="secondary" size="sm">
              {s["common.cancel"]}
            </Button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  );
}
