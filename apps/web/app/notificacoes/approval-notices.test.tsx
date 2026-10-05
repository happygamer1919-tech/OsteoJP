/**
 * approval-notices.test.tsx - BOOK-CONFIRM, the notice as it is drawn.
 *
 * "Paciente sem email: avise por telefone" is shown by two screens that resolve
 * a row and then lose it: the Pedidos queue and the SMS review queue. Both
 * render this one component, so what the approver reads is asserted once.
 *
 * Rendered with `renderToStaticMarkup`, as every component test here is. The
 * names are invented.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboundReviewList, reviewApprovalNotice } from "@/app/reminders/review/inbound-review-list";
import type { InboundReviewItem, ResolveOutcome } from "@/lib/reminders/inbound-store";
import {
  ApprovalNotices,
  approvalNoticeDetail,
  approvalNoticeMessage,
  withApprovalNotice,
  type ApprovalNoticeView,
} from "./approval-notices";

const NOTICE = "Paciente sem email: avise por telefone";

const one: ApprovalNoticeView = {
  id: "appt-1",
  kind: "patient_no_email",
  patientName: "Duarte Ficticio",
  when: "14/05/2031 11:00",
};
const LOCATION_NOTICE =
  "Confirmação não enviada: o local não tem morada ou telefone. Avise o paciente por telefone.";

describe("ApprovalNotices", () => {
  it("renders nothing at all for an empty list", () => {
    expect(renderToStaticMarkup(<ApprovalNotices notices={[]} />)).toBe("");
  });

  it("shows the sentence EXACTLY, as its own element, with who to ring and for when", () => {
    const html = renderToStaticMarkup(<ApprovalNotices notices={[one]} />);
    // Its own element: the text between the tags is the sentence and nothing else.
    expect(html).toContain(`>${NOTICE}</p>`);
    expect(html).toContain("Duarte Ficticio · 14/05/2031 11:00");
    expect(html).toContain('role="status"');
  });

  it("one notice per accepted request", () => {
    const html = renderToStaticMarkup(
      <ApprovalNotices
        notices={[one, { id: "appt-2", kind: "patient_no_email", patientName: "Helena Ficticia", when: "" }]}
      />,
    );
    expect(html.split(NOTICE)).toHaveLength(3);
    expect(html).toContain("Helena Ficticia</p>");
  });
});

describe("the second sentence: the location has no address or phone", () => {
  const location: ApprovalNoticeView = { ...one, id: "appt-9", kind: "location_contact_missing" };

  it("is shown EXACTLY, as its own element, and it is not the patient sentence", () => {
    const html = renderToStaticMarkup(<ApprovalNotices notices={[location]} />);
    expect(html).toContain(`>${LOCATION_NOTICE}</p>`);
    expect(html).not.toContain(NOTICE);
    expect(html).toContain("Duarte Ficticio · 14/05/2031 11:00");
  });

  it("each reason has its own sentence, in both languages' source of truth", () => {
    expect(approvalNoticeMessage("patient_no_email")).toBe(NOTICE);
    expect(approvalNoticeMessage("location_contact_missing")).toBe(LOCATION_NOTICE);
  });

  it("the two can sit side by side, each with its own text", () => {
    const html = renderToStaticMarkup(<ApprovalNotices notices={[one, location]} />);
    expect(html.indexOf(NOTICE)).toBeGreaterThan(-1);
    expect(html.indexOf(LOCATION_NOTICE)).toBeGreaterThan(html.indexOf(NOTICE));
  });
});

describe("approvalNoticeDetail", () => {
  it("names the patient and the time, and never leaves a dangling separator", () => {
    expect(approvalNoticeDetail(one)).toBe("Duarte Ficticio · 14/05/2031 11:00");
    expect(approvalNoticeDetail({ ...one, when: "" })).toBe("Duarte Ficticio");
  });

  it("a patient with no readable name gets the screen's own placeholder, not a blank", () => {
    const detail = approvalNoticeDetail({ ...one, patientName: null });
    expect(detail.endsWith(" · 14/05/2031 11:00")).toBe(true);
    expect(detail.startsWith(" ·")).toBe(false);
  });
});

describe("withApprovalNotice", () => {
  it("adds a notice, and a repeat for the same id replaces it rather than doubling it", () => {
    const first = withApprovalNotice([], one);
    expect(first).toEqual([one]);
    const again = withApprovalNotice(first, { ...one, when: "15/05/2031 09:00" });
    expect(again).toEqual([{ ...one, when: "15/05/2031 09:00" }]);
    expect(withApprovalNotice(first, { ...one, id: "appt-2" })).toHaveLength(2);
  });
});

/* ------------------------- the SMS review queue ------------------------- */

function item(over: Partial<InboundReviewItem> = {}): InboundReviewItem {
  return {
    id: "item-1",
    patientName: "Duarte Ficticio",
    body: "acho que sim",
    receivedAt: "2031-05-10T09:00:00.000Z",
    appointmentId: "appt-1",
    appointmentStartsAt: "2031-05-14T10:00:00.000Z",
    appointmentStatus: "scheduled",
    ...over,
  } as InboundReviewItem;
}

describe("reviewApprovalNotice: what a resolved reply earns", () => {
  const withNotice: ResolveOutcome = { ok: true, applied: true, notice: "patient_no_email" };

  it("the server's notice becomes one for THAT item, with its patient and its appointment time", () => {
    expect(reviewApprovalNotice([item()], "item-1", withNotice)).toEqual({
      id: "item-1",
      kind: "patient_no_email",
      patientName: "Duarte Ficticio",
      // Lisbon wall clock: 10:00Z in May is 11:00.
      when: "14/05/2031, 11:00",
    });
  });

  it.each([
    ["applied, no notice", { ok: true, applied: true }],
    ["nothing applied", { ok: true, applied: false }],
    ["refused: not found", { ok: false, reason: "not_found" }],
    ["refused: double booked", { ok: false, reason: "double_booked" }],
  ] as const)("%s: no notice", (_label, outcome) => {
    expect(reviewApprovalNotice([item()], "item-1", outcome as ResolveOutcome)).toBeNull();
  });

  it("the LOCATION notice from the server becomes the location notice on screen", () => {
    expect(
      reviewApprovalNotice([item()], "item-1", { ok: true, applied: true, notice: "location_contact_missing" }),
    ).toMatchObject({ id: "item-1", kind: "location_contact_missing" });
  });

  it("an item that is no longer in the list still gets its notice, without a name or a time", () => {
    expect(reviewApprovalNotice([], "item-1", withNotice)).toEqual({
      id: "item-1",
      kind: "patient_no_email",
      patientName: null,
      when: "",
    });
  });
});

describe("InboundReviewList shows the notice", () => {
  it("above the list", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[item()]} initialNotices={[one]} />);
    expect(html).toContain(`>${NOTICE}</p>`);
    expect(html.indexOf(NOTICE)).toBeLessThan(html.indexOf('data-testid="inbound-review-list"'));
  });

  it("and above the EMPTY state: the reply that earned it is the one just resolved", () => {
    const html = renderToStaticMarkup(<InboundReviewList items={[]} initialNotices={[one]} />);
    expect(html).toContain(`>${NOTICE}</p>`);
    expect(html).toContain("Duarte Ficticio");
  });

  it("no notice, no notice markup", () => {
    expect(renderToStaticMarkup(<InboundReviewList items={[item()]} />)).not.toContain(NOTICE);
    expect(renderToStaticMarkup(<InboundReviewList items={[]} />)).not.toContain("data-approval-notices");
  });
});
