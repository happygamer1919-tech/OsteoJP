import { redirect } from "next/navigation";
import Link from "next/link";
import { can } from "@osteojp/auth";
import { s } from "@/lib/i18n";
import { getRequestContext } from "@/lib/auth/context";

export default async function ClinicalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getRequestContext();
  if (!ctx) redirect("/login");
  // Clinical content is sensitive: reception has no clinical_records:read.
  if (!can(ctx.role, "clinical_records:read")) redirect("/dashboard");

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b px-8 py-4">
        <Link href="/clinical" className="text-lg font-semibold">
          {s["clinical.title"]}
        </Link>
        <Link href="/dashboard" className="text-sm underline">
          {s["nav.dashboard"]}
        </Link>
      </header>
      <main className="px-8 py-6">{children}</main>
    </div>
  );
}
