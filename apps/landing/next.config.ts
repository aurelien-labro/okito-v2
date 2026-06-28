import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // output: "standalone" est utile pour Docker — activé en CI uniquement
  // via NEXT_OUTPUT_STANDALONE=1, sinon build local Windows échoue sur les
  // symlinks (developer mode requis).
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
