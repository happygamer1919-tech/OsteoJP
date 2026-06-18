import { can } from "@osteojp/auth";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import {
  Card,
  EmptyState,
  StatusChip,
  type StatusTone,
} from "@osteojp/ui";
import { Calendar, ChevronLeft, FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequestContext } from "../../../lib/auth/context";
import { listRecords, type RecordStatus } from "../../../lib/clinical/records";
import { getPatient } from "../../../lib/patients/queries";
import type { Patient } from "../../../lib/patients/types";
import { PatientActions } from "../_components/patient-actions";
import { createEpisodeAction } from "./episode-actions";
import { ProfileTabs } from "./profile-tabs";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const secondaryBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded border border-border-strong bg-surface px-4 text-sm font-medium text-text-primary transition-colors duration-fast ease-standard hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
const ghostLink =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const RECORD_TONE: Record<RecordStatus, StatusTone> = {
  draft: "neutral",
  locked: "info",
  signed: "success",
};
const RECORD_KEY = {
  draft: "clinical.statusDraft",
  locked: "clinical.statusLocked",
  signed: "clinical.statusSigned",
} as const;

const dateFmt = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function PatientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; m?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, m } = await searchParams;

  const ctx = await getRequestContext();
  if (!ctx) {
    return (
      <main className="py-16 text-center">
        <p className="text-sm text-text-secondary">{s["common.signIn"]}</p>
      </main>
    );
  }

  const patient = await getPatient(id, { includeDeleted: true });
  if (!patient) notFound();

  const canReadClinical = can(ctx.role, "clinical_records:read");
  const canInvoice = can(ctx.role, "invoices:read");
  const canDelete = can(ctx.role, "patients:delete");
  const canStartEpisode = can(ctx.role, "clinical_records:author");

  // Permission-filtered tabs.
  const tabItems = [
    { value: "resumo", label: s["patients.tabSummary"] },
    { value: "consultas", label: s["patients.tabAppointments"] },
    ...(canReadClinical ? [{ value: "registos", label: s["patients.tabRecords"] }] : []),
    { value: "documentos", label: s["patients.tabDocuments"] },
    ...(canInvoice ? [{ value: "faturacao", label: s["patients.tabInvoicing"] }] : []),
  ];
  const tab = tabItems.some((t) => t.value === tabParam) ? tabParam! : "resumo";

  // Registos clínicos consumes the existing RLS + role-scoped records query.
  const records = tab === "registos" && canReadClinical ? await listRecords(ctx, { patientId: id }) : [];

  return (
    <main>
      <Link href="/patients" className={`${ghostLink} mb-4 inline-flex items-center gap-1`}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />{s["patients.back"]}
      </Link>

      {/* Header card */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-text-secondary">
              {initials(patient.fullName)}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl text-text-primary">{patient.fullName}</h1>
                {patient.mergedIntoId ? (
                  <StatusChip tone="neutral">{s["patients.mergedBadge"]}</StatusChip>
                ) : patient.deletedAt ? (
                  <StatusChip tone="error">{s["patients.deletedBadge"]}</StatusChip>
                ) : null}
              </div>
              <p className="text-sm text-text-secondary">{identityLine(patient)}</p>
              <p className="text-sm text-text-secondary">{contactLine(patient)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/agenda" className={primaryLink}>
              <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
              {s["patients.newAppointment"]}
            </Link>
            {canStartEpisode && (
              <form action={createEpisodeAction}>
                <input type="hidden" name="patientId" value={patient.id} />
                <button type="submit" className={secondaryBtn}>
                  <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                  {s["patients.newEpisode"]}
                </button>
              </form>
            )}
          </div>
        </div>
        {m === "episodeErr" && (
          <p role="alert" className="mt-3 text-sm text-error">{s["patients.episodeError"]}</p>
        )}
      </Card>

      <div className="mb-6">
        <ProfileTabs patientId={id} current={tab} items={tabItems} label={s["patients.tabSummary"]} />
      </div>

      {tab === "resumo" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title={s["patients.cardPersonal"]}
            headerAction={
              <Link href={`/patients/${id}/edit`} className={ghostLink}>
                <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                {s["patients.editRecord"]}
              </Link>
            }
          >
            <Rows
              rows={[
                [s["patients.fieldDateOfBirth"], patient.dateOfBirth ?? "—"],
                [s["patients.fieldSex"], patient.sex ?? "—"],
                [s["patients.fieldNif"], patient.nif ?? "—"],
                [
                  s["patients.fieldAddress"],
                  [patient.address, patient.city, patient.postalCode].filter(Boolean).join(", ") || "—",
                ],
              ]}
            />
          </Card>
          <Card title={s["patients.cardContacts"]}>
            <Rows
              rows={[
                [s["patients.fieldPhone"], patient.phone ?? "—"],
                [s["patients.fieldEmail"], patient.email ?? "—"],
              ]}
            />
          </Card>
        </div>
      )}

      {tab === "consultas" && (
        <EmptyState icon={Calendar} title={s["patients.emptyConsultasTitle"]} description={s["patients.emptyConsultasHelp"]} />
      )}

      {tab === "registos" &&
        (records.length === 0 ? (
          <EmptyState icon={FileText} title={s["patients.emptyRecordsTitle"]} description={s["patients.emptyRecordsHelp"]} heritage />
        ) : (
          <div className="flex flex-col gap-3">
            {records.map((r) => (
              <Card key={r.id} href={`/clinical/${r.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-text-primary">
                      {r.templateTitle ? r.templateTitle[DEFAULT_LOCALE] : s["patients.recordDefaultName"]}
                    </span>
                    <span className="text-sm text-text-secondary">{dateFmt.format(new Date(r.updatedAt))}</span>
                  </div>
                  {/* record_status axis. The ai_review_state second axis is not in
                      the records list query, so it is not shown here (rule #1). */}
                  <StatusChip tone={RECORD_TONE[r.status]} dot>
                    {s[RECORD_KEY[r.status]]}
                  </StatusChip>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === "documentos" && (
        <EmptyState icon={FileText} title={s["patients.emptyDocumentsTitle"]} description={s["patients.emptyDocumentsHelp"]} />
      )}

      {tab === "faturacao" && (
        <EmptyState icon={FileText} title={s["patients.emptyInvoicingTitle"]} description={s["patients.emptyInvoicingHelp"]} />
      )}

      {canDelete && (
        <section className="mt-8">
          <PatientActions patientId={patient.id} isDeleted={Boolean(patient.deletedAt)} />
        </section>
      )}
    </main>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-text-secondary">{label}</dt>
          <dd className="text-sm text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

function identityLine(p: Patient): string {
  const parts: string[] = [];
  const age = ageFrom(p.dateOfBirth);
  if (age !== null) parts.push(`${age} ${s["patients.ageSuffix"]}`);
  if (p.sex) parts.push(p.sex);
  if (p.nif) parts.push(`${s["patients.fieldNif"]} ${p.nif}`);
  return parts.join(" · ") || "—";
}
function contactLine(p: Patient): string {
  return [p.phone, p.email].filter(Boolean).join(" · ") || "—";
}
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mo = now.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
