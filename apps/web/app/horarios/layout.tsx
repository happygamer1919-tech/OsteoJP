import { AppShell } from "@/components/app-shell";

export default function HorariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
