import { AppShell } from "@/components/app-shell";

/**
 * SEC-02: the ONE section exempt from the forced-rotation gate, because it is
 * where the new password is set. Without this the gate would redirect the screen
 * it redirects TO and the user could never escape it.
 *
 * The exemption is this narrow on purpose - it is a single boolean on a single
 * layout, so the set of exempt routes is one line long and cannot grow by
 * accident.
 */
export default function PerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell allowDuringPasswordRotation>{children}</AppShell>;
}
