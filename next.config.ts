import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Lets `next dev` use the same local D1/R2 bindings as the deployed Worker.
// The call is intentionally not awaited; OpenNext owns its initialization.
void initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // OpenNext patches the generated Prisma client for workerd only when both
  // packages stay external to Next's server bundle. Without this, a Worker can
  // accidentally try to load a native Prisma engine at runtime.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "pino", "twilio"],
  experimental: {
    // Allow large multipart uploads (medicine photos) to route handlers.
  },
  // Photos and audio are served through custom route handlers, not /public.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
