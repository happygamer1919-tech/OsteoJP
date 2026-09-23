import { describe, expect, it } from "vitest";

import { chooseRecordView, type RecordView } from "./record-view";

/**
 * chooseRecordView: the page's decision, as a truth table.
 *
 * The rows that matter are the ones WITHOUT a schema: before FICHA-IMPORTED-VIEW
 * every one of them drew the imported preview. The controls below are written so
 * that a return to "no template means imported" fails them.
 */
describe("chooseRecordView", () => {
  const SOURCES = ["manual", "ai_ingested", "patient"] as const;
  const STATUSES = ["draft", "locked", "signed"] as const;

  it("a record with a schema is always the form, whatever its origin or status", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        for (const importerSourced of [true, false]) {
          expect(chooseRecordView({ hasSchema: true, importerSourced, source, status })).toBe("form");
        }
      }
    }
  });

  it("no schema and importer-sourced is the imported preview, whatever the source column or status says", () => {
    for (const source of SOURCES) {
      for (const status of STATUSES) {
        expect(chooseRecordView({ hasSchema: false, importerSourced: true, source, status })).toBe("imported");
      }
    }
  });

  it.each<[string, string, string, RecordView]>([
    ["an AI ingestion draft", "ai_ingested", "draft", "ai_recording"],
    ["a manual record", "manual", "draft", "neutral"],
    ["a patient submission draft", "patient", "draft", "neutral"],
    ["an origin this code has never seen", "something_new", "draft", "neutral"],
  ])("no schema, not importer-sourced: %s (source %s, status %s) is %s", (_label, source, status, expected) => {
    expect(chooseRecordView({ hasSchema: false, importerSourced: false, source, status })).toBe(expected);
  });

  // THE CONTROL FOR THE DEFECT. The complaint's record, exactly: no template,
  // source ai_ingested, and no ledger row. The old test answered "imported".
  it("CONTROL: a template-less record the ledger does not mark is never 'imported'", () => {
    for (const source of [...SOURCES, "something_new"]) {
      for (const status of STATUSES) {
        expect(chooseRecordView({ hasSchema: false, importerSourced: false, source, status })).not.toBe(
          "imported",
        );
      }
    }
  });

  // ROUND 2 (reviewer, behaviour lens): every template-less AI record went to
  // the recording-draft panel, including one that had been FINALIZED. The panel
  // is titled as a draft and draws only what the recording filled, so a signed
  // record read "Rascunho" under "finalizada e imutavel" and a reviewer's text
  // outside the recording was on no screen. A finalized one is neutral now.
  it.each(["locked", "signed"])(
    "ROUND 2: a FINALIZED (%s) template-less AI record is neutral, never the draft panel",
    (status) => {
      expect(chooseRecordView({ hasSchema: false, importerSourced: false, source: "ai_ingested", status })).toBe(
        "neutral",
      );
    },
  );

  it("ROUND 2: only status 'draft' reaches the AI recording panel", () => {
    for (const status of [...STATUSES, "something_new"]) {
      const view = chooseRecordView({ hasSchema: false, importerSourced: false, source: "ai_ingested", status });
      expect(view === "ai_recording").toBe(status === "draft");
    }
  });
});
