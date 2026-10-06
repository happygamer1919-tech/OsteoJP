import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canDownloadReport } from "@/app/clinical/[id]/record-status";
import { importedDocumentPrefix } from "@/lib/patients/imported-documents-path";
import {
  episodeReportFilename,
  episodeReportPath,
  isEpisodeExportable,
  selectEpisodeExport,
  type EpisodeExportRow,
} from "./episode-export-core";
import { isPrintable, type RecordStatus } from "./report-model";

// EPI-01b, piece 3: which registos the episode's file holds, in which order,
// and what the file is called. The rule is the per-record button's, with one
// narrowing (an annulled registo is left out); each arm states one case.

const STATUSES: RecordStatus[] = ["draft", "locked", "signed"];
const AI_STATES: (string | null)[] = [null, "pending_review", "in_review", "approved", "rejected"];

let seq = 0;
function row(over: Partial<EpisodeExportRow> = {}): EpisodeExportRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    status: "signed",
    aiReviewState: null,
    annulled: false,
    createdAt: new Date("2026-09-01T09:00:00Z"),
    version: 1,
    ...over,
  };
}

describe("isEpisodeExportable: the per-record button's rule, and never wider", () => {
  it.each(
    STATUSES.flatMap((status) => AI_STATES.map((aiReviewState) => ({ status, aiReviewState }))),
  )("status $status, AI review $aiReviewState: in the file exactly when the per-record engine prints it", (c) => {
    expect(isEpisodeExportable({ ...c, annulled: false })).toBe(isPrintable(c));
  });

  it("the table, written out: only a finalized registo that is not under AI review", () => {
    const table = STATUSES.flatMap((status) =>
      AI_STATES.map((ai) => `${status}/${ai}:${isEpisodeExportable({ status, aiReviewState: ai, annulled: false })}`),
    );
    expect(table).toEqual([
      "draft/null:false",
      "draft/pending_review:false",
      "draft/in_review:false",
      "draft/approved:false",
      "draft/rejected:false",
      "locked/null:true",
      "locked/pending_review:false",
      "locked/in_review:false",
      "locked/approved:true",
      "locked/rejected:true",
      "signed/null:true",
      "signed/pending_review:false",
      "signed/in_review:false",
      "signed/approved:true",
      "signed/rejected:true",
    ]);
  });

  it.each(STATUSES)("status %s with no AI review: the same answer as the 'Transferir PDF' button's own gate", (status) => {
    expect(isEpisodeExportable({ status, aiReviewState: null, annulled: false })).toBe(canDownloadReport(status));
  });

  it.each(
    STATUSES.flatMap((status) => AI_STATES.map((aiReviewState) => ({ status, aiReviewState }))),
  )("an ANNULLED registo is never in the file (status $status, AI review $aiReviewState)", (c) => {
    expect(isEpisodeExportable({ ...c, annulled: true })).toBe(false);
  });

  it("the narrowing is only a narrowing: nothing the per-record engine refuses is ever admitted", () => {
    for (const status of STATUSES)
      for (const aiReviewState of AI_STATES)
        for (const annulled of [false, true])
          if (isEpisodeExportable({ status, aiReviewState, annulled })) {
            expect(isPrintable({ status, aiReviewState })).toBe(true);
          }
  });
});

describe("selectEpisodeExport: which registos, and how many are left out", () => {
  it("a mixed episode: the locked and the signed are in; the draft, the AI-pending and the annulled are counted out", () => {
    const locked = row({ status: "locked", createdAt: new Date("2026-09-01T09:00:00Z") });
    const draft = row({ status: "draft", createdAt: new Date("2026-09-02T09:00:00Z") });
    const signed = row({ status: "signed", createdAt: new Date("2026-09-03T09:00:00Z") });
    const aiPending = row({ status: "draft", aiReviewState: "pending_review", createdAt: new Date("2026-09-04T09:00:00Z") });
    const annulled = row({ status: "signed", annulled: true, createdAt: new Date("2026-09-05T09:00:00Z") });
    expect(selectEpisodeExport([locked, draft, signed, aiPending, annulled])).toEqual({
      recordIds: [locked.id, signed.id],
      leftOut: 3,
    });
  });

  it("an empty episode: nothing in, nothing left out", () => {
    expect(selectEpisodeExport([])).toEqual({ recordIds: [], leftOut: 0 });
  });

  it("drafts only: nothing in, every one counted", () => {
    expect(selectEpisodeExport([row({ status: "draft" }), row({ status: "draft" })])).toEqual({
      recordIds: [],
      leftOut: 2,
    });
  });

  it("every version of a registo that passes the rule is in the file", () => {
    const v1 = row({ status: "signed", version: 1, createdAt: new Date("2026-09-01T09:00:00Z") });
    const v2 = row({ status: "locked", version: 2, createdAt: new Date("2026-09-08T09:00:00Z") });
    expect(selectEpisodeExport([v2, v1]).recordIds).toEqual([v1.id, v2.id]);
  });
});

