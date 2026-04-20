import type { ReactNode } from "react";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function SectionHeading({ eyebrow, title, description, actions }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-3.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-semibold leading-tight tracking-[-0.015em] text-[var(--foreground)] sm:text-[2rem]">
          {title}
        </h2>
        <p className="text-sm leading-7 text-[var(--muted)] sm:text-[1.01rem]">{description}</p>
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
