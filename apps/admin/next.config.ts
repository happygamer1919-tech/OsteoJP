import type { NextConfig } from "next";

// Superadmin app. Kept lean — no Sentry wiring here (internal operator tool);
// add it later if platform-ops observability is needed.
const nextConfig: NextConfig = {
  transpilePackages: ["@osteojp/ui", "@osteojp/auth", "@osteojp/db", "@osteojp/i18n"],
};

export default nextConfig;
