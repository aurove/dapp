import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/docs-shell";
import { getDocSearchDocuments } from "@/content/docs/pages";
import { createPageMetadata } from "@/lib/seo/site";

export const metadata = createPageMetadata({
  title: "Documentation · Aurove Docs",
  description:
    "Aurove documentation for the Mezo deployment — guides, protocol design, and canonical contract addresses.",
  path: "/docs",
  absoluteTitle: true,
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
