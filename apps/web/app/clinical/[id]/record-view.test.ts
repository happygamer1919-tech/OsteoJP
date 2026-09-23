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

  it("a record with a schema is always the form, whatever its origin", () => {
    for (const source of SOURCES) {
      for (const importerSourced of [true, false]) {
        expect(chooseRecordView({ hasSchema: true, importerSourced, source })).toBe("form");
      }
    }
  });

  it("no schema and importer-sourced is the imported preview, whatever the source column says", () => {
    for (const source of SOURCES) {
      expect(chooseRecordView({ hasSchema: false, importerSourced: true, source })).toBe("imported");
    }
  });

  it.each<[string, string, RecordView]>([
    ["an AI ingestion draft", "ai_ingested", "ai_recording"],
    ["a manual record", "manual", "neutral"],
    ["a patient submission draft", "patient", "neutral"],
    ["an origin this code has never seen", "something_new", "neutral"],
  ])("no schema, not importer-sourced: %s (source %s) is %s", (_label, source, expected) => {
    expect(chooseRecordView({ hasSchema: false, importerSourced: false, source })).toBe(expected);
  });

  // THE CONTROL FOR THE DEFECT. The complaint's record, exactly: no template,
  // source ai_ingested, and no ledger row. The old test answered "imported".
  it("CONTROL: a template-less record the ledger does not mark is never 'imported'", () => {
    for (const source of [...SOURCES, "something_new"]) {
      expect(chooseRecordView({ hasSchema: false, importerSourced: false, source })).not.toBe("imported");
    }
  });
});
