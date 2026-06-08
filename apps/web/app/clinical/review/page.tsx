import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { listReviewQueue, type ReviewQueueItem } from "@/lib/clinical/review";
import { claimAction } from "./actions";

function sourceLabel(source: ReviewQueueItem["source"]): string {
  return source === "ai" ? s["review.sourceAi"] : s["review.sourcePatient"];
}

function stateLabel(state: ReviewQueueItem["state"]): string {
  return state === "in_review" ? s["review.stateInReview"] : s["review.statePending"];
}

export default async function ReviewQueuePage() {
  const ctx = await requireRequestContext();
  // Reviewing/finalizing is a clinician action (therapist/owner). Admin can read
  // clinical records (so the /clinical layout lets it in) but cannot review —
  // bounce it back rather than render a queue it can't act on.
  if (!can(ctx.role, "clinical_records:review")) redirect("/clinical");

  const items = await listReviewQueue(ctx);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{s["review.title"]}</h2>
        <p className="text-sm text-text-secondary">{s["review.subtitle"]}</p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-medium">{s["review.colPatient"]}</th>
            <th className="py-2 pr-4 font-medium">{s["review.colSource"]}</th>
            <th className="py-2 pr-4 font-medium">{s["review.colItem"]}</th>
            <th className="py-2 pr-4 font-medium">{s["review.colState"]}</th>
            <th className="py-2 pr-4 font-medium">{s["review.colUpdated"]}</th>
            <th className="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3 text-text-secondary">
                {s["review.empty"]}
              </td>
            </tr>
          )}
          {items.map((item) => (
            <tr key={`${item.source}:${item.id}`} className="border-b">
              <td className="py-2 pr-4">{item.patientName}</td>
              <td className="py-2 pr-4">{sourceLabel(item.source)}</td>
              <td className="py-2 pr-4">{item.label}</td>
              <td className="py-2 pr-4">{stateLabel(item.state)}</td>
              <td className="py-2 pr-4">
                {new Date(item.updatedAt).toLocaleDateString("pt-PT")}
              </td>
              <td className="py-2 pr-4">
                <form action={claimAction}>
                  <input type="hidden" name="source" value={item.source} />
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="underline">
                    {item.state === "in_review" ? s["review.open"] : s["review.claim"]}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
