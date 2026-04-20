import { BenefitsSection } from "@/components/marketing/benefits-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { OverviewSection } from "@/components/marketing/overview-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { TopNav } from "@/components/marketing/top-nav";

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <TopNav />
      <main className="flex-1">
        <HeroSection />
        <OverviewSection />
        <HowItWorksSection />
        <BenefitsSection />
        <FinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
