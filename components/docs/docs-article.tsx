"use client";

import { useRef, type ReactNode } from "react";
import { DocsContentFooter } from "./docs-content-footer";
import { DocsTocSidebar } from "./docs-toc";

/**
 * Article layout: only the center content pane scrolls.
 * Left docs nav (shell) and right TOC stay fixed in the viewport.
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
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col xl:flex-row xl:gap-10">
      {/* Mobile/tablet TOC above content (collapsible) */}
      <div className="order-1 shrink-0 xl:hidden">
        <DocsTocSidebar contentRef={contentRef} scrollRootRef={scrollRef} variant="mobile" />
      </div>

      {/* Scrollable content column */}
      <div
        ref={scrollRef}
        className="order-2 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 xl:order-1 xl:max-w-3xl"
        data-docs-scroll-container
      >
        {header}
        <div ref={contentRef} className="docs-article-content pb-2">
          {children}
        </div>
        {footer}
        <DocsContentFooter />
      </div>

      {/* Desktop TOC — fixed height, independent scroll if long */}
      <div className="order-3 hidden h-full min-h-0 shrink-0 xl:order-2 xl:block">
        <DocsTocSidebar contentRef={contentRef} scrollRootRef={scrollRef} variant="desktop" />
      </div>
    </div>
  );
}
