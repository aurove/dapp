import { BenefitsSection } from "@/components/marketing/benefits-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { OverviewSection } from "@/components/marketing/overview-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TopNav } from "@/components/marketing/top-nav";

export default function HomePage() {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-[#070b10]">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,19,27,0.94)_0%,rgba(8,12,18,0.98)_52%,rgba(6,9,14,1)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(196,160,106,0.12)_0%,rgba(196,160,106,0.035)_24%,transparent_48%),linear-gradient(235deg,rgba(72,99,132,0.15)_0%,rgba(72,99,132,0.035)_28%,transparent_58%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.024)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] opacity-45 [mask-image:linear-gradient(180deg,rgba(0,0,0,0.78),rgba(0,0,0,0.34)_70%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent)]" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col">
        <TopNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-8 pb-6">
          <HeroSection />
          <OverviewSection />
          <HowItWorksSection />
          <BenefitsSection />
          <FinalCtaSection />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
