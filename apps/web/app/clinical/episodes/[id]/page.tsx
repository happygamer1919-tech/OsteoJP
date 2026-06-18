import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can } from "@osteojp/auth";
import { s, locale } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getEpisodeDetail } from "@/lib/clinical/episodes";
import type { RecordStatus } from "@/lib/clinical/records";

export const dynamic = "force-dynamic";

function statusLabel(status: RecordStatus): string {
  return status === "signed"
    ? s["clinical.statusSigned"]
    : status === "locked"
      ? s["clinical.statusLocked"]
      : s["clinical.statusDraft"];
}

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRequestContext();
  const episode = await getEpisodeDetail(ctx, id);
  if (!episode) notFound();

  const canAuthor = can(ctx.role, "clinical_records:author");
  const openedLabel = new Date(episode.openedAt).toLocaleDateString(
    locale === "pt" ? "pt-PT" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Lisbon" },
  );
  const newRecordHref = `/clinical/new?patientId=${episode.patientId}&episodeId=${episode.id}`;

  return (
    <section className="max-w-3xl space-y-5">
      <Link href={`/patients/${episode.patientId}`} className="inline-flex items-center gap-1 text-sm text-brand-teal">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />{s["clinical.episodeBackToPatient"]}
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{episode.title}</h2>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                episode.status === "open"
                  ? "bg-success-bg text-success"
                  : "bg-surface-muted text-text-secondary"
              }`}
            >
              {episode.status === "open"
                ? s["clinical.episodeStatusOpen"]
                : s["clinical.episodeStatusClosed"]}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {episode.patientName} · {s["clinical.episodeOpened"]} {openedLabel}
            {episode.primaryPractitionerName
              ? ` · ${s["clinical.episodePractitioner"]}: ${episode.primaryPractitionerName}`
              : ""}
          </p>
        </div>
        {canAuthor && (
          <Link
            href={newRecordHref}
            className="rounded border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal hover:bg-surface-muted"
          >
            + {s["clinical.episodeAddRecord"]}
          </Link>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          {s["clinical.episodeRecords"]}
        </h3>
        {episode.records.length === 0 ? (
          <p className="text-sm text-text-secondary">{s["clinical.episodeNoRecords"]}</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">{s["clinical.colTemplate"]}</th>
                <th className="py-2 pr-4 font-medium">{s["clinical.colStatus"]}</th>
                <th className="py-2 pr-4 font-medium">{s["clinical.colVersion"]}</th>
                <th className="py-2 pr-4 font-medium">{s["clinical.colUpdated"]}</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {episode.records.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-4">{r.templateTitle?.[locale] ?? "-"}</td>
                  <td className="py-2 pr-4">{statusLabel(r.status)}</td>
                  <td className="py-2 pr-4">{r.version}</td>
                  <td className="py-2 pr-4">
                    {new Date(r.updatedAt).toLocaleDateString("pt-PT")}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/clinical/${r.id}`} className="underline">
                      {s["clinical.open"]}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
