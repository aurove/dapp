import { ArrowUpDown, BookOpenText, CandlestickChart, Layers2 } from "lucide-react";
import { Badge } from "@fractals/ui/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/components/ui/card";

const books = [
  { pair: "veBTC-24M / FRACT", bid: "0.934", ask: "0.947", depth: "$1.3M" },
  { pair: "veMEZO-18M / FRACT", bid: "0.811", ask: "0.825", depth: "$920k" },
  { pair: "veMEZO-30M / FRACT", bid: "0.772", ask: "0.794", depth: "$640k" },
] as const;

export function TradePage() {
  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <Badge className="w-fit">Trade</Badge>
          <CardTitle className="text-2xl sm:text-3xl">
            Exchange ve fraction exposure across structured books.
          </CardTitle>
          <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">
            List, bid, buy, and sell veBTC / veMEZO fractions with clearer execution context than
            manual ve lock transfers.
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <CandlestickChart className="h-5 w-5 text-[var(--accent-soft)]" />
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              24h Volume
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">$3.8M</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <ArrowUpDown className="h-5 w-5 text-[var(--accent-soft)]" />
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Orders Open
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">186</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Layers2 className="h-5 w-5 text-[var(--accent-soft)]" />
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Books Active
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">12</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-[var(--accent-soft)]" />
            <CardTitle className="text-lg">Order Books</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Pair</th>
                  <th className="py-2 pr-4 font-medium">Best Bid</th>
                  <th className="py-2 pr-4 font-medium">Best Ask</th>
                  <th className="py-2 pr-2 font-medium">Depth</th>
                </tr>
              </thead>
              <tbody className="text-[var(--foreground)]">
                {books.map((book) => (
                  <tr key={book.pair} className="border-t border-[var(--line)]">
                    <td className="py-3 pr-4">{book.pair}</td>
                    <td className="py-3 pr-4 text-[var(--accent-soft)]">{book.bid}</td>
                    <td className="py-3 pr-4">{book.ask}</td>
                    <td className="py-3 pr-2 text-[var(--muted)]">{book.depth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
