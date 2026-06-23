"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PartnerKind = "snf" | "mezo";

type PartnerItem = {
  label: string;
  kind: PartnerKind;
};

const partnerItems: PartnerItem[] = [
  // {
  //   label: "Supernormal Foundation",
  //   kind: "snf",
  // },
  {
    label: "Mezo",
    kind: "mezo",
  },
];

function PartnerCard({ partner }: { partner: PartnerItem }) {
  return (
    <article className="partner-card partner-card--carousel">
      {partner.kind === "snf" ? (
        <div className="partner-card__foundation">
          <div>
            <p className="partner-card__label">Supernormal</p>
            <p className="partner-card__label">Foundation</p>
          </div>
        </div>
      ) : (
        <div className="partner-card__mezo">
          <Image
            src="/mezo_logo_mark.png"
            alt="Mezo"
            width={1020}
            height={141}
            className="partner-card__mezo-mark"
          />
        </div>
      )}
    </article>
  );
}

export function EcosystemPartnersCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const isCompactLayout = partnerItems.length <= 2;

  useEffect(() => {
    const track = trackRef.current;
    const slides = slideRefs.current.filter((slide): slide is HTMLDivElement => Boolean(slide));

    if (!track || slides.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const nextIndex = Number((visible.target as HTMLElement).dataset.index ?? "0");
        setActiveIndex(nextIndex);
      },
      {
        root: track,
        threshold: [0.45, 0.6, 0.75],
      },
    );

    slides.forEach((slide) => observer.observe(slide));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isCompactLayout) {
      const frame = window.requestAnimationFrame(() => setActiveIndex(0));
      return () => window.cancelAnimationFrame(frame);
    }

    const firstSlide = slideRefs.current[0];

    if (!firstSlide) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      firstSlide.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      });
      setActiveIndex(0);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isCompactLayout]);

  const scrollToIndex = (index: number) => {
    const slide = slideRefs.current[index];

    if (!slide) {
      return;
    }

    slide.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    setActiveIndex(index);
  };

  return (
    <div className="partners-carousel">
      <div className="partners-carousel__header">
        <div className="partners-carousel__title-block">
          <p className="section-kicker normal-case tracking-[0.14em]">supported by the best</p>
        </div>

        <div className="partners-carousel__controls" aria-label="Partner carousel controls">
          <button
            type="button"
            className="partners-carousel__control"
            onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
            disabled={isCompactLayout || activeIndex <= 0}
            aria-label="Previous partner"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="partners-carousel__control"
            onClick={() => scrollToIndex(Math.min(partnerItems.length - 1, activeIndex + 1))}
            disabled={isCompactLayout || activeIndex >= partnerItems.length - 1}
            aria-label="Next partner"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="partners-carousel__viewport">
        <div
          ref={trackRef}
          className={`partners-carousel__track${
            isCompactLayout ? " partners-carousel__track--compact" : ""
          }`}
        >
          {partnerItems.map((partner, index) => (
            <div
              key={partner.label}
              ref={(node) => {
                slideRefs.current[index] = node;
              }}
              data-index={index}
              className={`partners-carousel__slide${
                isCompactLayout ? " partners-carousel__slide--compact" : ""
              }`}
            >
              <PartnerCard partner={partner} />
            </div>
          ))}
        </div>
      </div>

      <div className="partners-carousel__dots" aria-label="Partner carousel pagination">
        {partnerItems.map((partner, index) => (
          <button
            key={partner.label}
            type="button"
            className={`partners-carousel__dot${activeIndex === index ? " is-active" : ""}`}
            onClick={() => scrollToIndex(index)}
            aria-label={`Go to partner ${index + 1}`}
            aria-pressed={activeIndex === index}
            disabled={isCompactLayout}
          />
        ))}
      </div>
    </div>
  );
}
