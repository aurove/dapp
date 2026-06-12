import Link from "next/link";
import { ArrowUpRight, Workflow } from "lucide-react";
import { Badge, buttonVariants } from "@ui";

export function FinalCtaSection() {
  return (
    <section className="mt-20 pb-4">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--accent)]/40 bg-[linear-gradient(140deg,rgba(18,20,24,0.96),rgba(23,18,10,0.94))] p-8 shadow-[0_25px_70px_rgba(0,0,0,0.36)] sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(230,210,173,0.12),transparent_34%),linear-gradient(240deg,rgba(77,96,130,0.12),transparent_48%)]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(230,210,173,0.46),transparent)]" />

        <div className="relative z-10 max-w-3xl">
          <Badge className="mb-4">Enter Aurove</Badge>
          <h2 className="text-balance text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
            Access simple fungible Earn products for veBTC and veMEZO exposure.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
            Move from manual lock, gauge, boost, reward, and routing decisions into a cleaner
            product surface users can understand, trade, and use.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/app" className={buttonVariants({ size: "lg", className: "gap-2" })}>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              Launch App
            </Link>
            <a
              href="#how-it-works"
              className={buttonVariants({ variant: "secondary", size: "lg", className: "gap-2" })}
            >
              <Workflow className="h-4 w-4" aria-hidden="true" />
              Review Flow
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
