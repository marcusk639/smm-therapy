import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@smm/db",
    "@smm/types",
    "@smm/inngest",
    "@smm/storage",
    "@smm/compliance",
  ],
};

export default nextConfig;
