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
    <section id="overview" className="mx-auto w-full max-w-6xl px-6 py-14 lg:px-8 lg:py-20">
      <SectionHeading
        eyebrow="Why Fractals"
        title="Locked positions stay valuable. Their liquidity becomes usable."
        description="Fractals gives veBTC and veMEZO holders a cleaner structure for transferability, exit flexibility, and ongoing yield alignment without awkward manual veNFT handling."
      />

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="glass-card rounded-2xl p-6 md:p-7">
            <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
              {card.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
