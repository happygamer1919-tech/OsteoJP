import type { Metadata } from "next";
import ForgotPasswordClient from "./ForgotPasswordClient";

// LE-staff-no-forgot-password - staff password-recovery request screen. The
// work is client-side (see the rate-limiting note in ForgotPasswordClient);
// this server wrapper supplies metadata and forces dynamic rendering.

export const dynamic = "force-dynamic"; // auth screen; never cache.

export const metadata: Metadata = {
  title: "OsteoJP",
  // An authentication screen must never be indexed.
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
