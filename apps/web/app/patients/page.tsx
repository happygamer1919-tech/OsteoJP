import { EmptyState, GlassPanel, SkeletonTable } from "@osteojp/ui";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getRequestContext } from "../../lib/auth/context";
import { s } from "../../lib/i18n";
import { listPatients, searchPatients } from "../../lib/patients/queries";
import type { Patient } from "../../lib/patients/types";
import { SearchBox } from "./_components/search-box";

export const dynamic = "force-dynamic";

// Primary action: filled Wellness Green (SPEC-v2-patients §1.2). green-700 is the
// shallowest step that clears AA for white label text (text-inverse on
// v2-green-700 = 4.7:1); hover deepens to green-800. rounded-v2 + focus ring
// match the shell's own buttons.
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2 bg-v2-green-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-v2-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// First + last initial, the patient-icon avatar (Wellness Green tint per the
// palette role). green-800 on green-100 = 5.8:1, AA-safe even though the glyph is
// decorative (the name sits right beside it).
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.charAt(0) ?? "";
  const last =
    parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-v2-green-100 text-xs font-semibold text-v2-green-800"
    >
      {initialsOf(name)}
    </span>
  );
}

// Avatar + name over a NIF secondary line. NIF is on the existing list query
// (Patient = patients.$inferSelect), so the §2 NIF assumption resolves in favour
// of rendering it; absent, the line is simply omitted.
function PersonCell({ patient }: { patient: Patient }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={patient.fullName} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-v2-text-primary">
          {patient.fullName}
        </span>
        {patient.nif ? (
          <span className="text-xs text-v2-text-secondary">
            {s["patients.fieldNif"]} {patient.nif}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Patients list (SPEC-v2-patients): glass-system restyle of the staff patients
 * screen. Presentation only — the role-scoped listPatients / searchPatients
 * queries and the patients:read permission are unchanged, and the cross-tenant
 * Suspense guardrail below is preserved verbatim.
 *
 * HeritageFrame is supplied globally by the SidebarAppShell (V2-W0-05) at
 * density="restrained" behind the content area; this screen does not add its own.
 *
 * The "Última consulta" column (patients.colLastVisit) stays unrendered: it needs
 * a last-appointment join the read-side query does not provide, and a design wave
 * never adds query fields. The key is reserved for when the data layer supports it.
 */
export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await getRequestContext())) redirect("/login");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  // The skeleton lives in a LOCAL Suspense around the data fetch, not a
  // segment-level loading.tsx: a loading.tsx here would wrap the whole
  // /patients subtree (incl. /patients/[id]) in a Suspense boundary, turning
  // [id]'s notFound() 404 into a streamed 200 and breaking the cross-tenant
  // guardrail. The header + search render immediately; only the results stream.
  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-v2-text-primary">
            {s["patients.title"]}
          </h1>
          <p className="mt-1 text-sm text-v2-text-secondary">
            {s["patients.subtitle"]}
          </p>
        </div>
        <Link href="/patients/new" className={primaryLink}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          {s["patients.new"]}
        </Link>
      </div>

      <div className="mb-4">
        <SearchBox initialQuery={query} />
      </div>

      <Suspense
        key={query}
        fallback={
          <GlassPanel>
            <SkeletonTable rows={8} cols={3} />
          </GlassPanel>
        }
      >
        <PatientsResults query={query} />
      </Suspense>
    </main>
  );
}

async function PatientsResults({ query }: { query: string }) {
  const rows: Patient[] = query
    ? await searchPatients(query)
    : await listPatients();

  // Zero-patients: a first-run welcome with the create action and the heritage
  // band (an allowed empty surface), standalone so the band has room.
  if (rows.length === 0 && !query) {
    return (
      <EmptyState
        heritage
        icon={Users}
        title={s["patients.emptyTitle"]}
        description={s["patients.emptyHelp"]}
        action={
          <Link href="/patients/new" className={primaryLink}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            {s["patients.new"]}
          </Link>
        }
      />
    );
  }

  // Zero-results: stay on the list surface and invite refining the search; never
  // offer "Novo Paciente" as the resolution (SPEC §3).
  if (rows.length === 0) {
    return (
      <GlassPanel>
        <EmptyState
          icon={Search}
          title={s["patients.noResultsTitle"]}
          description={s["patients.noResultsHelp"]}
        />
      </GlassPanel>
    );
  }

  return (
    <GlassPanel>
      {/* Desktop: dense table. The whole row is the control (single tab stop via
          the stretched link); the chevron is decorative. */}
      <div className="hidden sm:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">{s["patients.tableCaption"]}</caption>
          <thead>
            <tr className="border-b border-v2-border text-left">
              <th
                scope="col"
                className="pb-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["patients.colPatient"]}
              </th>
              <th
                scope="col"
                className="pb-3 text-xs font-medium text-v2-text-secondary"
              >
                {s["patients.colPhone"]}
              </th>
              <th scope="col" className="pb-3">
                <span className="sr-only">{s["patients.openLabel"]}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.id}
                className="relative border-b border-v2-border transition-colors duration-fast ease-standard last:border-0 hover:bg-v2-green-50"
              >
                <td className="py-3 pr-4 align-middle">
                  <PersonCell patient={p} />
                  <Link
                    href={`/patients/${p.id}`}
                    aria-label={`${s["patients.openLabel"]}: ${p.fullName}`}
                    className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
                  />
                </td>
                <td className="py-3 pr-4 align-middle text-sm text-v2-text-secondary">
                  {p.phone ?? "—"}
                </td>
                <td className="py-3 align-middle text-right">
                  <ChevronRight
                    size={20}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="inline-block text-v2-text-secondary"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked rows, same single-tab-stop link semantics. */}
      <ul className="divide-y divide-v2-border sm:hidden">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/patients/${p.id}`}
              aria-label={`${s["patients.openLabel"]}: ${p.fullName}`}
              className="flex items-center gap-3 rounded-v2 px-1 py-3 transition-colors duration-fast ease-standard hover:bg-v2-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <Avatar name={p.fullName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-v2-text-primary">
                  {p.fullName}
                </p>
                {p.nif ? (
                  <p className="truncate text-xs text-v2-text-secondary">
                    {s["patients.fieldNif"]} {p.nif}
                  </p>
                ) : null}
                <p className="truncate text-xs text-v2-text-secondary">
                  {p.phone ?? "—"}
                </p>
              </div>
              <ChevronRight
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-v2-text-secondary"
              />
            </Link>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
