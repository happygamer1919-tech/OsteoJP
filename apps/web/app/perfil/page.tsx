import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { users } from "@osteojp/db";
import { getRequestContext, runScoped } from "@/lib/auth/context";
import { s } from "@/lib/i18n";

import { ProfileClient } from "./profile-client";

export const metadata = { title: s["profile.title"] };

/**
 * W6-02 (b) - self-service profile. Available to EVERY authenticated role for
 * their OWN account only: there is no capability gate (self-service is not
 * users:manage, which is admin-over-others). The page loads only the actor's own
 * row (id = ctx.userId); the mutations are server-scoped in actions.ts.
 */
export default async function PerfilPage() {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");

  const [me] = await runScoped(ctx, (tx) =>
    tx
      .select({ fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1),
  );

  return (
    <ProfileClient initialName={me?.fullName ?? ""} email={me?.email ?? ""} />
  );
}
