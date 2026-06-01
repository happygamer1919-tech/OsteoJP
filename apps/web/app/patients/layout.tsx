import { AppShell } from "@/components/app-shell";

export default function PatientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
