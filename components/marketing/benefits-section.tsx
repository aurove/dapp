import { SectionHeading } from "@/components/site/section-heading";

const benefits = [
  "Maintain long-duration positioning while introducing practical liquidity.",
  "Exit and ownership transfer flows become cleaner than bespoke veNFT handling.",
  "Settlement and rollover mechanics are structured for reduced operational friction.",
  "Yield exposure is managed through a coherent surface instead of fragmented manual steps.",
] as const;

export function BenefitsSection() {
  return (
    <section id="architecture" className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8 lg:py-20">
      <div className="protocol-panel rounded-3xl p-7 sm:p-10">
        <SectionHeading
          eyebrow="Yield & Liquidity Outcomes"
          title="Built for usable liquidity without abandoning Mezo Earn conviction."
          description="Fractals is designed as a high-trust operating layer for locked positions, where liquidity, settlement, and yield routing are intentionally connected."
        />

        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {benefits.map((benefit) => (
            <li
              key={benefit}
              className="glass-card rounded-2xl p-5 text-sm leading-7 text-[var(--foreground)]"
            >
              <span
                className="mr-3 inline-block h-2 w-2 rounded-full bg-[var(--accent)]"
                aria-hidden
              />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
