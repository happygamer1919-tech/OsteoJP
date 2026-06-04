import type { Metadata } from "next";
import SetPasswordClient from "./SetPasswordClient";

// Patient activation landing — target of the single-use recovery link delivered
// over SMS/email. The recovery result arrives in the URL hash fragment, so the
// real work is client-side; this server wrapper only sets metadata + forces
// dynamic rendering. Mirrors the staff set-password page.

export const dynamic = "force-dynamic"; // auth landing; never cache.

export const metadata: Metadata = {
  title: "OsteoJP",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage() {
  return <SetPasswordClient />;
}