describe("selectEpisodeExport: the order is the Registos tab's, oldest first", () => {
  it("by the clinical date, whatever order the rows arrive in", () => {
    const a = row({ createdAt: new Date("2026-07-01T09:00:00Z") });
    const b = row({ createdAt: new Date("2026-08-01T09:00:00Z") });
    const c = row({ createdAt: new Date("2026-09-01T09:00:00Z") });
    for (const arrival of [
      [a, b, c],
      [c, b, a],
      [b, c, a],
    ]) {
      expect(selectEpisodeExport(arrival).recordIds).toEqual([a.id, b.id, c.id]);
    }
  });

  it("the same instant: the lower version first", () => {
    const at = new Date("2026-09-01T09:00:00Z");
    const v2 = row({ createdAt: at, version: 2 });
    const v1 = row({ createdAt: at, version: 1 });
    expect(selectEpisodeExport([v2, v1]).recordIds).toEqual([v1.id, v2.id]);
  });

  it("the same instant and version: by id, so the same rows always give the same file", () => {
    const at = new Date("2026-09-01T09:00:00Z");
    const x = row({ createdAt: at });
    const y = row({ createdAt: at });
    expect(x.id < y.id).toBe(true);
    expect(selectEpisodeExport([y, x]).recordIds).toEqual([x.id, y.id]);
    expect(selectEpisodeExport([x, y]).recordIds).toEqual([x.id, y.id]);
  });

  it("the date outranks the version: an older version 2 prints before a newer version 1", () => {
    const olderV2 = row({ createdAt: new Date("2026-07-01T09:00:00Z"), version: 2 });
    const newerV1 = row({ createdAt: new Date("2026-08-01T09:00:00Z"), version: 1 });
    expect(selectEpisodeExport([newerV1, olderV2]).recordIds).toEqual([olderV2.id, newerV1.id]);
  });

  it("the rows handed in are not reordered", () => {
    const late = row({ createdAt: new Date("2026-09-01T09:00:00Z") });
    const early = row({ createdAt: new Date("2026-07-01T09:00:00Z") });
    const rows = [late, early];
    selectEpisodeExport(rows);
    expect(rows).toEqual([late, early]);
  });
});

describe("the file: where it is stored and what it is called", () => {
  const TENANT = "11111111-1111-4111-8111-111111111111";
  const EPISODE = "7777cccc-7777-4777-8777-777777777771";
  const OBJECT = "99999999-9999-4999-8999-999999999999";

  it("the path is tenant-prefixed and holds ids only", () => {
    expect(episodeReportPath(TENANT, EPISODE, OBJECT)).toBe(
      `${TENANT}/episode-reports/${EPISODE}/${OBJECT}.pdf`,
    );
  });

  /**
   * The folders the other writers of this bucket use, READ FROM THEIR SOURCE,
   * so the comparison is with what they really build and not with a copy of it
   * kept here. Every one of them builds `${ctx.tenantId}/<rest>` in a `path`
   * constant; `<rest>`'s first segment is a named folder, or an id.
   */
  function otherWritersFirstSegments(): { file: string; segment: string }[] {
    const files = [
      "../../../app/clinical/[id]/actions.ts", // the per-record report, the RGPD form
      "../../../app/patients/[id]/declaracao-actions.ts", // the Declaração
      "../storage.ts", // a registo's attachments
      "../../patients/documents.ts", // a patient's documents
    ];
    return files.flatMap((file) =>
      [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/const path = `\$\{ctx\.tenantId\}\/([^`/]+)\//g)].map(
        (m) => ({ file, segment: m[1]! }),
      ),
    );
  }

  it("it can never be another writer's path: its folder is none of theirs, read from their source", () => {
    const others = otherWritersFirstSegments();
    const named = others.map((o) => o.segment).filter((segment) => !segment.startsWith("${"));
    // The scan sees the writers it is about (a scan that found nothing would pass anything).
    expect(named).toEqual(expect.arrayContaining(["reports", "rgpd-forms", "declaracoes", "patient-documents"]));
    // The per-record report's own folder, from the file that builds it.
    expect(others.filter((o) => o.file.endsWith("clinical/[id]/actions.ts")).map((o) => o.segment)).toContain("reports");

    const folder = episodeReportPath(TENANT, EPISODE, OBJECT).split("/")[1]!;
    expect(named).not.toContain(folder);
    // Nor the importer's folder (imported-documents-path.ts).
    expect(folder).not.toBe(importedDocumentPrefix(TENANT).split("/")[1]);
    // The remaining convention puts an ID second (`<tenant>/<record id>/...`, a
    // registo's attachments): the folder is not a uuid, so it is not one of those.
    expect(others.some((o) => o.segment === "${recordId}")).toBe(true);
    expect(folder).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("the download name is the episode id's first block and nothing else", () => {
    expect(episodeReportFilename(EPISODE)).toBe("relatorio-episodio-7777cccc.pdf");
  });
});
