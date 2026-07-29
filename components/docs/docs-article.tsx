"use client";

import { useRef, type ReactNode } from "react";
import { DocsTocSidebar } from "./docs-toc";

/**
 * Article body + page contents nav:
 * - mobile/tablet: collapsible "On this page" above the article
 * - desktop (xl+): sticky right-hand sidebar
 */
export function DocsArticle({
  header,
  children,
  footer,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex w-full min-w-0 flex-col xl:flex-row xl:items-start xl:gap-10">
      <div className="order-2 min-w-0 flex-1 xl:order-1 xl:max-w-3xl">
        {header}
        <div ref={contentRef} className="docs-article-content">
          {children}
        </div>
        {footer}
      </div>
      <div className="order-1 w-full xl:order-2 xl:w-auto">
        <DocsTocSidebar contentRef={contentRef} />
      </div>
    </div>
  );
}
