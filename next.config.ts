import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(thisDir, ".."),
  },
};

export default nextConfig;
