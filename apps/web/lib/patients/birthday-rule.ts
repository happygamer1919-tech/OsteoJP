// Indicação de Aniversários: WHICH patients have their birthday today.
//
// Pure: no DB, no server-only. The read in birthdays.ts turns the answer into a
// WHERE clause; this file is the rule, and birthday-rule.test.ts pins it.
//
// THE RULE (docs/DECISIONS.md, 2026-11-02):
//   1. "Today" is the calendar day IN LISBON, never the UTC day. Just after
//      midnight in summer (WEST, UTC+1) Lisbon is already on the next day while
//      UTC is still on the previous one, and the clinic means Lisbon.
//   2. A birthday matches on its month and day. `date_of_birth` is a plain
//      `date` column, so it carries no zone and is compared as written.
//   3. A 29 February birthday shows on 28 February in a year that has no
//      29 February. In a leap year it shows on 29 February only.
//   4. The age shown is the age the patient turns today: this Lisbon year
//      minus the birth year.

import { todayInLisbon } from "@/lib/scheduling/time";

export type LisbonDay = { year: number; month: number; day: number };

/** The Lisbon calendar day of an instant. */
export function lisbonDay(now: Date): LisbonDay {
  const [y, m, d] = todayInLisbon(now).split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const mmdd = (month: number, day: number): string =>
  `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * The "MM-DD" values of `date_of_birth` that celebrate on `today`. One value,
 * except on 28 February of a non-leap year, which also takes "02-29" (rule 3).
 */
export function birthdayMonthDays(today: LisbonDay): string[] {
  const days = [mmdd(today.month, today.day)];
  if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) days.push("02-29");
  return days;
}

/** Whether a "YYYY-MM-DD" date of birth celebrates on `today`. */
export function celebratesOn(dateOfBirth: string, today: LisbonDay): boolean {
  return birthdayMonthDays(today).includes(dateOfBirth.slice(5, 10));
}

/** The age a patient born on `dateOfBirth` ("YYYY-MM-DD") turns on `today`. */
export function ageTurning(dateOfBirth: string, today: LisbonDay): number {
  return today.year - Number(dateOfBirth.slice(0, 4));
}
