import type { ReactNode } from "react";

/** Deployment / product maturity tags used in docs UI. */
export type DocStatus = "live" | "in-development" | "planned";

export type DocFrontmatter = {
  /** URL path under /docs, without leading slash. e.g. "introduction/what-is-aurove" */
  slug: string;
  title: string;
  description: string;
  /** Optional short label for cards / nav. */
  label?: string;
  tags?: string[];
  status?: DocStatus;
  /** Search boost keywords not necessarily shown on page. */
  keywords?: string[];
  /** Plain-text body used for search indexing (auto-filled from content when omitted). */
  searchText?: string;
  order?: number;
};

export type DocPage = DocFrontmatter & {
  /** Rendered page body. */
  content: ReactNode;
};

export type DocPageDefinition = DocFrontmatter & {
  Content: () => ReactNode;
};

export type DocNavItem = {
  title: string;
  slug: string;
  status?: DocStatus;
};

export type DocNavSection = {
  title: string;
  items: DocNavItem[];
};

export type DocSearchDocument = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  body: string;
  section: string;
};
