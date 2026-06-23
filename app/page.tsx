import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDownToLine,
  ArrowLeftRight,
  BadgeDollarSign,
} from "lucide-react";
import { FaXTwitter } from "react-icons/fa6";
import { EcosystemPartnersCarousel } from "@/components/marketing/ecosystem-partners-carousel";

const featureCards = [
  {
    icon: ArrowDownToLine,
    title: "Deposit",
    body: "Start with simple yield products.\n\nMove from complex lock mechanics into clear Aurove Earn products designed to make Mezo Earn exposure easier to access and understand.",
  },
  {
    icon: ArrowLeftRight,
    title: "Trade",
    body: "Access flexible market liquidity.\n\nTrade Aurove product units when you want to adjust exposure, unlock liquidity, or move through the market with a cleaner participation flow.",
  },
  {
    icon: BadgeDollarSign,
    title: "Earn",
    body: "Keep earning as you participate.\n\nAurove brings Mezo Earn yield, rewards, and incentives into one flow, compounds value over time, and keeps claims available when users want.",
  },
] as const;

const footerLinks = [
  { label: "Earn", href: "/earn" },
  { label: "Trade", href: "/trade" },
  { label: "Academy", href: "/academy" },
  { label: "", href: "https://x.com/aurove_xyz", external: true },
] as const;

export default function HomePage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero__backdrop" aria-hidden="true">
          <div className="landing-hero__ring landing-hero__ring--large" />
          <div className="landing-hero__ring landing-hero__ring--medium" />
          <div className="landing-hero__ring landing-hero__ring--blue" />
          <div className="landing-hero__glow landing-hero__glow--top" />
          <div className="landing-hero__glow landing-hero__glow--bottom" />
        </div>

        <div className="landing-container landing-hero__content">
          <Image
            src="/logo_mark.png"
            alt="Aurove"
            width={240}
            height={160}
            priority
            className="hero-logo-mark"
          />

          <h1 className="hero-title">
            The liquid{" "}
            <span style={{ whiteSpace: "nowrap" }}>ve&#8209;yield</span>{" "}
            layer for
            <span className="hero-title__line">
              <span className="hero-title__accent">Mezo Earn.</span>
            </span>
          </h1>

          <p className="hero-copy">
            Keep earning from your Mezo Earn exposure, with the flexibility to trade when you need liquidity.
          </p>

          <div className="hero-divider" aria-hidden="true">
            <span className="hero-divider__line" />
            <span className="hero-divider__spark">✦</span>
            <span className="hero-divider__line" />
          </div>

          <div className="hero-actions">
            <Link href="/trade" className="btn btn--ghost">
              Go to Trade
              <ArrowRight className="btn__icon" aria-hidden="true" />
            </Link>
            <Link href="/earn" className="btn btn--gold">
              Explore Earn
              <ArrowRight className="btn__icon" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--intro">
        <div className="landing-container">
          <p className="section-kicker">WHY AUROVE</p>
          <h2 className="section-title">
            A seamless, optimised way to experience{" "}
            <span className="whitespace-nowrap">Mezo Earn.</span>
          </h2>
          <p className="section-copy section-copy--wide">
            Aurove simplifies the full participation lifecycle around veBTC and veMEZO, from
            depositing into clear yield products, to trading exposure, to earning while you stay
            active.
          </p>

          <div className="feature-grid">
            {featureCards.map((card) => {
              const Icon = card.icon;
              const [lead, ...rest] = card.body.split("\n\n");

              return (
                <article
                  key={card.title}
                  className="feature-card"
                >
                  <div className="feature-card__header">
                    <div className="feature-card__icon-wrap">
                      <Icon className="feature-card__icon" aria-hidden="true" />
                    </div>
                    <div className="feature-card__heading-copy">
                      <h3 className="feature-card__title">{card.title}</h3>
                      <p className="feature-card__lede">{lead}</p>
                    </div>
                  </div>
                  {rest.length > 0 ? (
                    <p className="feature-card__body">{rest.join("\n\n")}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <EcosystemPartnersCarousel />
        </div>
      </section>

      <section className="landing-section landing-section--academy">
        <div className="landing-container academy-grid">
          <div className="academy-copy">
            <p className="section-kicker">AUROVE ACADEMY</p>
            <h2 className="academy-title">
              Learn Mezo Earn.
              <br />
              Participate consistently.
              <br />
              <span className="hero-title__accent">Earn points.</span>
            </h2>
            <p className="section-copy academy-copy__text">
              Aurove Academy helps newcomers understand the system and gives returning users a
              structured path to stay active. Explore guided tasks, check in regularly, track
              progress, and earn points for participation across the Aurove experience.{" "}
              <a
                className="academy-link academy-link--inline"
                href="https://x.com/aurove_xyz/status/2069109875112554548"
                target="_blank"
                rel="noreferrer"
              >
                <span className="academy-link__icon" aria-hidden="true">
                  <FaXTwitter className="h-3.5 w-3.5" />
                </span>
                <span>Learn more</span>
              </a>
            </p>

            <div className="hero-actions hero-actions--academy">
              <Link href="/academy" className="btn btn--gold">
                Open Academy
                <ArrowRight className="btn__icon" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <div className="landing-footer__brand">
            <p className="landing-footer__name">Aurove</p>
            <p className="landing-footer__copy">
              The liquid ve‑yield layer forMezo Earn.
            </p>
          </div>

          <nav className="landing-footer__nav" aria-label="Footer">
            {footerLinks.map((link) => (
              "external" in link && link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="landing-footer__link"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FaXTwitter
                    className="mr-2 inline-block h-4 w-4 -translate-y-px"
                    aria-hidden="true"
                  />
                  {link.label}
                </a>
              ) : (
                <Link key={link.label} href={link.href} className="landing-footer__link">
                  {link.label}
                </Link>
              )
            ))}
          </nav>
        </div>
      </footer>
    </main>
  );
}
