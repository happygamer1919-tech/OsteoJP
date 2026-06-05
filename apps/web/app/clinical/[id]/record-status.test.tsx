import { describe, expect, it } from "vitest";
import { getStrings } from "@osteojp/i18n";
import { statusLabel, canDownloadReport } from "./record-status";

const pt = getStrings("pt");

// BUG-15: after a record is signed the header subtitle must read the LIVE
// record_status, consistent with the banner — never a stale "Rascunho". The
// header derives its label from this single helper, so locking the mapping here
// guards the header against drifting from record.status across draft→save→sign.
describe("statusLabel — header reflects live record_status", () => {
  it("renders the signed label for a signed record (not draft)", () => {
    expect(statusLabel("signed")).toBe(pt["clinical.statusSigned"]);
    expect(statusLabel("signed")).not.toBe(pt["clinical.statusDraft"]);
  });

  it("renders the locked label for a locked record", () => {
    expect(statusLabel("locked")).toBe(pt["clinical.statusLocked"]);
    expect(statusLabel("locked")).not.toBe(pt["clinical.statusDraft"]);
  });

  it("renders the draft label for a draft record", () => {
    expect(statusLabel("draft")).toBe(pt["clinical.statusDraft"]);
  });
});

// The "Descarregar PDF" button is finalized-only and reuses the report engine's
// print gate, so its visibility can't diverge from what the engine will render.
describe("canDownloadReport — finalized-only visibility", () => {
  it("hides for a draft (and thus for under-review records, which are drafts)", () => {
    expect(canDownloadReport("draft")).toBe(false);
  });

  it("shows for finalized records (locked / signed)", () => {
    expect(canDownloadReport("locked")).toBe(true);
    expect(canDownloadReport("signed")).toBe(true);
  });
});
