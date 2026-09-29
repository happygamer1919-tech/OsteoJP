import { AppShell } from "@/components/app-shell";

/**
 * G1: Suporte e Guia sits inside the staff shell like every other staff
 * section. The shell is also a gate (the SEC-02 forced rotation check in
 * components/app-shell.tsx), which is one more reason no staff route renders
 * without it.
 */
export default function AjudaLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
