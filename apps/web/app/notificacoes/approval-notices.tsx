import { s } from "@/lib/i18n";
import type { ApprovalNotice } from "@/lib/scheduling/book-confirm-notice";

/**
 * BOOK-CONFIRM: "Paciente sem email: avise por telefone", as a list.
 *
 * ONE COMPONENT FOR EVERY SCREEN THAT CAN ACCEPT A REQUEST AND STAY OPEN. The
 * Pedidos queue and the SMS review queue both resolve a row that then leaves
 * the screen, so the notice cannot live in the row: it is kept beside the list
 * and names the patient it is about. (The two Estado controls close on save and
 * use a toast instead.)
 *
 * A plain function of its props and its own file, because this repository
 * renders components with `renderToStaticMarkup` and has no DOM harness: a
 * notice that only exists inside a click handler is one no test can reach. The
 * two small functions below are the rest of the rule, for the same reason.
 *
 * The sentence is its own element, so "exactly this text" is assertable.
 */
export type ApprovalNoticeView = {
  /** What the notice is keyed on: the appointment, or the review item. */
  id: string;
  /** Which of the reasons nothing could be sent. */
  kind: ApprovalNotice;
  /** Copied at the click: the row is gone by the time the notice shows. */
  patientName: string | null;
  /** The appointment's time, already formatted for Lisbon. May be empty. */
  when: string;
};

/** The list with one more notice; a repeat for the same id replaces the old one. */
export function withApprovalNotice(
  prev: readonly ApprovalNoticeView[],
  notice: ApprovalNoticeView,
): ApprovalNoticeView[] {
  return [...prev.filter((n) => n.id !== notice.id), notice];
}

/**
 * The sentence for each reason, in ONE place, for the two lists and the two
 * toasts alike. A `switch` with no default over the union, so a reason added
 * to `ApprovalNotice` is a type error here instead of a blank notice.
 */
export function approvalNoticeMessage(kind: ApprovalNotice): string {
  switch (kind) {
    case "patient_no_email":
      return s["requests.notice.patientNoEmail"];
    case "location_contact_missing":
      return s["requests.notice.locationContactMissing"];
    case "service_missing":
      return s["requests.notice.serviceMissing"];
  }
}

/** The second line: who to ring and for when. Never an empty separator. */
export function approvalNoticeDetail(n: ApprovalNoticeView): string {
  return [n.patientName ?? s["notifications.noPatient"], n.when].filter(Boolean).join(" · ");
}

export function ApprovalNotices({ notices }: { notices: readonly ApprovalNoticeView[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-col gap-2" data-approval-notices>
      {notices.map((n) => (
        <li
          key={n.id}
          role="status"
          className="rounded-v2 border border-v2-border bg-surface-muted p-3"
        >
          <p className="text-sm font-semibold text-v2-text-primary">
            {approvalNoticeMessage(n.kind)}
          </p>
          <p className="mt-1 text-sm text-v2-text-secondary">{approvalNoticeDetail(n)}</p>
        </li>
      ))}
    </ul>
  );
}
