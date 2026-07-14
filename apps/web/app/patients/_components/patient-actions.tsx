"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
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
    // W6-06b: contained danger zone. Previously a naked full-width `border-t`
    // rule that floated mid-layout on short tabs (the "stray line" the owner saw);
    // now a titled, bordered card so the destructive controls read as an
    // intentional, visually-separated section (destructive-emphasis).
    <div className="flex flex-col gap-3 rounded-lg border border-border-strong p-4">
      <h2 className="text-sm font-semibold text-text-primary">{s["patients.dangerZone"]}</h2>
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
  );
}
