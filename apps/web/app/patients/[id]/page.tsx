import { can } from "@osteojp/auth";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import {
  Button,
  Card,
  EmptyState,
  StatusChip,
  type StatusTone,
} from "@osteojp/ui";
import { ChevronLeft, FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getRequestContext } from "../../../lib/auth/context";
import { listRecords, type RecordStatus } from "../../../lib/clinical/records";
import { listInvoices, type InvoiceStatus } from "../../../lib/invoices/queries";
import { formatPatientNumber } from "../../../lib/patients/format";
import { getPatient } from "../../../lib/patients/queries";
import type { Patient } from "../../../lib/patients/types";
import { listPatientAppointments } from "../../../lib/scheduling/data";
import { listPatientNoteRevisions } from "../../../lib/patients/note-revisions";
import { NotesComposer } from "./notes-composer";
import { PatientActions } from "../_components/patient-actions";
import { versionRecordAction } from "../../clinical/[id]/actions";
import { AppointmentsList } from "./appointments-list";
import { createEpisodeAction } from "./episode-actions";
import { ProfileTabs } from "./profile-tabs";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
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

const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  draft: "neutral",
  issued: "warning",
  paid: "success",
  void: "error",
};
const INVOICE_STATUS_KEY: Record<InvoiceStatus, keyof typeof s> = {
  draft: "invoicing.statusDraft",
  issued: "invoicing.statusIssued",
  paid: "invoicing.statusPaid",
  void: "invoicing.statusVoid",
};

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

  // Permission-filtered tabs. aria-controls links each tab button to its panel.
  const tabItems = [
    { value: "resumo", label: s["patients.tabSummary"], "aria-controls": "tabpanel-resumo" },
    { value: "consultas", label: s["patients.tabAppointments"], "aria-controls": "tabpanel-consultas" },
    { value: "notas", label: s["patients.tabNotes"], "aria-controls": "tabpanel-notas" },
    ...(canReadClinical ? [{ value: "registos", label: s["patients.tabRecords"], "aria-controls": "tabpanel-registos" }] : []),
    { value: "documentos", label: s["patients.tabDocuments"], "aria-controls": "tabpanel-documentos" },
    ...(canInvoice ? [{ value: "faturacao", label: s["patients.tabInvoicing"], "aria-controls": "tabpanel-faturacao" }] : []),
  ];
  const tab = tabItems.some((t) => t.value === tabParam) ? tabParam! : "resumo";

  const personalRows: [string, string][] = [
    [s["patients.fieldDateOfBirth"], patient.dateOfBirth ? dateFmt.format(new Date(patient.dateOfBirth)) : "—"],
    [s["patients.fieldSex"], patient.sex ? formatSex(patient.sex) : "—"],
    [s["patients.fieldNif"], patient.nif ?? "—"],
    // patient_number is NOT NULL post-backfill (migration 0029); still rendered
    // defensively so the row is simply omitted rather than showing "—" if absent.
    ...(patient.patientNumber
      ? ([[s["patients.patientNumber"], formatPatientNumber(patient.patientNumber)]] as [string, string][])
      : []),
    // Contactos folded into Dados pessoais (one card instead of two). No field
    // dropped — phone/email relocated here from the old Contactos card.
    [s["patients.fieldPhone"], patient.phone ?? "—"],
    [s["patients.fieldEmail"], patient.email ?? "—"],
  ];
  // Street `address` is intentionally not surfaced (address-reduction direction,
  // 2026-06-30): localidade (city) + região are shown below instead. The DB
  // column is retained; historical data still lives there.
  if (patient.profession) personalRows.push([s["patients.fieldProfession"], patient.profession]);
  if (patient.city) personalRows.push([s["patients.fieldCity"], patient.city]);
  if (patient.region) personalRows.push([s["patients.fieldRegion"], patient.region]);
  // Patient notes moved to the append-only Notas tab (W2-11); the profile
  // summary no longer reads patients.notes.

  // Registos clínicos consumes the existing RLS + role-scoped records query.
  const records = tab === "registos" && canReadClinical ? await listRecords(ctx, { patientId: id }) : [];
  // Faturação tab: fetch invoices for this patient when the tab is active.
  const patientInvoices = tab === "faturacao" && canInvoice ? await listInvoices(ctx, { patientId: id }) : [];
  // Consultas tab: this patient's appointment history (Row 3 — schedule-again).
  const patientAppointments = tab === "consultas" ? await listPatientAppointments(ctx, id) : [];
  // Notas tab: append-only note history from patient_note_revisions (0030).
  const noteRevisions = tab === "notas" ? await listPatientNoteRevisions(ctx, id) : [];

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
                <Button type="submit" variant="secondary" iconLeft={Plus}>
                  {s["patients.newEpisode"]}
                </Button>
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
        <div role="tabpanel" id="tabpanel-resumo" aria-label={s["patients.tabSummary"]}>
          {/* Single Dados pessoais card — Contactos (phone/email) folded in via
              personalRows above. One card instead of two. */}
          <div className="max-w-2xl">
            <Card
              title={s["patients.cardPersonal"]}
              headerAction={
                <Link href={`/patients/${id}/edit`} className={ghostLink}>
                  <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                  {s["patients.editRecord"]}
                </Link>
              }
            >
              <Rows rows={personalRows} />
            </Card>
          </div>
        </div>
      )}

      {tab === "consultas" && (
        <div role="tabpanel" id="tabpanel-consultas" aria-label={s["patients.tabAppointments"]}>
          <AppointmentsList appointments={patientAppointments} />
        </div>
      )}

      {tab === "notas" && (
        <div role="tabpanel" id="tabpanel-notas" aria-label={s["patients.tabNotes"]}>
          <Card title={s["patients.tabNotes"]}>
            {/* Append-only note history (0030). Composer adds a new revision;
                existing revisions are never edited or deleted. */}
            <NotesComposer patientId={id} />
            {noteRevisions.length === 0 ? (
              <p className="mt-4 text-sm text-text-secondary">{s["patients.notesEmpty"]}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {noteRevisions.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border-strong p-3">
                    <p className="whitespace-pre-wrap text-sm text-text-primary">{r.content}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {r.authorName ?? s["patients.noteSystemAuthor"]} ·{" "}
                      {new Date(r.createdAt).toLocaleString("pt-PT")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "registos" && (
        <div role="tabpanel" id="tabpanel-registos" aria-label={s["patients.tabRecords"]}>
          {/* Fichas placement (ruling F): all clinical-record entry points live
              here. "Nova ficha" reuses the /clinical/new creation flow, pre-scoped
              to this patient. */}
          {canStartEpisode && (
            <div className="mb-4 flex justify-end">
              <Link href={`/clinical/new?patientId=${id}`} className={primaryLink}>
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                {s["clinical.new"]}
              </Link>
            </div>
          )}
          {records.length === 0 ? (
            <EmptyState icon={FileText} title={s["patients.emptyRecordsTitle"]} description={s["patients.emptyRecordsHelp"]} heritage />
          ) : (
            <div className="flex flex-col gap-3">
              {records.map((r) => (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/clinical/${r.id}`} className="flex min-w-0 flex-col gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                      <span className="font-medium text-text-primary">
                        {r.templateTitle ? r.templateTitle[DEFAULT_LOCALE] : s["patients.recordDefaultName"]}
                      </span>
                      <span className="text-sm text-text-secondary">{dateFmt.format(new Date(r.updatedAt))}</span>
                    </Link>
                    <div className="flex items-center gap-3">
                      {/* record_status axis. The ai_review_state second axis is not in
                          the records list query, so it is not shown here (rule #1). */}
                      <StatusChip tone={RECORD_TONE[r.status]} dot>
                        {s[RECORD_KEY[r.status]]}
                      </StatusChip>
                      {/* Per-ficha addendum: reuse the existing versionRecordAction.
                          A finalized (non-draft) ficha is immutable; changes create a
                          new version. Author-gated. */}
                      {canStartEpisode && r.status !== "draft" && (
                        <form action={versionRecordAction.bind(null, r.id)}>
                          <Button type="submit" variant="secondary">{s["clinical.newVersion"]}</Button>
                        </form>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "documentos" && (
        <div role="tabpanel" id="tabpanel-documentos" aria-label={s["patients.tabDocuments"]}>
          <EmptyState icon={FileText} title={s["patients.emptyDocumentsTitle"]} description={s["patients.emptyDocumentsHelp"]} />
        </div>
      )}

      {tab === "faturacao" && (
        <div role="tabpanel" id="tabpanel-faturacao" aria-label={s["patients.tabInvoicing"]}>
          {patientInvoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={s["patients.emptyInvoicingTitle"]}
              description={s["patients.emptyInvoicingHelp"]}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {patientInvoices.map((inv) => (
                <Card key={inv.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-text-primary">
                        {inv.externalId ?? `#${inv.id.slice(-6)}`}
                      </span>
                      <span className="text-sm text-text-secondary">
                        {inv.issuedAt ? dateFmt.format(new Date(inv.issuedAt)) : "—"}
                        {inv.amountCents != null &&
                          ` · ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: inv.currency }).format(inv.amountCents / 100)}`}
                      </span>
                    </div>
                    <StatusChip tone={INVOICE_STATUS_TONE[inv.status]} dot>
                      {s[INVOICE_STATUS_KEY[inv.status]]}
                    </StatusChip>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {canDelete && (
        <section className="mt-8">
          <PatientActions patientId={patient.id} isDeleted={Boolean(patient.deletedAt)} />
        </section>
      )}
    </main>
  );
}

function formatSex(sex: string): string {
  if (sex === "male") return s["patients.sexMale"];
  if (sex === "female") return s["patients.sexFemale"];
  if (sex === "other") return s["patients.sexOther"];
  return s["patients.sexOther"];
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
  if (p.sex) parts.push(formatSex(p.sex));
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
