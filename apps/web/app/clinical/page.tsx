import Link from "next/link";
import { can } from "@osteojp/auth";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listRecords, type RecordStatus } from "@/lib/clinical/records";

function statusLabel(status: RecordStatus): string {
  return status === "signed" ? s["clinical.statusSigned"]
    : status === "locked" ? s["clinical.statusLocked"]
    : s["clinical.statusDraft"];
}

export default async function ClinicalListPage() {
  const ctx = await requireRequestContext();
  const records = await listRecords(ctx);
  // BUG-06: only authors (owner/therapist) can create a record. /clinical/new
  // redirects non-authors back here, so showing "Nova Ficha" to a read-only
  // role (admin) produced a dead button. Gate the button on the same
  // capability the create flow enforces.
  const canAuthor = can(ctx.role, "clinical_records:author");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{s["clinical.title"]}</h2>
        {canAuthor && (
          <Link href="/clinical/new" className="rounded border px-3 py-1.5 text-sm font-medium">
            {s["clinical.new"]}
          </Link>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">{s["clinical.colPatient"]}</th>
            <th className="py-2 pr-4 font-medium">{s["clinical.colTemplate"]}</th>
            <th className="py-2 pr-4 font-medium">{s["clinical.colStatus"]}</th>
            <th className="py-2 pr-4 font-medium">{s["clinical.colVersion"]}</th>
            <th className="py-2 pr-4 font-medium">{s["clinical.colUpdated"]}</th>
            <th className="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3 text-text-secondary">
                {s["clinical.empty"]}
              </td>
            </tr>
          )}
          {records.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2 pr-4">{r.patientName}</td>
              <td className="py-2 pr-4">{r.templateTitle?.[locale] ?? "-"}</td>
              <td className="py-2 pr-4">{statusLabel(r.status)}</td>
              <td className="py-2 pr-4">{r.version}</td>
              <td className="py-2 pr-4">{new Date(r.updatedAt).toLocaleDateString("pt-PT")}</td>
              <td className="py-2 pr-4">
                <Link href={`/clinical/${r.id}`} className="underline">
                  {s["clinical.open"]}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
