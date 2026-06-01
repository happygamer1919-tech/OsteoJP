import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { getRequestContext } from "@/lib/auth/context";
import { AppShell } from "@/components/app-shell";

export default async function ClinicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  // Clinical content is sensitive: reception has no clinical_records:read.
  if (!can(ctx.role, "clinical_records:read")) redirect("/dashboard");

  // Global nav comes from AppShell; the page owns its content (padding here
  // since the clinical page renders a bare table).
  return (
    <AppShell>
      <main className="px-8 py-6">{children}</main>
    </AppShell>
  );
}
