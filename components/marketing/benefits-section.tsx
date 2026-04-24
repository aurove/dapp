import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { SectionHeading } from "@/components/site/section-heading";

const benefits = [
  "Maintain long-duration positioning while introducing practical liquidity.",
  "Exit and ownership transfer flows become cleaner than bespoke veNFT handling.",
  "Settlement and rollover mechanics are structured for reduced operational friction.",
  "Yield exposure is managed through a coherent surface instead of fragmented manual steps.",
] as const;

export function BenefitsSection() {
  return (
    <section id="architecture" className="mt-20">
      <SectionHeading
        badge="Yield & Liquidity Outcomes"
        title="Built for usable liquidity without abandoning Mezo Earn conviction."
        description="Fractals is designed as a flexible operating layer for locked positions, where liquidity, settlement, and yield routing are intentionally connected."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {benefits.map((benefit) => (
          <Card key={benefit} className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Liquidity + Yield Alignment</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-relaxed text-[var(--muted)]">
              <span
                aria-hidden="true"
                className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-soft)]"
              />
              {benefit}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
