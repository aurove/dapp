import type { Metadata, Viewport } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { WalletAuthProvider } from "@/lib/auth/provider";
import { Web3Providers } from "@/lib/providers/web3-providers";
import { NotificationsToaster } from "@/lib/notifications";
import { GlobalPriceTicker } from "@/components/market/global-price-ticker";
import { GTag } from "@/components/site/gtag";
import { Hotjar } from "@/components/site/hotjar";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  TWITTER_HANDLE,
} from "@/lib/seo/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  keywords: [...DEFAULT_KEYWORDS],
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: DEFAULT_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE_PATH],
    creator: TWITTER_HANDLE,
    site: TWITTER_HANDLE,
  },
  other: {
    "theme-color": "#0a0f15",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0f15" },
    { media: "(prefers-color-scheme: light)", color: "#0a0f15" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <GTag />
        <Hotjar />
        <Web3Providers>
          {/* Global live prices — above every page chrome; isolated error boundary inside. */}
          <GlobalPriceTicker />
          <WalletAuthProvider>{children}</WalletAuthProvider>
        </Web3Providers>
        <NotificationsToaster />
      </body>
    </html>
  );
}
