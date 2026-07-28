"use client";

import { useEffect } from "react";
import { trackDocsEvent } from "@/lib/docs/analytics";

export function DocsPageTracker({ slug, title }: { slug: string; title: string }) {
  useEffect(() => {
    trackDocsEvent({
      type: "docs_page_view",
      slug,
      title,
      path: `/docs/${slug}`,
    });
  }, [slug, title]);

  return null;
}
