import Link from "next/link";
import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, getStrings } from "@osteojp/i18n";
import { listPatients, searchPatients } from "../../lib/patients/queries";
import { getRequestContext } from "../../lib/auth/context";
import { SearchBox } from "./_components/search-box";
import type { Patient } from "../../lib/patients/types";

export const dynamic = "force-dynamic";

const s = getStrings(DEFAULT_LOCALE);

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await getRequestContext())) redirect("/login");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const rows: Patient[] = query
    ? await searchPatients(query)
    : await listPatients();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {s["patients.title"]}
        </h1>
        <Link
          href="/patients/new"
          className="rounded bg-brand-magenta px-4 py-2 text-sm font-medium text-text-inverse"
        >
          {s["patients.new"]}
        </Link>
      </div>

      <div className="mb-4">
        <SearchBox initialQuery={query} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {query ? s["patients.noResults"] : s["patients.empty"]}
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-text-muted">
            {rows.length} {s["patients.resultsCount"]}
          </p>
          <ul className="divide-y divide-border rounded border border-border">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/patients/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-muted"
                >
                  <span className="font-medium">{p.fullName}</span>
                  <span className="text-sm text-text-secondary">
                    {[p.nif, p.phone].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
