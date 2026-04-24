import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { SectionHeading } from "@/components/site/section-heading";

const steps = [
  {
    title: "Onboard veBTC / veMEZO Exposure",
    body: "Start from existing locked position exposure and route it into the Fractals structuring layer.",
  },
  {
    title: "Receive Transferable Fractional Claims",
    body: "Fractals represents position ownership through fractions that are easier to hold, transfer, and price.",
  },
  {
    title: "Trade or Manage Exposure",
    body: "List, bid, buy, and sell fractions across a cleaner secondary market path designed for locked-position liquidity.",
  },
  {
    title: "Settle, Redeem, or Roll",
    body: "As settlement windows open, move into redemption or rollover flows aligned with yield and duration preferences.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mt-20">
      <SectionHeading
        badge="How It Works"
        title="A clear flow for structured exposure and liquidity."
        description="Fractals turns complex lock management into an understandable protocol flow, balancing transferability with settlement discipline."
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
