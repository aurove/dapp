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
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8 lg:py-20">
      <SectionHeading
        eyebrow="How It Works"
        title="A clear flow for structured exposure and liquidity."
        description="Fractals turns complex lock management into an understandable protocol flow, balancing transferability with settlement discipline."
      />

      <ol className="mt-9 grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="glass-card rounded-2xl p-6 md:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Step {index + 1}
            </p>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-[var(--foreground)]">
              {step.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
