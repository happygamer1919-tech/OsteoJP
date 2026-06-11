import { redirect } from "next/navigation";
import { BrandLockup } from "@osteojp/ui";
import { s } from "@/lib/i18n";
import { getRequestContext } from "@/lib/auth/context";
import { logout } from "@/app/logout/actions";
import { NavLinks } from "./nav-links";
import { navItemsForRole } from "@/lib/nav/nav-items";

/**
 * Persistent, role-aware navigation shell for every authenticated route
 * (fixes BUG-04: post-login there was no nav). Rendered by each authenticated
 * section's layout, so it wraps Dashboard, Agenda, Patients, Clinical and Admin.
 *
 * Link visibility is gated by the permission matrix (packages/auth):
 *   - Clinical  → clinical_records:read  (reception is denied → no Clinical)
 *   - Admin     → settings:read          (owner + admin only)
 * Dashboard / Agenda / Patients are available to every authenticated role.
 *
 * Server component: it reads the verified request context, fails closed to
 * /login when there is none, and never renders <main> itself (the wrapped
 * pages own that), so there is no nested-main.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const items = navItemsForRole(ctx.role);

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-6 py-5">
          <BrandLockup variant="lockup" size="md" />
          <span className="text-h4 font-semibold tracking-tight">
            <span className="text-brand-teal">Osteo</span>
            <span className="text-brand-magenta">JP</span>
          </span>
        </div>

        <NavLinks items={items} />

        <form action={logout} className="mt-auto border-t border-border p-3">
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-body-sm text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          >
            {s["common.signOut"]}
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-bg">{children}</div>
    </div>
  );
}
