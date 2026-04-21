import Link from "next/link";
import { ArrowUpRight, Workflow } from "lucide-react";
import { Badge } from "@fractals/ui/components/ui/badge";
import { buttonVariants } from "@fractals/ui/components/ui/button";

export function FinalCtaSection() {
  return (
    <section className="mt-20 pb-4">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--accent)]/40 bg-[linear-gradient(140deg,rgba(18,20,24,0.96),rgba(23,18,10,0.94))] p-8 shadow-[0_25px_70px_rgba(0,0,0,0.36)] sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(216,181,106,0.33),rgba(216,181,106,0))]" />
        <div className="pointer-events-none absolute -bottom-24 left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(77,96,130,0.24),rgba(77,96,130,0))]" />

        <div className="relative z-10 max-w-3xl">
          <Badge className="mb-4">Enter Fractals</Badge>
          <h2 className="text-balance text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
            Access structured liquidity operations for locked veBTC and veMEZO exposure.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
            Move from manual lock handling into a cleaner protocol surface for transferability,
            settlement windows, and yield routing controls.
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
