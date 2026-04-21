import { BenefitsSection } from "@/components/marketing/benefits-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { OverviewSection } from "@/components/marketing/overview-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TopNav } from "@/components/marketing/top-nav";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-0 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(216,181,106,0.24)_0%,rgba(216,181,106,0)_72%)]" />
        <div className="absolute -right-32 top-28 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(94,126,167,0.25)_0%,rgba(94,126,167,0)_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0)_18%,rgba(255,255,255,0)_82%,rgba(255,255,255,0.01))]" />
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
