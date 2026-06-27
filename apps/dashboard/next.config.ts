import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@okito/shared"],
  // Output standalone : Docker image minimale (~50MB) avec juste les deps utilisées.
  output: "standalone",
};

export default nextConfig;
