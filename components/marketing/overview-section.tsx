import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";
import { SectionHeading } from "@/components/site/section-heading";

const cards = [
  {
    title: "Transferable Fractions",
    body: "Convert locked ve positions into structured fractional claims that can move across participants without unwinding core long-duration exposure.",
  },
  {
    title: "Structured Liquidity",
    body: "Enable secondary market activity around veMEZO and veBTC fractions so ownership transitions are cleaner than bespoke lock transfers.",
  },
  {
    title: "Optimised Yield Paths",
    body: "Route through planned settlement windows and rollover mechanics built for predictable position handling and improved capital efficiency.",
  },
] as const;

export function OverviewSection() {
  return (
    <section id="overview" className="mt-20">
      <SectionHeading
        badge="Why Fractals"
        title="Locked positions stay valuable. Their liquidity becomes usable."
        description="Fractals gives veBTC and veMEZO holders a cleaner structure for transferability, exit flexibility, and ongoing yield alignment without awkward manual veNFT handling."
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
