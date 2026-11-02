import { describe, expect, it } from "vitest";
import { getStrings } from "@osteojp/i18n";
import {
  EXPORT_OVERRIDES_MAX,
  EXPORT_TEXT_MAX,
  defaultHeadingText,
  exportDefaults,
  isExportDate,
  isExportText,
  isExportTime,
  lisbonDateKey,
  lisbonTimeKey,
  overrideAuditEntry,
  overrideAuditMetadata,
  overridesByRecord,
  overridesWithin,
  parseExportOverrides,
} from "./export-overrides";

// RODICA-export-edit-before-download (owner ruling 2026-11-02): the pure rules
// of the export dialog's values. What is pinned:
//
//   VALIDATION  the server checks every value the dialog sends: a real date,
//               a 24-hour "HH:MM" or none, one line of at most 200
//               characters, each registo once, a registo id shaped as one.
//               Anything else refuses the whole export (null).
//   MEMBERSHIP  every registo named is one the export's own selection holds.
//   DEFAULTS    the appointment's Lisbon date and hour; no hour without an
//               appointment; "Conteúdo importado" for an imported registo.
//   AUDIT       an entry only for a registo whose values changed, with the
//               originals and the exported values, and whether the text
//               changed; never the text itself.

const pt = getStrings("pt");
const en = getStrings("en");
const R1 = "7777cccc-7777-4777-8777-777777777771";
const R2 = "7777cccc-7777-4777-8777-777777777772";
const R3 = "7777cccc-7777-4777-8777-777777777773";
const ok = { recordId: R1, date: "2026-11-02", time: "10:30", text: "Conteúdo importado" };

describe("parseExportOverrides: what the dialog sent, checked value by value", () => {
  it("no overrides (undefined or null) is 'keep the appointment's details': an empty list, not a refusal", () => {
    expect(parseExportOverrides(undefined)).toEqual([]);
    expect(parseExportOverrides(null)).toEqual([]);
    expect(parseExportOverrides([])).toEqual([]);
  });

  it("a valid list comes back as given, the text trimmed and the id lower-cased", () => {
    expect(
      parseExportOverrides([
        ok,
        { recordId: R2.toUpperCase(), date: "2024-02-29", time: "", text: "  Texto extra  " },
      ]),
    ).toEqual([ok, { recordId: R2, date: "2024-02-29", time: "", text: "Texto extra" }]);
  });

  it("an emptied text is allowed: it removes the heading", () => {
    expect(parseExportOverrides([{ ...ok, text: "" }])).toEqual([{ ...ok, text: "" }]);
    expect(parseExportOverrides([{ ...ok, text: "   " }])).toEqual([{ ...ok, text: "" }]);
  });

  it.each([
    ["not a list", { ...ok }],
    ["a string", "[]"],
    ["an item that is not an object", ["x"]],
    ["an item that is a list", [[R1, "2026-11-02", "10:30", ""]]],
    ["a missing id", [{ date: ok.date, time: ok.time, text: ok.text }]],
    ["an id that is not a uuid", [{ ...ok, recordId: "r1" }]],
    ["an id that is a number", [{ ...ok, recordId: 1 }]],
    ["a missing date", [{ recordId: R1, time: ok.time, text: ok.text }]],
    ["a date in another shape", [{ ...ok, date: "02/11/2026" }]],
    ["a date that does not exist", [{ ...ok, date: "2026-02-30" }]],
    ["a 29 February outside a leap year", [{ ...ok, date: "2026-02-29" }]],
    ["a month 13", [{ ...ok, date: "2026-13-01" }]],
    ["a year before 1900", [{ ...ok, date: "1899-12-31" }]],
    ["a year after 2100", [{ ...ok, date: "2101-01-01" }]],
    ["an empty date", [{ ...ok, date: "" }]],
    ["an hour 24", [{ ...ok, time: "24:00" }]],
    ["a minute 60", [{ ...ok, time: "10:60" }]],
    ["an hour with seconds", [{ ...ok, time: "10:30:00" }]],
    ["an hour of one digit", [{ ...ok, time: "9:30" }]],
    ["a 12-hour clock", [{ ...ok, time: "10:30 PM" }]],
    ["a missing hour", [{ recordId: R1, date: ok.date, text: ok.text }]],
    ["a missing text", [{ recordId: R1, date: ok.date, time: ok.time }]],
    ["a text that is not a string", [{ ...ok, text: 5 }]],
    ["a text over the limit", [{ ...ok, text: "a".repeat(EXPORT_TEXT_MAX + 1) }]],
    ["a text with a line break", [{ ...ok, text: "linha 1\nlinha 2" }]],
    ["a text with a tab", [{ ...ok, text: "a\tb" }]],
    ["a text with a DEL", [{ ...ok, text: "a\u007fb" }]],
    ["the same registo twice", [ok, { ...ok, time: "11:00" }]],
    ["the same registo twice, spelled in two cases", [ok, { ...ok, recordId: R1.toUpperCase() }]],
    ["a list longer than any file", Array.from({ length: EXPORT_OVERRIDES_MAX + 1 }, () => ok)],
  ])("%s: refused (null)", (_label, raw) => {
    expect(parseExportOverrides(raw)).toBeNull();
  });

  it("CONTROL: a text exactly at the limit, midnight and 23:59 pass", () => {
    expect(parseExportOverrides([{ ...ok, text: "a".repeat(EXPORT_TEXT_MAX) }])).not.toBeNull();
    expect(parseExportOverrides([{ ...ok, time: "00:00" }])).not.toBeNull();
    expect(parseExportOverrides([{ ...ok, time: "23:59" }])).not.toBeNull();
  });

  it("the single-value checks agree with the list check", () => {
    expect(isExportDate("2026-11-02")).toBe(true);
    expect(isExportDate("2026-11-31")).toBe(false);
    expect(isExportTime("")).toBe(true);
    expect(isExportTime("7:05")).toBe(false);
    expect(isExportText("Conteúdo importado")).toBe(true);
    expect(isExportText("a\rb")).toBe(false);
  });
});

