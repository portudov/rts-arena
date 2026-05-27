import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo pnpm: inclure les workspaces dans le bundle standalone.
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
  transpilePackages: ["@rts/shared"],
  reactStrictMode: true,
};

export default nextConfig;
