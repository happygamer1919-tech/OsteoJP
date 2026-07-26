import { redirect } from "next/navigation";

/**
 * W12-40 — Horários was folded INTO Equipa (/admin/staff): a member's working
 * hours are now edited inside the per-member Gerir modal, not on a separate tab.
 * This route survives only as a redirect so old deep links keep working:
 *   /admin/working-hours?t=<id>  →  /admin/staff?t=<id>  (opens that member's
 *                                    Gerir modal on the Horários section)
 *   /admin/working-hours         →  /admin/staff
 */
export default async function WorkingHoursRedirect({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  redirect(t ? `/admin/staff?t=${encodeURIComponent(t)}` : "/admin/staff");
}