describe("overridesWithin: every registo named is one the export holds", () => {
  it("a subset of the export's registos passes, whatever the case of the ids", () => {
    expect(overridesWithin([], [R1])).toBe(true);
    expect(overridesWithin(parseExportOverrides([ok])!, [R1.toUpperCase(), R2])).toBe(true);
  });

  it("a registo outside the export refuses", () => {
    expect(overridesWithin(parseExportOverrides([ok, { ...ok, recordId: R3 }])!, [R1, R2])).toBe(false);
  });

  it("overridesByRecord keys each override by its registo", () => {
    const map = overridesByRecord(parseExportOverrides([ok, { ...ok, recordId: R2 }])!);
    expect([...map.keys()]).toEqual([R1, R2]);
    expect(map.get(R2)!.recordId).toBe(R2);
  });
});

describe("exportDefaults: what a registo prints when nothing is changed", () => {
  it("the appointment's Lisbon date and hour (summer time and winter time)", () => {
    expect(lisbonDateKey(new Date("2026-05-20T09:30:00Z"))).toBe("2026-05-20");
    expect(lisbonTimeKey(new Date("2026-05-20T09:30:00Z"))).toBe("10:30");
    expect(lisbonTimeKey(new Date("2026-11-20T09:30:00Z"))).toBe("09:30");
    // Late evening UTC is the next day in Lisbon in summer.
    expect(lisbonDateKey(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(lisbonTimeKey(new Date("2026-07-01T23:30:00Z"))).toBe("00:30");
  });

  it("a registo with an appointment: its date, its hour, and no heading for a form", () => {
    const at = new Date("2026-05-20T09:30:00Z");
    expect(exportDefaults({ consultationDate: at, appointmentStartsAt: at, view: "form" }, "pt")).toEqual({
      date: "2026-05-20",
      time: "10:30",
      text: "",
    });
  });

  it("a registo with no appointment: the date it prints, and NO hour (its creation time is not one)", () => {
    const created = new Date("2019-05-10T23:00:00Z");
    expect(exportDefaults({ consultationDate: created, appointmentStartsAt: null, view: "imported" }, "pt")).toEqual({
      date: "2019-05-11",
      time: "",
      text: pt["clinical.importedPreviewTitle"],
    });
    expect(exportDefaults({ consultationDate: created, view: "form" }, "pt")!.time).toBe("");
  });

  it("the heading is the stored view's own title, in the locale; none for a form", () => {
    expect(pt["clinical.importedPreviewTitle"]).toBe("Conteúdo importado");
    expect(defaultHeadingText("imported", "pt")).toBe("Conteúdo importado");
    expect(defaultHeadingText("imported", "en")).toBe(en["clinical.importedPreviewTitle"]);
    expect(defaultHeadingText("neutral", "pt")).toBe(pt["clinical.recordContentTitle"]);
    expect(defaultHeadingText("ai_recording", "pt")).toBe(pt["clinical.recordContentTitle"]);
    expect(defaultHeadingText("form", "pt")).toBe("");
  });

  it("no date to print, no defaults", () => {
    expect(exportDefaults({ consultationDate: null, view: "form" }, "pt")).toBeNull();
  });
});

describe("overrideAuditEntry and overrideAuditMetadata: the accountability trail", () => {
  const defaults = { date: "2026-11-01", time: "09:00", text: "Conteúdo importado" };

  it("no override, or one equal to the defaults: no entry", () => {
    expect(overrideAuditEntry(R1, defaults, undefined)).toBeNull();
    expect(overrideAuditEntry(R1, defaults, { recordId: R1, ...defaults })).toBeNull();
  });

  it("a changed date and hour: the originals, the exported values, and the text unchanged", () => {
    expect(overrideAuditEntry(R1, defaults, { recordId: R1, ...defaults, date: "2026-11-02", time: "15:45" })).toEqual({
      recordId: R1,
      originalDate: "2026-11-01",
      originalTime: "09:00",
      exportedDate: "2026-11-02",
      exportedTime: "15:45",
      textChanged: false,
    });
  });

  it("a changed text alone is an entry, with the same date and hour on both sides", () => {
    expect(overrideAuditEntry(R1, defaults, { recordId: R1, ...defaults, text: "" })).toEqual({
      recordId: R1,
      originalDate: "2026-11-01",
      originalTime: "09:00",
      exportedDate: "2026-11-01",
      exportedTime: "09:00",
      textChanged: true,
    });
  });

  it("no hour on either side is written as null, never as an empty string", () => {
    const entry = overrideAuditEntry(R1, { ...defaults, time: "" }, { recordId: R1, ...defaults, time: "", date: "2026-11-03" });
    expect(entry!.originalTime).toBeNull();
    expect(entry!.exportedTime).toBeNull();
    const added = overrideAuditEntry(R1, { ...defaults, time: "" }, { recordId: R1, ...defaults, time: "08:15" });
    expect(added).toMatchObject({ originalTime: null, exportedTime: "08:15" });
  });

  it("the metadata: nothing at all when no registo changed, else the flag and the entries; never the text", () => {
    expect(overrideAuditMetadata(undefined)).toEqual({});
    expect(overrideAuditMetadata([])).toEqual({});
    const entry = overrideAuditEntry(R1, defaults, { recordId: R1, ...defaults, text: "Texto secreto inventado" })!;
    const metadata = overrideAuditMetadata([entry]);
    expect(metadata).toEqual({ overridesApplied: true, overrides: [entry] });
    expect(JSON.stringify(metadata)).not.toContain("Texto secreto");
    expect(JSON.stringify(metadata)).not.toContain("importado");
  });
});
