import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationBell, UserAreaCluster } from "@osteojp/ui";
import { type Role } from "@osteojp/auth";

import { getRequestContext } from "@/lib/auth/context";
import { requiresPasswordRotation } from "@/lib/auth/password-rotation";
import { staffDisplayName, initialsFor } from "@/lib/auth/staff-identity";
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

// FALLBACK ONLY since LE-staff-display-name-is-email-local-part. The shell now
// reads `users.full_name` — the name the clinic typed at invite — and only
// reaches this when that is empty.
//
// IT IS KEPT RATHER THAN DELETED because it is still the best available answer
// for a session with no staff row to read, and deleting it would mean an empty
// header in that case. It is NOT a good answer: for the address a real invite
// used it produced "Chris+terapeuta2". That is why it is no longer first.
//
// "ana.morais@…" → "Ana Morais" / "AM".
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

/**
 * SEC-02 — the forced-rotation gate lives HERE, and the placement is the whole
 * design.
 *
 * WHY THIS COMPONENT. Every authenticated section's layout renders AppShell, so
 * one check covers all eleven of them; a per-page guard would be sixty-one call
 * sites and the sixty-second page added next month would silently miss it.
 *
 * WHY NOT THE PROXY, which would have been better still: `proxy.ts` runs in the
 * middleware runtime and this check needs the database. The driver is
 * postgres.js, which is Node-only, so the read cannot happen there. Recorded
 * because "why is this not in middleware" is the first question a reader has.
 *
 * WHAT THIS DOES NOT COVER, stated rather than left to be discovered: a SERVER
 * ACTION or a route handler invoked directly does not render a shell, so it does
 * not pass through here. Those paths carry their own capability checks, and a
 * caller must first load a page to reach them - which this gate refuses. It is
 * the page-level enforcement, not a universal one, and closing the action-level
 * gap is its own card if the owner wants it.
 */
export async function AppShell({
  children,
  /**
   * Set ONLY by the profile section, which is where the new password is set.
   * Without an exemption the gate would redirect the very screen it redirects
   * TO, and the user could never escape.
   *
   * A PROP RATHER THAN A PATH CHECK because a path check inside a shared
   * component is a second, weaker copy of the routing table: it drifts the
   * moment the route is renamed, and it drifts silently in the direction of
   * letting people through.
   */
  allowDuringPasswordRotation = false,
}: {
  children: React.ReactNode;
  allowDuringPasswordRotation?: boolean;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  // Deliberately NOT wrapped in a try. `requiresPasswordRotation` throws on a
  // state it cannot resolve, and swallowing that would turn "I do not know
  // whether this password is temporary" into "it is fine" - the exact collapse
  // PORTAL-REHYDRATE 1.3 names, on the path where being wrong grants access.
  if (!allowDuringPasswordRotation && (await requiresPasswordRotation(ctx))) {
    redirect("/perfil");
  }

  const items = navItemsForRole(ctx.role);
  const roleLabel = ROLE_LABEL[ctx.role];

  // Read the email claim for the cluster's name/initials (no extra data model).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === "string" ? data.claims.email : undefined;
  // LE-staff-display-name-is-email-local-part: the name the clinic actually
  // typed wins; the email guess is the fallback for a session with no row.
  //
  // BEST-EFFORT ON PURPOSE, unlike the rotation gate above it. That one decides
  // ACCESS and throws when it cannot answer; this decides a GREETING, and
  // refusing to render the platform because a name could not be read would be a
  // wildly disproportionate failure. A miss degrades to the previous behaviour.
  let stored: string | null = null;
  try {
    stored = await staffDisplayName(ctx);
  } catch (e) {
    console.error(
      "[shell] display name unavailable, falling back to the email derivation",
      e instanceof Error ? e.name : "unknown",
    );
  }
  const fromEmail = displayFromEmail(email);
  const name = stored ?? fromEmail.name;
  const initials = stored ? initialsFor(stored) : fromEmail.initials;

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
