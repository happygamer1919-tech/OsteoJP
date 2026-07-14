import { AppShell } from "@/components/app-shell";

export default function PerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
