"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@osteojp/ui";
import {
  hardDeletePatient,
  mergePatients,
  restorePatient,
  softDeletePatient,
  type HardDeletePatientError,
} from "../../../lib/patients/actions";

const s = getStrings(DEFAULT_LOCALE);

const HARD_DELETE_ERROR_TEXT: Partial<Record<HardDeletePatientError, string>> = {
  password: s["patients.hardDeleteWrongPassword"],
  has_clinical_records: s["patients.hardDeleteBlockedRecords"],
  has_references: s["patients.hardDeleteBlockedReferences"],
};

// Destructive controls (soft-delete / restore / merge / gated hard delete).
// Only rendered when the caller's role holds patients:delete — the server
// actions re-check anyway; the hard-delete gate is entirely server-enforced
// (scrypt password + refuse guards), this UI is only the affordance.
export function PatientActions({
  patientId,
  isDeleted,
  canHardDelete = false,
  hardDeleteBlocked = null,
}: {
  patientId: string;
  isDeleted: boolean;
  /** Caller holds settings:manage (admin tier) — shows the gated hard delete. */
  canHardDelete?: boolean;
  /** Server-computed affordance: why hard delete is unavailable, if so. */
  hardDeleteBlocked?: "records" | "references" | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [survivorId, setSurvivorId] = useState("");
  const [pending, startTransition] = useTransition();
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [hardDeletePassword, setHardDeletePassword] = useState("");

  const hardDeleteBlockedText =
    hardDeleteBlocked === "records"
      ? s["patients.hardDeleteBlockedRecords"]
      : hardDeleteBlocked === "references"
        ? s["patients.hardDeleteBlockedReferences"]
        : null;

  function submitHardDelete() {
    const password = hardDeletePassword;
    if (!password) return;
    setError(null);
    startTransition(async () => {
      const result = await hardDeletePatient(patientId, password);
      if (result.ok) {
        router.push("/patients");
        router.refresh();
        return;
      }
      setError(HARD_DELETE_ERROR_TEXT[result.error] ?? s["errors.generic"]);
    });
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : s["errors.generic"]);
      }
    });
  }

  return (
    // W7-03: CONTAINED danger zone. W6-06b made this a bordered card, but it is
    // mounted OUTSIDE the tabpanels, so it sat permanently expanded at the bottom
    // of every single tab. It is now a <details> disclosure, collapsed by default
    // and carrying the error token, so the destructive controls are present but
    // out of the way until deliberately opened (progressive disclosure +
    // destructive-emphasis).
    //
    // It is CONTAINED, not MOVED: the DOM position is unchanged. Relocating it to
    // one tab or an overflow menu is a product decision and is logged as
    // Q-W7-03-1 for the owner, never self-decided here.
    //
    // Presentation only: the password gate and every server-side guard are
    // untouched.
    <details className="group rounded-lg border border-error-200 bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
        <span className="flex items-center gap-2">
          <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" className="text-error" />
          <span className="text-sm font-semibold text-error">{s["patients.dangerZone"]}</span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="shrink-0 text-text-secondary transition-transform duration-fast ease-standard group-open:rotate-180"
        />
      </summary>

      <div className="flex flex-col gap-3 border-t border-error-200 p-4">
      <div className="flex flex-wrap gap-3">
        {isDeleted ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(() => restorePatient(patientId))}
            variant="secondary"
            size="sm"
          >
            {s["patients.restore"]}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(s["patients.confirmDelete"])) {
                run(() => softDeletePatient(patientId));
              }
            }}
            variant="destructive"
            size="sm"
          >
            {s["patients.delete"]}
          </Button>
        )}
      </div>

      {!isDeleted && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const survivor = survivorId.trim();
            if (survivor) {
              run(() =>
                mergePatients({ survivorId: survivor, loserId: patientId }),
              );
            }
          }}
          className="flex flex-col gap-1.5"
        >
          <span className="text-xs text-text-secondary">{s["patients.mergeHint"]}</span>
          <div className="flex gap-2">
            <input
              aria-label={s["patients.mergeIntoLabel"]}
              value={survivorId}
              onChange={(e) => setSurvivorId(e.target.value)}
              placeholder={s["patients.mergeIntoLabel"]}
              className="flex-1 rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
            <Button
              type="submit"
              disabled={pending || survivorId.trim().length === 0}
              variant="secondary"
              size="sm"
            >
              {s["patients.mergeSubmit"]}
            </Button>
          </div>
        </form>
      )}

      {canHardDelete && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-text-secondary">{s["patients.hardDeleteHint"]}</span>
          {/* title on the wrapper: a disabled button swallows pointer events. */}
          <span title={hardDeleteBlockedText ?? undefined} className="self-start">
            <Button
              type="button"
              disabled={pending || hardDeleteBlocked !== null}
              onClick={() => setHardDeleteOpen((v) => !v)}
              variant="destructive"
              size="sm"
            >
              {s["patients.hardDelete"]}
            </Button>
          </span>
          {hardDeleteBlockedText && (
            <span className="text-xs text-text-secondary">{hardDeleteBlockedText}</span>
          )}
          {hardDeleteOpen && hardDeleteBlocked === null && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitHardDelete();
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="password"
                autoComplete="off"
                aria-label={s["patients.hardDeletePasswordLabel"]}
                placeholder={s["patients.hardDeletePasswordLabel"]}
                value={hardDeletePassword}
                onChange={(e) => setHardDeletePassword(e.target.value)}
                className="rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              />
              <Button
                type="submit"
                disabled={pending || hardDeletePassword.length === 0}
                variant="destructive"
                size="sm"
              >
                {s["patients.hardDeleteConfirm"]}
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  setHardDeleteOpen(false);
                  setHardDeletePassword("");
                }}
                variant="secondary"
                size="sm"
              >
                {s["common.cancel"]}
              </Button>
            </form>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </details>
  );
}
