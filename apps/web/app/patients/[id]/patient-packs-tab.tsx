import { EmptyState, GlassPanel } from "@osteojp/ui";
import { Package } from "lucide-react";
import Link from "next/link";

import { s } from "@/lib/i18n";
import { PATIENT_PACKS_READ_CAP, type PatientPacksPage } from "@/lib/packs/in-use";
import { PacksInUseTable } from "../packs/packs-in-use-table";

/**
 * PACK-FICHA-01: the "Packs" tab of the patient's ficha.
 *
 * Reception looks for a patient's pacotes inside the patient's file, as on
 * Fisiozero (FICHA DE UTENTE). "Packs em uso" only had a button on the
 * Pacientes list, so from inside a ficha there was no way to it. This tab
 * shows, for THIS patient, the same table as "Packs em uso" (one shared
 * component, without the NOME UTENTE column): each pacote's name and total,
 * the date it started, RESERVADAS, LIVRES and the session list with dates.
 *
 * Two sections: the pacotes still running (the same rule as "Packs em uso":
 * a free session, or a booked session still ahead) and the finished ones.
 * PAGAMENTO stays empty with "Pagamento: em breve", as on "Packs em uso":
 * nothing records a payment against a pacote yet.
 *
 * PRESENTATIONAL AND SERVER-RENDERED. The read is `listPatientPacks`
 * (lib/packs/in-use-read.ts), under the viewer's own session.
 */
export function PatientPacksTab({ page }: { page: PatientPacksPage }) {
  const { running, finished, truncated } = page;

  return (
    <div className="flex flex-col gap-6" data-testid="patient-packs-tab">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs text-v2-text-secondary">{s["packsInUse.paymentSoon"]}</p>
        <Link
          href="/patients/packs"
          className="text-sm font-medium text-accent-2-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["patientPacks.allPacksLink"]}
        </Link>
      </div>

      {truncated && (
        <p className="text-sm text-v2-text-secondary" role="status" data-testid="patient-packs-truncated">
          {s["patientPacks.truncated"].replace("{n}", String(PATIENT_PACKS_READ_CAP))}
        </p>
      )}

      {running.length === 0 && finished.length === 0 ? (
        <GlassPanel>
          <EmptyState
            icon={Package}
            title={s["patientPacks.emptyTitle"]}
            description={s["patientPacks.emptyBody"]}
          />
        </GlassPanel>
      ) : (
        <>
          <section className="flex flex-col gap-3" data-testid="patient-packs-running">
            {/* W7-03 section header: the purple left rule and a count, as on
                Registos and Documentos. */}
            <div className="flex items-center gap-3 border-l-2 border-accent-1-700 pl-3">
              <h2 className="text-lg text-text-primary">{s["patientPacks.runningTitle"]}</h2>
              <span className="text-sm tabular-nums text-text-secondary">{running.length}</span>
            </div>
            <GlassPanel>
              {running.length === 0 ? (
                <p className="text-sm text-v2-text-secondary">{s["patientPacks.noneRunning"]}</p>
              ) : (
                <PacksInUseTable rows={running} showPatient={false} testId="patient-packs-running-table" />
              )}
            </GlassPanel>
          </section>

          {finished.length > 0 && (
            <section className="flex flex-col gap-3" data-testid="patient-packs-finished">
              <div className="flex items-center gap-3 border-l-2 border-accent-1-700 pl-3">
                <h2 className="text-lg text-text-primary">{s["patientPacks.finishedTitle"]}</h2>
                <span className="text-sm tabular-nums text-text-secondary">{finished.length}</span>
              </div>
              <p className="text-xs text-v2-text-secondary">{s["patientPacks.finishedHint"]}</p>
              <GlassPanel>
                <PacksInUseTable rows={finished} showPatient={false} testId="patient-packs-finished-table" />
              </GlassPanel>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-v2-text-secondary">{s["packsInUse.footnote"]}</p>
    </div>
  );
}
