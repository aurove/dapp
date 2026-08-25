import { ExternalLink } from "lucide-react";
import { cn } from "@ui";
import type { DeploymentEntry } from "@/lib/docs/contracts-reference";
import {
  explorerAddressUrl,
  sourcifyVerificationUrl,
  verificationHref,
  verificationLabel,
} from "@/lib/docs/contracts-reference";

export function VerifiedTag({
  entry,
  className,
}: {
  entry: DeploymentEntry;
  className?: string;
}) {
  const href = verificationHref(entry);
  const label = verificationLabel(entry);
  if (!href || !label) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-emerald-100 hover:border-emerald-300/40",
        className,
      )}
    >
      {label}
      <ExternalLink className="h-2.5 w-2.5" aria-hidden />
    </a>
  );
}

export function SourcifyAlsoLink({ entry }: { entry: DeploymentEntry }) {
  if (entry.verification !== "both") return null;
  return (
    <a
      href={sourcifyVerificationUrl(entry.address)}
      target="_blank"
      rel="noreferrer"
      className="text-[11px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
    >
      Also verified on Sourcify
    </a>
  );
}

export function ExplorerContractLink({
  address,
  children,
}: {
  address: string;
  children?: string;
}) {
  return (
    <a
      href={explorerAddressUrl(address, "contract")}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono text-[12px] text-[#ecd09b] underline-offset-2 hover:underline"
    >
      {children ?? address}
    </a>
  );
}
