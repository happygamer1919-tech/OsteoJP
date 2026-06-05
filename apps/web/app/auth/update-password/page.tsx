import type { Metadata } from "next";
import UpdatePasswordClient from "./UpdatePasswordClient";

// Set-password landing for the staff invite recovery flow (#3). The real work
// happens client-side (the recovery result arrives in the URL hash fragment) —
// this server wrapper only supplies page metadata and forces dynamic rendering.

export const dynamic = "force-dynamic"; // auth landing; never cache.

export const metadata: Metadata = {
  title: "OsteoJP",
  // An authentication landing page must never be indexed.
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return <UpdatePasswordClient />;
}
