import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Web3Providers } from "@/lib/providers/web3-providers";
import { NotificationsToaster } from "@/lib/notifications";

export const metadata: Metadata = {
  metadataBase: new URL("https://aurove.xyz"),
  title: {
    default: "Aurove | Liquid ve-Yield Layer for Mezo Earn",
    template: "%s | Aurove",
  },
  description:
    "Aurove is the liquid ve-yield layer for Mezo Earn.",
  applicationName: "Aurove",
  keywords: [
    "BTC",
    "veBTC",
    "veMEZO",
    "Mezo Earn",
    "liquid locks",
    "yield routing",
    "optimised yields",
  ],
  openGraph: {
    title: "Aurove | Liquid ve-Yield Layer for Mezo Earn",
    description:
      "Aurove turns veBTC and veMEZO positions into liquid, tradable Mezo Earn products.",
    type: "website",
    siteName: "Aurove",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aurove | Liquid ve-Yield Layer for Mezo Earn",
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
