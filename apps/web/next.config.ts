import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@osteojp/ui", "@osteojp/auth", "@osteojp/db", "@osteojp/i18n"],
};

export default nextConfig;
