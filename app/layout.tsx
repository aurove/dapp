import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Web3Providers } from "@/lib/providers/web3-providers";
import { NotificationsToaster } from "@/lib/notifications";

export const metadata: Metadata = {
  metadataBase: new URL("https://aurove.xyz"),
  title: {
    default: "Aurove | Simple Fungible Mezo Earn Products",
    template: "%s | Aurove",
  },
  description:
    "Aurove is the liquid ve-yield layer for Mezo Earn.",
  applicationName: "Aurove",
  keywords: [
    "Aurove",
    "veBTC",
    "veMEZO",
    "Mezo Earn",
    "liquid locks",
    "yield routing",
    "optimised yields",
  ],
  openGraph: {
    title: "Aurove | Simple Fungible Mezo Earn Products",
    description:
      "Simple fungible Earn products for complex veBTC / veMEZO positions, gauges, boosts, rewards, and incentive routing.",
    type: "website",
    siteName: "Aurove",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aurove | Simple Fungible Mezo Earn Products",
    description:
      "Aurove turns veBTC and veMEZO positions into liquid, tradable Mezo Earn products.",
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
