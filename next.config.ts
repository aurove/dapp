import type { NextConfig } from "next";
import path from "path";
import { DOC_REDIRECTS } from "./lib/docs/redirects";

const projectRoot = process.cwd();

const nextConfig: NextConfig = {
  turbopack: {
    // Local pnpm dependencies are linked from the parent workspace. Vercel
    // installs dependencies inside the cloned app, so its tracing and bundling
    // roots should both remain scoped to that app.
    root: process.env.VERCEL ? projectRoot : path.resolve(projectRoot, ".."),
  },
  async redirects() {
    return DOC_REDIRECTS.map((redirect) => ({
      source: redirect.source,
      destination: redirect.destination,
      permanent: true,
    }));
  },
  async headers() {
    // Help crawlers (Google Search Console) treat these as static metadata,
    // not HTML documents.
    return [
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Content-Type",
            value: "application/xml; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          {
            key: "Content-Type",
            value: "text/plain; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
