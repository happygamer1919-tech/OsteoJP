import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { listDeletedPatients, getPatientHardDeleteBlockers } from "@/lib/patients/queries";
import { s } from "@/lib/i18n";

import { DeletedPatientsList, type DeletedPatientView } from "./deleted-patients-list";

export const metadata = { title: s["admin.deletedPatients.title"] };

/**
 * W6-04 - owner-only "Pacientes eliminados" recovery view. Route-level gate
 * (redirect any non-owner) PLUS query-level enforcement (listDeletedPatients and
 * the actions assert patients:recover). Lists soft-deleted + duplicate-marked
 * patients with their NIF; Restore (soft-deleted) reuses restorePatient;
 * permanent delete stays restricted to no-associated-data patients behind the
 * scrypt password gate.
 */
export default async function PacientesEliminadosPage() {
  const actor = await getRequestContext();
  if (!actor) redirect("/login");
  // Owner-only: route-level enforcement (not just nav hiding).
  if (!can(actor.role, "patients:recover")) redirect("/dashboard");

  const rows = await listDeletedPatients();

  // Per-row hard-delete eligibility (owner-only view, small list): a patient with
  // clinical records or any other references cannot be permanently deleted.
  const views: DeletedPatientView[] = await Promise.all(
    rows.map(async (r) => {
      const blockers = await getPatientHardDeleteBlockers(r.id);
      const hardDeleteBlocked = blockers.hasClinicalRecords
        ? "records"
        : blockers.hasOtherReferences
          ? "references"
          : null;
      return { ...r, hardDeleteBlocked };
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl text-v2-text-primary">{s["admin.deletedPatients.title"]}</h2>
        <p className="text-sm text-v2-text-secondary">{s["admin.deletedPatients.subtitle"]}</p>
      </div>
      <DeletedPatientsList patients={views} />
    </section>
  );
}
