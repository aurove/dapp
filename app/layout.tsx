import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Web3Providers } from "@/lib/providers/web3-providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://fractals.finance"),
  title: {
    default: "Fractals | Fractional Liquidity for veBTC & veMEZO",
    template: "%s | Fractals",
  },
  description:
    "Fractals is a structured liquidity and yield layer for veBTC and veMEZO positions, with transferable fractions, settlement windows, rollover mechanics, and optimised yield routing.",
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
    title: "Fractals | Fractional Liquidity for veBTC & veMEZO",
    description:
      "Structured liquidity for locked Mezo Earn positions with transferable fractions and optimised yield mechanics.",
    type: "website",
    siteName: "Fractals",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fractals | Fractional Liquidity for veBTC & veMEZO",
    description:
      "Transferable liquidity and structured yield mechanics for locked veBTC and veMEZO exposure.",
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
      </body>
    </html>
  );
}
