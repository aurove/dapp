import { Card, CardContent, CardHeader, CardTitle } from "@ui";
import { SectionHeading } from "@/components/site/section-heading";

const cards = [
  {
    title: "Deposit what you have",
    body: "Put BTC, MEZO, or an existing Mezo Earn position into Aurove without needing to understand the protocol details.",
  },
  {
    title: "Get a liquid asset",
    body: "Receive an Aurove asset that is easier to hold, move, and use than a locked position.",
  },
  {
    title: "Swap or redeem later",
    body: "Keep the option to trade your position or redeem it when you want more flexibility.",
  },
] as const;

export function OverviewSection() {
  return (
    <section id="overview" className="mt-20">
      <SectionHeading
        badge="Why Aurove"
        title="Mezo Earn stays powerful. Aurove makes it easier to use."
        description="Aurove turns BTC, MEZO, or an existing Mezo Earn position into a liquid asset you can understand, hold, swap, or redeem."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title} className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm leading-relaxed text-[var(--muted)]">
              {card.body}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
