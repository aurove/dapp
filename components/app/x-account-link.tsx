import Link from "next/link";
import { FaXTwitter } from "react-icons/fa6";

export function XAccountLink() {
  return (
    <Link
      href="https://x.com/YieldBits"
      target="_blank"
      rel="noreferrer"
      aria-label="Follow Yield Bits on X"
      title="Follow Yield Bits on X"
      className="inline-flex size-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b58f5f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c1117]"
    >
      <FaXTwitter className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
