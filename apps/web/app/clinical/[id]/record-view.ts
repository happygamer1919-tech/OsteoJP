// WHICH BODY THE RECORD PAGE DRAWS. The rule lives in lib/clinical/record-view.ts
// since EXPORT-01, so the record's PDF (lib/clinical/report) asks the same
// question the page does. This path keeps its name for the page and its test.
export { chooseRecordView, type RecordView, type RecordViewInput } from "@/lib/clinical/record-view";
