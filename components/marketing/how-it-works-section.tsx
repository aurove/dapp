import { Card, CardContent, CardHeader, CardTitle } from "@ui";
import { SectionHeading } from "@/components/site/section-heading";

const steps = [
  {
    title: "Deposit BTC, MEZO, or a position",
    body: "Start with the asset or Mezo Earn position you already hold.",
  },
  {
    title: "Receive a liquid Aurove asset",
    body: "Aurove gives you a simpler asset you can hold and move more easily.",
  },
  {
    title: "Keep earning in the background",
    body: "Your Aurove asset stays connected to Mezo Earn rewards while you hold it.",
  },
  {
    title: "Swap or redeem when needed",
    body: "Move back out when you want liquidity or want to exit your position.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mt-20">
      <SectionHeading
        badge="How It Works"
        title="A simple flow from deposit to flexibility."
        description="Aurove turns a Mezo Earn position into a liquid asset you can keep using, swap, or redeem later."
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
