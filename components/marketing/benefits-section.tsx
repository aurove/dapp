import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { SectionHeading } from "@/components/site/section-heading";

const benefits = [
  "Turn lock duration, boost, gauge, and reward details into legible Earn product balances.",
  "Trade Mezo Earn exposure through fungible units instead of bespoke veNFT handling.",
  "Use reward and incentive routing through a coherent product surface.",
  "Keep settlement and redemption mechanics explicit for reduced operational friction.",
] as const;

export function BenefitsSection() {
  return (
    <section id="earn-products" className="mt-20">
      <SectionHeading
        badge="Earn Product Outcomes"
        title="Built to make complex Mezo Earn positions usable."
        description="Fractals connects liquidity, settlement, rewards, boosts, and incentive routing inside simple fungible Earn products."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {benefits.map((benefit) => (
          <Card key={benefit} className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Simple Earn Products</CardTitle>
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
