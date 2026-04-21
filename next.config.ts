import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@fractals/tx-flow", "@fractals/ui"],
  turbopack: {
    root: path.resolve(thisDir, ".."),
  },
};

export default nextConfig;
