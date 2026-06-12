import { Card, CardContent, CardHeader, CardTitle } from "@ui";
import { SectionHeading } from "@/components/site/section-heading";

const steps = [
  {
    title: "Onboard veBTC / veMEZO Exposure",
    body: "Start from a position with lock duration, gauge, boost, reward, and routing context.",
  },
  {
    title: "Receive Fungible Earn Products",
    body: "Fractals represents position ownership through product units that are easier to understand, hold, transfer, and price.",
  },
  {
    title: "Trade or Manage Exposure",
    body: "List, bid, buy, and sell fungible Earn units across a cleaner secondary market path.",
  },
  {
    title: "Use, Settle, or Redeem",
    body: "Claim rewards, follow routing, and move into redemption flows aligned with product duration.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mt-20">
      <SectionHeading
        badge="How It Works"
        title="A clear flow from Mezo Earn complexity to usable products."
        description="Fractals turns complex veBTC / veMEZO positions, gauges, lock durations, boosts, rewards, and incentive routing into simple fungible Earn products."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <Card key={step.title}>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-[0.13em] text-[var(--accent-soft)]">
                Step {index + 1}
              </p>
              <CardTitle className="text-lg">{step.title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-relaxed text-[var(--muted)]">
              {step.body}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
