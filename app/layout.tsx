import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { WalletAuthProvider } from "@/lib/auth/provider";
import { Web3Providers } from "@/lib/providers/web3-providers";
import { NotificationsToaster } from "@/lib/notifications";

export const metadata: Metadata = {
  metadataBase: new URL("https://aurove.xyz"),
  title: {
    default: "Aurove | Mezo Earn made easier",
    template: "%s | Aurove",
  },
  description: "Aurove makes Mezo Earn positions easier to use.",
  applicationName: "Aurove",
  keywords: [
    "BTC",
    "veBTC",
    "veMEZO",
    "Mezo Earn",
    "liquid asset",
    "swap",
    "redeem",
  ],
  openGraph: {
    title: "Aurove | Mezo Earn made easier",
    description: "Aurove turns BTC, MEZO, or a Mezo Earn position into a liquid asset you can use more easily.",
    type: "website",
    siteName: "Aurove",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aurove | Mezo Earn made easier",
    description: "Aurove turns BTC, MEZO, or a Mezo Earn position into a liquid asset you can use more easily.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <Web3Providers>
          <WalletAuthProvider>{children}</WalletAuthProvider>
        </Web3Providers>
        <NotificationsToaster />
      </body>
    </html>
  );
}
