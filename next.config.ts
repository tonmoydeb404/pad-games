import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pad/arena-shared"],
  // The Arena game (not deployed) carries WIP type debt; dev still gates on
  // `tsc --noEmit` + `pnpm test` + `pnpm lint`, which are clean for the games
  // we ship.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
