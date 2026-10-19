import Link from "next/link";
import { JsonLd } from "@/components/site/json-ld";
import { getWebPageJsonLd } from "@/lib/seo/json-ld";

type RelatedLink = {
  href: string;
  label: string;
};

type ProductSeoProps = {
  path: string;
  /** Browser/SERP title (also used in WebPage schema). */
  title: string;
  description: string;
  /** Short static bullets crawlers and users can read without wallet/JS state. */
  bullets: readonly string[];
  relatedLinks?: readonly RelatedLink[];
};

/**
 * Server-rendered crawlable intro + WebPage JSON-LD for product app routes.
 * Keeps indexable copy outside client wallet/RPC UI trees.
 */
export function ProductSeo({
  path,
  title,
  description,
  bullets,
  relatedLinks = [],
}: ProductSeoProps) {
  const jsonLd = getWebPageJsonLd({ path, title, description });

  return (
    <>
      <JsonLd data={jsonLd} />
      <section
        className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-4 py-4 sm:px-5"
        aria-label={`${title} overview`}
      >
        <p className="text-sm leading-relaxed text-foreground/65">{description}</p>
        {bullets.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/55">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
        {relatedLinks.length > 0 ? (
          <nav
            className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-foreground/8 pt-3 text-sm"
            aria-label="Related documentation"
          >
            {relatedLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium text-[var(--accent)] transition hover:text-[var(--accent-soft)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </section>
    </>
  );
}
