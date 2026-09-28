import { AppShell } from "@/components/app-shell";

/**
 * T5 F1 (guide finding, docs/guide, #1462): Recuperação rendered with no side
 * menu and no top bar, because this route had no layout and every other staff
 * section renders AppShell from its own layout.tsx (comunicacoes, marcacoes,
 * horarios, ...). The guide had to tell staff to leave the page with the
 * browser's back button.
 *
 * THE SHELL IS ALSO A GATE, NOT ONLY CHROME. AppShell carries the SEC-02
 * forced-rotation check (components/app-shell.tsx), so a route without this
 * file also skipped that check. The page's own `followup:read` gate is
 * unchanged, and the CommsNav tab bar still renders inside the shell.
 */
export default function RecuperacaoLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
