import { AppShell } from "@/components/app-shell";

/**
 * T5 F4 (guide finding, docs/guide, #1462): the SMS reply review queue
 * (/reminders/review) is now a section of the Comunicações group, so it renders
 * inside the same shell as its sibling sections. Without this file it had no
 * side menu and no top bar, like Recuperação before F1, and it skipped the
 * SEC-02 forced-rotation check that AppShell carries.
 *
 * The page's own `sms_replies:read` gate is unchanged.
 */
export default function RemindersLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
