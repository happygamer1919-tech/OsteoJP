import { s } from "@/lib/i18n";

// Minimal root. The patient portal UI is Wave B; this skeleton ships the auth
// boundary, the activation landing (/auth/set-password), and the health check.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold">{s["app.name"]}</h1>
      <p className="text-sm opacity-80">{s["patientPortal.tagline"]}</p>
    </main>
  );
}
