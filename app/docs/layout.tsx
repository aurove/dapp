import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/docs-shell";
import { getDocSearchDocuments } from "@/content/docs/pages";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata = createPageMetadata({
  title: "Documentation",
  description:
    "Aurove Protocol Documentation — learn how Aurove transforms locked veBTC and veMEZO positions into liquid yield assets on Mezo.",
  path: "/docs",
  keywords: [
    "Aurove docs",
    "protocol documentation",
    "veBTC",
    "veMEZO",
    "ID20",
    "Mezo Earn",
  ],
});

export default function DocsLayout({ children }: { children: ReactNode }) {
  const searchDocuments = getDocSearchDocuments();

  return <DocsShell searchDocuments={searchDocuments}>{children}</DocsShell>;
}
