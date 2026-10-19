import Link from "next/link";
import { FaXTwitter } from "react-icons/fa6";

export function XAccountLink() {
  return (
    <Link
      href="https://x.com/aurove_xyz"
      target="_blank"
      rel="noreferrer"
      aria-label="Follow Aurove on X"
      title="Follow Aurove on X"
      className="inline-flex size-10 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.03] text-foreground/70 transition hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <FaXTwitter className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
