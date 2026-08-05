import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationBell, UserAreaCluster } from "@osteojp/ui";
import { type Role } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { unreadCount } from "@/lib/notifications/centre";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logout } from "@/app/logout/actions";
import { s } from "@/lib/i18n";
import { navItemsForRole } from "@/lib/nav/nav-items";

import { StaffShellClient } from "./staff-shell.client";

/**
 * Persistent, role-aware navigation shell for every authenticated route.
 * Rendered by each authenticated section's layout, so it wraps Dashboard,
 * Agenda, Patients, Clinical, Marcações and Admin.
 *
 * V2-W0-05: migrated from the v1 top-bar AppShell to the shared @osteojp/ui
 * SidebarAppShell (SPEC-v2-foundation §7) via the StaffShellClient wrapper. Link
 * visibility is still gated by the permission matrix (navItemsForRole →
 * packages/auth); the shell never decides role visibility. The user-area cluster
 * (§7.3) renders from existing session data — no new data, no profile fetch.
 *
 * Server component: reads the verified request context, fails closed to /login
 * when there is none, and never renders <main> itself beyond the shell's own.
 */
const ROLE_LABEL: Record<Role, string> = {
  owner: s["admin.role.owner"],
  admin: s["admin.role.admin"],
  therapist: s["admin.role.therapist"],
  reception: s["admin.role.reception"],
};

// Derive a display name + initials from the session email (the only identity in
// the JWT — there is no name claim and no profile table read here, per "existing
// session data, no new data"). "ana.morais@…" → "Ana Morais" / "AM".
function displayFromEmail(email: string | undefined): { name: string; initials: string } {
  if (!email) return { name: "", initials: "" };
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  const initials =
    parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("") || local.charAt(0).toUpperCase();
  return { name: name || local, initials };
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const items = navItemsForRole(ctx.role);
  const roleLabel = ROLE_LABEL[ctx.role];

  // Read the email claim for the cluster's name/initials (no extra data model).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : undefined;
  const { name, initials } = displayFromEmail(email);

  // W13-02: the bell's badge. Read here rather than in a client component so it
  // is derived from data on every render and cannot drift from the list it
  // describes. Failure is non-fatal — a shell that will not render because the
  // notification count could not be read would take down every staff page for a
  // cosmetic badge, so it degrades to zero and says so in the log.
  let unread = 0;
  try {
    unread = await unreadCount(ctx);
  } catch (err) {
    console.error(
      "[notifications] unread count failed; rendering the bell without a badge",
      err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    );
  }

  // W7-02: the profile was already routed and already linked — but ONLY as the
  // avatar/name chip, whose sole affordance was an aria-label. Sighted users had
  // no way to know it was clickable, so the page was effectively unreachable and
  // the owner never found it. The chip keeps its link; a VISIBLE "O meu perfil"
  // entry now sits beside it, next to Terminar sessão, for every role. Same link
  // primitive and the same styling as the sign-out control — no new shell pattern.
  const userArea = (
    <div className="flex items-center gap-4">
      {/* W13-02 (PG4): the bell is a REAL control with its own destination, and
          it sits OUTSIDE the profile link below. That placement is the whole
          fix. It was previously a decorative aria-hidden span INSIDE
          UserAreaCluster, and the cluster is wrapped in <Link href="/perfil">,
          so every click on the bell navigated to the profile — the symptom the
          owner reported. A guard test pins it outside the link so this cannot
          silently return.

          The count is read server-side from staff_notifications (read_at IS
          NULL), never held in client state that a reload would reset. */}
      <NotificationBell
        href="/notificacoes"
        label={s["notifications.title"]}
        linkComponent={Link}
        unreadCount={unread}
        unreadLabel={(n) =>
          n === 1 ? s["notifications.unreadOne"] : s["notifications.unreadMany"].replace("{n}", String(n))
        }
      />
      {/* W6-02: the user cluster links to the self-service profile (all roles). */}
      <Link
        href="/perfil"
        aria-label={s["nav.profile"]}
        title={s["nav.profile"]}
        className="rounded-v2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <UserAreaCluster
          name={name || roleLabel}
          roleLabel={roleLabel}
          initials={initials || roleLabel.charAt(0).toUpperCase()}
        />
      </Link>
      <Link
        href="/perfil"
        className="inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        {s["nav.myProfile"]}
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-v2 px-3 text-sm font-medium text-v2-text-secondary transition-colors hover:bg-surface-muted hover:text-v2-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {s["common.signOut"]}
        </button>
      </form>
    </div>
  );

  return (
    <StaffShellClient items={items} userArea={userArea}>
      {children}
    </StaffShellClient>
  );
}
