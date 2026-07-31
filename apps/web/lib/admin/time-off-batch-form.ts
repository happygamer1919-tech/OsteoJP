import type { TimeOffBatchInput } from "./time-off";

/**
 * PL-22 — parse the "bloquear lote" form into a batch input.
 *
 * Its own module because BOTH block action files need it (Equipa's
 * /admin/working-hours and reception's /horarios post to different redirects
 * but the same writes), and a `"use server"` file may only export async
 * functions, so a shared parser cannot live in either of them. Pure, so the
 * form contract is unit-tested rather than exercised only through a redirect.
 *
 * Everything arrives as strings from a plain HTML form. Nothing here decides
 * policy: the dates, the scope check and the overlap report all happen in
 * createTimeOffBlockBatch, which re-validates every field it uses.
 */
export function parseTimeOffBatchForm(fd: FormData): TimeOffBatchInput {
  // Checkbox group: a plain form posts one entry per ticked box, and none at
  // all when the user ticks nothing - which generateLoteSchedule reads as "the
  // start date's own weekday", the same fallback Agendar lote uses.
  const weekdays = fd
    .getAll("weekdays")
    .map((v) => Number(String(v)))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const endMode = String(fd.get("endMode") ?? "count");
  const end: TimeOffBatchInput["end"] =
    endMode === "until"
      ? { kind: "until", date: String(fd.get("until") ?? "") }
      : { kind: "count", count: Number(String(fd.get("count") ?? "4")) || 1 };

  return {
    userId: String(fd.get("userId") ?? ""),
    startDate: String(fd.get("startDate") ?? ""),
    weekdays,
    everyWeeks: Number(String(fd.get("everyWeeks") ?? "1")) || 1,
    end,
    startTime: String(fd.get("startTime") ?? ""),
    endTime: String(fd.get("endTime") ?? ""),
    note: String(fd.get("note") ?? ""),
  };
}
