import type { ReactNode } from "react";
import { Badge } from "@ui";

type SectionHeadingProps = {
  badge?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  align?: "left" | "center";
};

export function SectionHeading({
  badge,
  eyebrow,
  title,
  description,
  actions,
  align = "left",
}: SectionHeadingProps) {
  const label = badge ?? eyebrow;

  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {label ? <Badge className="mb-4">{label}</Badge> : null}
      <h2 className="text-balance text-3xl font-semibold leading-tight text-[var(--foreground)] sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      ) : null}
      {actions ? <div className="mt-6">{actions}</div> : null}
    </div>
  );
}
