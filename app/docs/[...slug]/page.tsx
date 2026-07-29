import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs/docs-article";
import { DocsPageTracker } from "@/components/docs/docs-page-tracker";
import { DocsPagination } from "@/components/docs/docs-pagination";
import { DocsProse } from "@/components/docs/prose";
import { StatusBadge } from "@/components/docs/status-badge";
import { getAllDocSlugs, getDocPage } from "@/content/docs/pages";
import { getDocSectionTitle } from "@/lib/docs/navigation";
import { createPageMetadata } from "@/lib/seo/site";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  return getAllDocSlugs().map((slug) => ({
    slug: slug.split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const page = getDocPage(slug);
  if (!page) {
    return createPageMetadata({
      title: "Documentation",
      description: "Aurove protocol documentation.",
      path: "/docs",
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: page.title,
    description: page.description,
    path: `/docs/${page.slug}`,
    keywords: page.tags,
  });
}

export default async function DocArticlePage({ params }: PageProps) {
  const { slug: parts } = await params;
  const slug = parts.join("/");
  const page = getDocPage(slug);
  if (!page) notFound();

  const section = getDocSectionTitle(page.slug);
  const Content = page.Content;

  return (
    <article className="w-full min-w-0">
      <DocsPageTracker slug={page.slug} title={page.title} />
      <DocsArticle
        header={
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {section}
            </p>
            {page.status ? <StatusBadge status={page.status} /> : null}
          </div>
        }
        footer={
          <>
            {page.tags?.length ? (
              <div className="mt-10 flex flex-wrap gap-1.5 border-t border-white/8 pt-6">
                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/45"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <DocsPagination slug={page.slug} />
          </>
        }
      >
        <DocsProse>
          <Content />
        </DocsProse>
      </DocsArticle>
    </article>
  );
}
