// GATE BL-1a (PHONE-01) — the input table, in ONE place.
//
// Driven twice: at the parser (patient-phone.test.ts) and through the patient
// validation layer the staff form saves with (apps/web/lib/patients/
// validation.test.ts). One table, so the two layers cannot be tested against
// different ideas of what "every input shape" means.
//
// Not a test file itself, so importing it from another package's test does not
// run anything twice.

import type { PatientPhoneKind, PatientPhoneRefusal } from "./patient-phone";

export const ACCEPTED: ReadonlyArray<[input: string, stored: string, kind: PatientPhoneKind]> = [
  // +351, E.164
  ["+351912345678", "+351912345678", "pt_mobile"],
  ["+351 912 345 678", "+351912345678", "pt_mobile"],
  ["+351.912.345.678", "+351912345678", "pt_mobile"],
  ["+351-912-345-678", "+351912345678", "pt_mobile"],
  ["+351 (912) 345 678", "+351912345678", "pt_mobile"],
  ["(+351) 912 345 678", "+351912345678", "pt_mobile"],
  // bare 9-digit national
  ["912345678", "+351912345678", "pt_mobile"],
  ["912 345 678", "+351912345678", "pt_mobile"],
  ["912.345.678", "+351912345678", "pt_mobile"],
  ["912-345-678", "+351912345678", "pt_mobile"],
  ["(912) 345-678", "+351912345678", "pt_mobile"],
  ["  912 345 678  ", "+351912345678", "pt_mobile"],
  // 00351
  ["00351912345678", "+351912345678", "pt_mobile"],
  ["00351 912 345 678", "+351912345678", "pt_mobile"],
  ["00351.912.345.678", "+351912345678", "pt_mobile"],
  ["00351-912-345-678", "+351912345678", "pt_mobile"],
  ["(00351) 912 345 678", "+351912345678", "pt_mobile"],
  // 351 without + or 00 (normalizePhonePT has always accepted it)
  ["351912345678", "+351912345678", "pt_mobile"],
  ["351 912 345 678", "+351912345678", "pt_mobile"],
  // landlines: accepted and stored, SMS cannot reach them
  ["213456789", "+351213456789", "pt_landline"],
  ["21 345 67 89", "+351213456789", "pt_landline"],
  ["21.345.67.89", "+351213456789", "pt_landline"],
  ["21-345-67-89", "+351213456789", "pt_landline"],
  ["(21) 345 67 89", "+351213456789", "pt_landline"],
  ["+351 21 345 67 89", "+351213456789", "pt_landline"],
  ["00351 272 000 111", "+351272000111", "pt_landline"],
  // foreign: accepted in explicit international form only
  ["+44 7700 900123", "+447700900123", "foreign"],
  ["0044 7700 900 123", "+447700900123", "foreign"],
  ["+33 6 12 34 56 78", "+33612345678", "foreign"],
  ["+33.6.12.34.56.78", "+33612345678", "foreign"],
  ["+1 (415) 555-2671", "+14155552671", "foreign"],
  ["+55 11 91234-5678", "+5511912345678", "foreign"],
  ["+49 1512 3456789", "+4915123456789", "foreign"],
  // the shortest and longest foreign lengths accepted
  ["+12345678", "+12345678", "foreign"],
  ["+123456789012345", "+123456789012345", "foreign"],
];

export const REFUSED: ReadonlyArray<[input: string, reason: PatientPhoneRefusal]> = [
  ["912 345 67a", "characters"],
  ["tel. 912345678", "characters"],
  ["912/345/678", "characters"],
  ["912345678+", "plus_position"],
  ["351+912345678", "plus_position"],
  ["++351912345678", "plus_position"],
  ["+", "country_code"],
  ["00", "country_code"],
  ["+0912345678", "country_code"],
  ["000351912345678", "country_code"],
  ["+35191234567", "pt_length"],
  ["+3519123456789", "pt_length"],
  ["00351 91 234 567", "pt_length"],
  ["+351 812 345 678", "pt_prefix"],
  ["00351 112 345 678", "pt_prefix"],
  ["812345678", "pt_prefix"],
  ["351812345678", "pt_prefix"],
  ["91234567", "no_prefix_length"],
  ["9123456789", "no_prefix_length"],
  ["447700900123", "no_prefix_length"],
  ["1234", "no_prefix_length"],
  ["+4477009", "foreign_length"],
  ["+4477009001234567", "foreign_length"],
];
