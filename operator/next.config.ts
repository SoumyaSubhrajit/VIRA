import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse loads its worker relative to its installed package at runtime.
  // Keeping it external prevents the production bundler from separating them.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
