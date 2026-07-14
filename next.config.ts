import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pino", "sharp", "twilio"],
  experimental: {
    // Allow large multipart uploads (medicine photos) to route handlers.
  },
  // Photos and audio are served through custom route handlers, not /public.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
