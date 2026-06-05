import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@osteojp/auth";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { getPatient } from "../../../lib/patients/queries";
import { getRequestContext } from "../../../lib/auth/context";
import { PatientActions } from "../_components/patient-actions";
import { createEpisodeAction } from "./episode-actions";
import type { Patient } from "../../../lib/patients/types";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

export default async function PatientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { id } = await params;
  const { m } = await searchParams;

  const ctx = await getRequestContext();
  if (!ctx) {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-16 text-center">
        <p className="text-sm text-text-secondary">{s["common.signIn"]}</p>
      </main>
    );
  }

  const patient = await getPatient(id, { includeDeleted: true });
  if (!patient) notFound();

  const canDelete = can(ctx.role, "patients:delete");
  const canStartEpisode = can(ctx.role, "clinical_records:author");

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link href="/patients" className="text-sm text-brand-teal">
        ← {s["patients.back"]}
      </Link>

      {/* Header card */}
      <section className="mt-3 rounded border border-border p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{patient.fullName}</h1>
              {patient.mergedIntoId ? (
                <Badge tone="zinc">{s["patients.mergedBadge"]}</Badge>
              ) : patient.deletedAt ? (
                <Badge tone="red">{s["patients.deletedBadge"]}</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-text-secondary">{identityLine(patient)}</p>
            <p className="text-sm text-text-secondary">{contactLine(patient)}</p>
          </div>
          <Link
            href={`/patients/${patient.id}/edit`}
            className="rounded border border-border-strong px-3 py-1.5 text-sm"
          >
            {s["patients.editRecord"]}
          </Link>
        </div>

        {m === "episodeErr" && (
          <p className="mt-3 text-sm text-error">{s["patients.episodeError"]}</p>
        )}

        <div className="mt-4 flex gap-3">
          <PlaceholderButton>{s["patients.newAppointment"]}</PlaceholderButton>
          {canStartEpisode ? (
            <form action={createEpisodeAction}>
              <input type="hidden" name="patientId" value={patient.id} />
              <button
                type="submit"
                className="rounded border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal hover:bg-surface-muted"
              >
                + {s["patients.newEpisode"]}
              </button>
            </form>
          ) : (
            <PlaceholderButton>{s["patients.newEpisode"]}</PlaceholderButton>
          )}
        </div>
      </section>

      {/* Tabs */}
      <nav className="mt-5 flex gap-4 border-b border-border text-sm">
        <span className="border-b-2 border-brand-teal pb-2 font-medium text-brand-teal">
          {s["patients.tabSummary"]}
        </span>
        <span className="pb-2 text-text-muted">{s["patients.tabEpisodes"]}</span>
        <span className="pb-2 text-text-muted">{s["patients.tabAppointments"]}</span>
        <span className="pb-2 text-text-muted">{s["patients.tabDocuments"]}</span>
        <span className="pb-2 text-text-muted">{s["patients.tabInvoicing"]}</span>
      </nav>

      {/* Summary (Resumo) — related streams (agenda/clinical/invoicing) populate
          these panels later; shown as empty states for now. */}
      <section className="mt-5 grid grid-cols-2 gap-5">
        <Panel title={s["patients.alertsRedFlags"]}>
          <Empty>{patient.notes ? patient.notes : "-"}</Empty>
        </Panel>
        <Panel title={s["patients.nextAppointment"]}>
          <Empty>{s["patients.noUpcoming"]}</Empty>
        </Panel>
        <Panel title={s["patients.recentEpisodes"]}>
          <Empty>{s["patients.noEpisodes"]}</Empty>
        </Panel>
        <Panel title={s["patients.paymentStatus"]}>
          <Empty>{s["patients.noPayments"]}</Empty>
        </Panel>
      </section>

      {canDelete && (
        <section className="mt-6">
          <PatientActions
            patientId={patient.id}
            isDeleted={Boolean(patient.deletedAt)}
          />
        </section>
      )}
    </main>
  );
}

function identityLine(p: Patient): string {
  const parts: string[] = [];
  const age = ageFrom(p.dateOfBirth);
  if (age !== null) parts.push(`${age} ${s["patients.ageSuffix"]}`);
  if (p.sex) parts.push(p.sex);
  if (p.nif) parts.push(`${s["patients.fieldNif"]} ${p.nif}`);
  return parts.join(" · ") || "-";
}

function contactLine(p: Patient): string {
  return [p.phone, p.email].filter(Boolean).join(" · ") || "-";
}

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border p-4">
      <h2 className="mb-2 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-secondary">{children}</p>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "red" | "zinc" }) {
  const cls =
    tone === "red"
      ? "bg-error-bg text-error"
      : "bg-surface-muted text-text-secondary";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function PlaceholderButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="cursor-not-allowed rounded border border-border px-3 py-1.5 text-sm text-text-muted"
    >
      + {children}
    </button>
  );
}
