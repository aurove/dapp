import { Card, CardContent, CardHeader, CardTitle } from "@ui";
import { SectionHeading } from "@/components/site/section-heading";

const benefits = [
  "Turn a Mezo Earn position into something easier to understand and track.",
  "Hold a liquid Aurove asset instead of managing the underlying position directly.",
  "Keep earning while you hold the asset.",
  "Swap or redeem when you want more flexibility.",
] as const;

export function BenefitsSection() {
  return (
    <section id="earn-products" className="mt-20">
      <SectionHeading
        badge="Earn Product Outcomes"
        title="Built to make Mezo Earn positions easier to use."
        description="Aurove keeps the useful parts of Mezo Earn while making the experience simpler for everyday users."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {benefits.map((benefit) => (
          <Card key={benefit} className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Clear result</CardTitle>
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
