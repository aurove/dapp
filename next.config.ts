import type { NextConfig } from "next";
import path from "path";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  turbopack: {
    // Local pnpm dependencies are linked from the parent workspace. Vercel
    // installs dependencies inside the cloned app, so its tracing and bundling
    // roots should both remain scoped to that app.
    root: process.env.VERCEL ? projectRoot : path.resolve(projectRoot, ".."),
  },
};

export default nextConfig;
