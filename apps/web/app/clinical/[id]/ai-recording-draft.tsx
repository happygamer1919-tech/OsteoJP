import type { Locale } from "@osteojp/i18n";
import Link from "next/link";

import type { AiRecordingDraftSummary } from "@/lib/clinical/ai-recording-draft";
import { labelOf, type FieldSchema, type TemplateSchema } from "@/lib/clinical/form-template";
import type { AiReviewState, RecordStatus } from "@/lib/clinical/records";
import { locale, s } from "@/lib/i18n";

import { sectionLabel } from "./field-display";
import { renderStoredValue } from "./stored-record-content";

/**
 * The label a filled AI key is shown under: the Ficha Medica template's OWN
 * field label, the one the form draws for that field, never the English
 * contract key. A nested path reads as its section then its field, joined by
 * " · " ("Anamnese por Sistemas · Neurologico").
 *
 * The top segment goes through `sectionLabel`, the nested ones through
 * `labelOf`, exactly as RecordForm labels them, so the two screens agree.
 *
 * FALLS BACK TO THE KEY PATH when there is no template schema or the template
 * has no field at that path. Both are deploy faults (the compatibility test pins
 * every one of the twelve keys to a field of the current template); the value
 * is still shown, under the one name that is certainly right.
 */
export function aiDraftFieldLabel(
  schema: TemplateSchema | null,
  path: string,
  loc: Locale,
): string {
  if (!schema) return path;
  const [head, ...rest] = path.split(".");
  const top = schema.properties[head!];
  if (!top) return path;
  const labels = [sectionLabel(top, loc, head!)];
  let field: FieldSchema | undefined = top;
  for (const segment of rest) {
    field = field?.properties?.[segment];
    if (!field) return path;
    labels.push(labelOf(field, loc, segment));
  }
  return labels.join(" · ");
}

/**
 * Where "Abrir em Revisao Consulta" goes, or null for no link.
 *
 * - Only a principal who can review gets a link: the review routes send
 *   everyone else back to /clinical.
 * - Only a DRAFT: the review detail route redirects a finalized record back to
 *   this page, so a link from here would be a loop.
 * - `in_review` goes to the review screen for this record, which is claimed and
 *   editable there.
 * - `pending_review` goes to the review QUEUE, because the review screen only
 *   saves and finalizes a claimed record (`assertUnderReview`, review.ts) and
 *   the claim ("Assumir") is made from the queue. Linking a pending draft
 *   straight to its review screen would open an editor whose save is refused.
 * - Any other review state is not in the queue at all, so there is nowhere to
 *   send it.
 */
export function aiDraftReviewHref({
  recordId,
  status,
  aiReviewState,
  canReview,
}: {
  recordId: string;
  status: RecordStatus;
  aiReviewState: AiReviewState | null;
  canReview: boolean;
}): string | null {
  if (!canReview || status !== "draft") return null;
  if (aiReviewState === "in_review") return `/clinical/review/${recordId}`;
  if (aiReviewState === "pending_review") return "/clinical/review";
  return null;
}

/**
 * FICHA-IMPORTED-VIEW: AN AI INGESTION DRAFT, SHOWN AS WHAT IT IS.
 *
 * A draft the AI ingestion endpoint wrote from a consultation recording. Until
 * it is claimed for review it has no template, and this page used to draw it
 * under "Conteudo importado", which it is not. It now says where it came from,
 * that it waits for review, what the recording filled in, and, when that is
 * nothing, that the recording produced no content.
 *
 * READ-ONLY BY CONSTRUCTION: no form, no input, no action. The only way on is a
 * link to the review screen, which is where an AI draft is edited and finalized
 * (CLAUDE.md rule 4). Staff-facing copy only.
 */
export function AiRecordingDraft({
  recordId,
  summary,
  fichaSchema,
  status,
  aiReviewState,
  canReview,
}: {
  recordId: string;
  /** `summariseAiRecordingDraft(record.data)`, computed once by the page. */
  summary: AiRecordingDraftSummary;
  /** The current Ficha Medica schema, for the field labels; null falls back to key paths. */
  fichaSchema: TemplateSchema | null;
  status: RecordStatus;
  aiReviewState: AiReviewState | null;
  canReview: boolean;
}) {
  const reviewHref = aiDraftReviewHref({ recordId, status, aiReviewState, canReview });
  const awaitingReview =
    status === "draft" && (aiReviewState === "pending_review" || aiReviewState === "in_review");

  return (
    <section
      aria-labelledby="ai-recording-draft-title"
      data-testid="ai-recording-draft"
      className="flex flex-col gap-3"
    >
      <h2 id="ai-recording-draft-title" className="text-base font-semibold text-text-primary">
        {s["clinical.aiDraftTitle"]}
      </h2>
      <p className="text-sm text-text-secondary">{s["clinical.aiDraftHelp"]}</p>
      {awaitingReview && <p className="text-sm text-text-secondary">{s["clinical.aiDraftPending"]}</p>}

      {summary.empty ? (
        <p className="text-sm text-text-primary" data-testid="ai-recording-draft-empty">
          {s["clinical.aiDraftEmpty"]}
        </p>
      ) : (
        <>
          {summary.filled.length > 0 && (
            <dl className="flex flex-col gap-4" data-testid="ai-recording-draft-fields">
              {summary.filled.map(({ path, value }) => (
                <div key={path} className="flex flex-col gap-1">
                  <dt className="text-sm font-medium text-text-secondary">
                    {aiDraftFieldLabel(fichaSchema, path, locale)}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-text-primary">
                    {renderStoredValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {summary.unknownKeys.length > 0 && (
            // Key NAMES only, as on the review screen: the values stay in the
            // stored payload, where the reviewer reads them.
            <p className="text-sm text-text-secondary" data-testid="ai-recording-draft-unknown">
              {s["review.unknownKeysTitle"]}: {summary.unknownKeys.join(", ")}
            </p>
          )}
        </>
      )}

      {reviewHref && (
        <p>
          <Link
            href={reviewHref}
            data-testid="ai-recording-draft-review-link"
            className="inline-flex items-center rounded-md text-sm font-medium text-accent-1-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            {s["clinical.aiDraftReviewLink"]}
          </Link>
        </p>
      )}
    </section>
  );
}
