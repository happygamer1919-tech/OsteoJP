"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { Button, StatusChip } from "@osteojp/ui";

import type { DeletedPatientRow } from "@/lib/patients/queries";
import type { HardDeletePatientError } from "@/lib/patients/actions";
import { restoreDeletedPatientAction, permanentDeletePatientAction } from "./actions";

const s = getStrings(DEFAULT_LOCALE);

const HARD_DELETE_ERROR_TEXT: Partial<Record<HardDeletePatientError, string>> = {
  password: s["patients.hardDeleteWrongPassword"],
  has_clinical_records: s["patients.hardDeleteBlockedRecords"],
  has_references: s["patients.hardDeleteBlockedReferences"],
  forbidden: s["errors.forbidden"],
};

export type DeletedPatientView = DeletedPatientRow & {
  hardDeleteBlocked: "records" | "references" | null;
};

export function DeletedPatientsList({ patients }: { patients: DeletedPatientView[] }) {
  if (patients.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-6 text-sm text-v2-text-secondary">
        {s["admin.deletedPatients.empty"]}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {patients.map((p) => (
        <DeletedPatientRowItem key={p.id} patient={p} />
      ))}
    </ul>
  );
}

function DeletedPatientRowItem({ patient }: { patient: DeletedPatientView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");

  // A merge loser cannot be independently restored (its history is repointed to
  // the survivor); restore is offered only for soft-deleted rows.
  const isMerged = patient.mergedIntoId !== null;
  const isSoftDeleted = patient.deletedAt !== null;
  const canRestore = isSoftDeleted && !isMerged;

  const hardDeleteBlockedText =
    patient.hardDeleteBlocked === "records"
      ? s["patients.hardDeleteBlockedRecords"]
      : patient.hardDeleteBlocked === "references"
        ? s["patients.hardDeleteBlockedReferences"]
        : null;

  function restore() {
    setError(null);
    startTransition(async () => {
      const r = await restoreDeletedPatientAction(patient.id);
      if (r.ok) {
        router.refresh();
      } else {
        setError(r.error === "forbidden" ? s["errors.forbidden"] : s["errors.generic"]);
      }
    });
  }

  function submitHardDelete() {
    if (!password) return;
    setError(null);
    startTransition(async () => {
      const r = await permanentDeletePatientAction(patient.id, password);
      if (r.ok) {
        setHardDeleteOpen(false);
        setPassword("");
        router.refresh();
      } else {
        setError(HARD_DELETE_ERROR_TEXT[r.error] ?? s["errors.generic"]);
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-v2-text-primary">{patient.fullName}</span>
          <span className="text-xs text-v2-text-secondary">
            {patient.nif
              ? `${s["admin.deletedPatients.nifLabel"]} ${patient.nif}`
              : s["admin.deletedPatients.noNif"]}
            {patient.patientNumber != null ? ` · #${patient.patientNumber}` : ""}
          </span>
        </div>
        {isMerged ? (
          <StatusChip tone="neutral">
            {patient.survivorName
              ? `${s["admin.deletedPatients.mergedInto"]} ${patient.survivorName}`
              : s["admin.deletedPatients.mergedBadge"]}
          </StatusChip>
        ) : (
          <StatusChip tone="warning">{s["admin.deletedPatients.softDeletedBadge"]}</StatusChip>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canRestore && (
          <Button type="button" disabled={pending} onClick={restore} variant="secondary" size="sm">
            {s["patients.restore"]}
          </Button>
        )}

        {/* Permanent delete: password-gated, no-associated-data only. */}
        <span title={hardDeleteBlockedText ?? undefined} className="self-start">
          <Button
            type="button"
            disabled={pending || patient.hardDeleteBlocked !== null}
            onClick={() => setHardDeleteOpen((v) => !v)}
            variant="destructive"
            size="sm"
          >
            {s["patients.hardDelete"]}
          </Button>
        </span>
      </div>

      {hardDeleteBlockedText && (
        <span className="text-xs text-v2-text-secondary">{hardDeleteBlockedText}</span>
      )}

      {hardDeleteOpen && patient.hardDeleteBlocked === null && (
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-border-strong px-3 py-1.5 text-sm focus:border-brand-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          />
          <Button
            type="submit"
            disabled={pending || password.length === 0}
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
              setPassword("");
            }}
            variant="secondary"
            size="sm"
          >
            {s["common.cancel"]}
          </Button>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </li>
  );
}
