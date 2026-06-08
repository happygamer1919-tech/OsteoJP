import type { NextConfig } from "next";

// Patient API app (api.osteojp.pt) — the patient-portal trust surface, SEPARATE
// from the staff platform (apps/web) and the superadmin app (apps/admin). Hosts
// the patient-auth boundary, a health check, and (Wave B) patient endpoints.
// No business endpoints this wave. Deploy region stays EU (fra1) — patient PII.
const nextConfig: NextConfig = {
  transpilePackages: ["@osteojp/ui", "@osteojp/auth", "@osteojp/db", "@osteojp/i18n"],
};

export default nextConfig;
