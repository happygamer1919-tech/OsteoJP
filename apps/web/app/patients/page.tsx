import {
  EmptyState,
  SkeletonTable,
  Table,
  TableCardRow,
  type TableColumn,
} from "@osteojp/ui";
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

// Filled-teal primary action (accent-2-700), the §1 single primary above the
// fold. Matches the /dashboard primaryLink so the staff app reads consistent.
const primaryLink =
  "inline-flex h-10 items-center justify-center gap-2 rounded bg-accent-2-700 px-4 text-sm font-semibold text-text-inverse transition-colors duration-fast ease-standard hover:bg-accent-2-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

// Person row: name (body-sm, weight 500) over a NIF-or-phone secondary line.
function PersonCell({ patient }: { patient: Patient }) {
  const secondary = patient.nif ?? patient.phone ?? "";
  return (
    <div className="flex flex-col">
      <span className="font-medium text-text-primary">{patient.fullName}</span>
      {secondary ? (
        <span className="text-xs text-text-secondary">{secondary}</span>
      ) : null}
    </div>
  );
}

/**
 * Patients list (SPEC-staff-screens §11.1): find a patient fast, create a new
 * one. Presentation only — the role-scoped listPatients / searchPatients queries
 * and the patients:read permission are unchanged.
 *
 * The "Última consulta" column from §11.1 is intentionally not rendered: it
 * needs a last-appointment join the read-side query does not provide, and §11.6
 * forbids query changes on these restyle screens. The i18n key
 * (patients.colLastVisit) is reserved for when the data layer supports it.
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl text-text-primary">{s["patients.title"]}</h1>
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
          <div className="rounded-lg border border-border bg-surface p-4">
            <SkeletonTable rows={8} cols={3} />
          </div>
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

  const columns: Array<TableColumn<Patient>> = [
    {
      key: "patient",
      header: s["patients.colPatient"],
      cell: (p) => <PersonCell patient={p} />,
    },
    {
      key: "phone",
      header: s["patients.colPhone"],
      cell: (p) => (
        <span className="text-text-secondary">{p.phone ?? "—"}</span>
      ),
    },
    {
      key: "open",
      header: <span className="sr-only">{s["patients.openLabel"]}</span>,
      align: "right",
      cell: () => (
        <ChevronRight
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="inline-block text-text-muted"
        />
      ),
    },
  ];

  return (
    <>
      {rows.length === 0 ? (
        query ? (
          <EmptyState
            icon={Search}
            title={s["patients.noResultsTitle"]}
            description={s["patients.noResultsHelp"]}
          />
        ) : (
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
        )
      ) : (
        <>
          {/* Desktop: dense table. */}
          <div className="hidden sm:block">
            <Table
              caption={s["patients.tableCaption"]}
              columns={columns}
              data={rows}
              rowKey={(p) => p.id}
              getRowHref={(p) => `/patients/${p.id}`}
              getRowLabel={(p) => `${s["patients.openLabel"]}: ${p.fullName}`}
            />
          </div>

          {/* Mobile: stacked card rows. */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <TableCardRow
                  href={`/patients/${p.id}`}
                  aria-label={`${s["patients.openLabel"]}: ${p.fullName}`}
                  items={[
                    { label: s["patients.colPatient"], value: p.fullName },
                    {
                      label: s["patients.colPhone"],
                      value: p.phone ?? "—",
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
