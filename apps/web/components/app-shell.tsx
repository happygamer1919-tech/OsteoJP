import { User } from "lucide-react";
import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { logout } from "@/app/logout/actions";
import { s } from "@/lib/i18n";
import { navItemsForRole } from "@/lib/nav/nav-items";

import { StaffShellClient } from "./staff-shell.client";

/**
 * Persistent, role-aware navigation shell for every authenticated route
 * (fixes BUG-04: post-login there was no nav). Rendered by each authenticated
 * section's layout, so it wraps Dashboard, Agenda, Patients, Clinical and Admin.
 *
 * W1-10: migrated to the shared @osteojp/ui top-bar AppShell (SPEC §4.11) via a
 * thin client wrapper (StaffShellClient) that injects next/link + the active
 * pathname. Link visibility is still gated by the permission matrix
 * (navItemsForRole → packages/auth); the shell never decides role visibility.
 *
 * Server component: reads the verified request context, fails closed to /login
 * when there is none, and never renders <main> itself beyond the shell's own.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const items = navItemsForRole(ctx.role);

  // Avatar (decorative) + a labelled logout control. A full avatar dropdown
  // menu awaits a Menu component (Wave 2); the logout button carries its own
  // accessible name, so the user area is fully operable today.
  const userMenu = (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-flex size-8 items-center justify-center rounded-full bg-surface-muted text-text-secondary"
      >
        <User size={20} strokeWidth={1.75} />
      </span>
      <form action={logout}>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2-500 focus-visible:ring-offset-2"
        >
          {s["common.signOut"]}
        </button>
      </form>
    </div>
  );

  return (
    <StaffShellClient items={items} userMenu={userMenu}>
      {children}
    </StaffShellClient>
  );
}
