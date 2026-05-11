import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Web3Providers } from "@/lib/providers/web3-providers";
import { NotificationsToaster } from "@/lib/notifications";

export const metadata: Metadata = {
  metadataBase: new URL("https://fractals.finance"),
  title: {
    default: "Fractals | Simple Fungible Mezo Earn Products",
    template: "%s | Fractals",
  },
  description:
    "Fractals simplifies Mezo Earn by turning complex veBTC / veMEZO positions, gauges, lock durations, boosts, rewards, and incentive routing into simple fungible Earn products users can understand, trade, and use.",
  applicationName: "Fractals",
  keywords: [
    "Fractals",
    "veBTC",
    "veMEZO",
    "Mezo Earn",
    "fractional liquidity",
    "yield routing",
    "settlement windows",
  ],
  openGraph: {
    title: "Fractals | Simple Fungible Mezo Earn Products",
    description:
      "Simple fungible Earn products for complex veBTC / veMEZO positions, gauges, boosts, rewards, and incentive routing.",
    type: "website",
    siteName: "Fractals",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fractals | Simple Fungible Mezo Earn Products",
    description:
      "Understand, trade, and use Mezo Earn exposure through simple fungible Earn products.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Web3Providers>{children}</Web3Providers>
        <NotificationsToaster />
      </body>
    </html>
  );
}
