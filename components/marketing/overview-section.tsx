import { Card, CardContent, CardHeader, CardTitle } from "@ui";
import { SectionHeading } from "@/components/site/section-heading";

const cards = [
  {
    title: "Understandable Earn Products",
    body: "Convert veBTC / veMEZO positions, lock durations, boosts, and rewards into product units that are easier to compare and hold.",
  },
  {
    title: "Tradable Exposure",
    body: "Enable secondary market activity around fungible Earn products so ownership transitions are cleaner than bespoke lock transfers.",
  },
  {
    title: "Usable Reward Routing",
    body: "Bring gauges, rewards, boosts, and incentive routing into product flows built for predictable position handling.",
  },
] as const;

export function OverviewSection() {
  return (
    <section id="overview" className="mt-20">
      <SectionHeading
        badge="Why Fractals"
        title="Mezo Earn stays powerful. Its products become simple to use."
        description="Fractals simplifies complex veBTC / veMEZO positions into fungible Earn products users can understand, trade, and use without awkward manual veNFT handling."
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
