import { AppShell } from "@/components/app-shell";

export default function ComunicacoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
