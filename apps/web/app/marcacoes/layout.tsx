import { AppShell } from "@/components/app-shell";

export default function MarcacoesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
