type ListingReviewCardProps = {
  pairLabel: string;
  listedAmountLabel: string;
  listedPercentage: number;
  remainingAmountLabel: string;
  unitPriceLabel: string;
  totalValueLabel: string;
  feeLabel: string;
  proceedsLabel: string;
  expiryLabel: string;
};

export function ListingReviewCard({
  pairLabel,
  listedAmountLabel,
  listedPercentage,
  remainingAmountLabel,
  unitPriceLabel,
  totalValueLabel,
  feeLabel,
  proceedsLabel,
  expiryLabel,
}: ListingReviewCardProps) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/[0.02] p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Review listing</p>
        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{pairLabel}</p>
      </div>

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Listed: <span className="font-medium text-[var(--foreground)]">{listedAmountLabel}</span>
        </p>
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Remaining:{" "}
          <span className="font-medium text-[var(--foreground)]">{remainingAmountLabel}</span>
        </p>
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Unit price: <span className="font-medium text-[var(--foreground)]">{unitPriceLabel}</span>
        </p>
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Order value:{" "}
          <span className="font-medium text-[var(--foreground)]">{totalValueLabel}</span>
        </p>
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Est. fees: <span className="font-medium text-[var(--foreground)]">{feeLabel}</span>
        </p>
        <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
          Est. proceeds:{" "}
          <span className="font-medium text-[var(--foreground)]">{proceedsLabel}</span>
        </p>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Listing size: {listedPercentage.toFixed(2)}% of your currently available fraction capacity.
      </p>
      <p className="text-xs text-[var(--muted)]">Expiry: {expiryLabel}</p>
    </div>
  );
}
