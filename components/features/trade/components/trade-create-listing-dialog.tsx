"use client";

import { useMemo, useState } from "react";
import { Button } from "@fractals/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@fractals/ui/components/ui/dialog";
import { Input } from "@fractals/ui/components/ui/input";
import type { CreateVeTradeListingInput, TradeAsset, TradeVeAssetType } from "../types";

type TradeCreateListingDialogProps = {
  onCreateListing: (input: CreateVeTradeListingInput) => Promise<TradeAsset>;
  onCreated?: (asset: TradeAsset) => void;
  isSubmitting?: boolean;
};

type FormState = {
  veAssetType: TradeVeAssetType;
  veNftTokenId: string;
  listAmount: string;
  unitPriceUsd: string;
  expiryDays: string;
};

const INITIAL_FORM: FormState = {
  veAssetType: "veBTC",
  veNftTokenId: "",
  listAmount: "1",
  unitPriceUsd: "0.90",
  expiryDays: "30",
};

export function TradeCreateListingDialog({
  onCreateListing,
  onCreated,
  isSubmitting = false,
}: TradeCreateListingDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  const previewSymbol = useMemo(() => {
    return `${form.veAssetType}-#${form.veNftTokenId || "?"}`;
  }, [form.veAssetType, form.veNftTokenId]);

  function resetForm() {
    setForm(INITIAL_FORM);
    setError(null);
  }

  async function submitListing() {
    let veNftTokenId = BigInt(0);
    try {
      veNftTokenId = BigInt(form.veNftTokenId || "0");
    } catch {
      setError("veNFT token ID must be a valid integer.");
      return;
    }
    const listAmount = form.listAmount.trim();
    const unitPriceUsd = form.unitPriceUsd.trim();
    const expiryDays = Number.parseInt(form.expiryDays, 10);

    if (veNftTokenId < BigInt(1)) {
      setError("veNFT token ID must be greater than 0.");
      return;
    }

    if (Number.parseFloat(listAmount) <= 0) {
      setError("List amount must be greater than 0.");
      return;
    }

    if (Number.parseFloat(unitPriceUsd) <= 0) {
      setError("Unit price must be greater than 0.");
      return;
    }

    if (!Number.isFinite(expiryDays) || expiryDays < 1) {
      setError("Expiry must be at least 1 day.");
      return;
    }

    try {
      setError(null);
      const created = await onCreateListing({
        veAssetType: form.veAssetType,
        veNftTokenId,
        listAmount,
        unitPriceUsd,
        expiryDays,
      });
      onCreated?.(created);
      setOpen(false);
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to publish listing.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">List ve Asset</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>List veBTC or veMEZO for Trading</DialogTitle>
          <DialogDescription>
            Configure a ve listing and publish it to the trade board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              1. Select ve asset
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.veAssetType === "veBTC" ? "default" : "secondary"}
                disabled={isSubmitting}
                onClick={() => setForm((current) => ({ ...current, veAssetType: "veBTC" }))}
              >
                veBTC
              </Button>
              <Button
                type="button"
                variant={form.veAssetType === "veMEZO" ? "default" : "secondary"}
                disabled={isSubmitting}
                onClick={() => setForm((current) => ({ ...current, veAssetType: "veMEZO" }))}
              >
                veMEZO
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                2. veNFT token ID
              </p>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.veNftTokenId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, veNftTokenId: event.target.value }))
                }
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                3. List amount
              </p>
              <Input
                type="number"
                min={0}
                step={0.000001}
                value={form.listAmount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, listAmount: event.target.value }))
                }
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                4. Unit price (USD)
              </p>
              <Input
                type="number"
                min={0}
                step={0.000001}
                value={form.unitPriceUsd}
                onChange={(event) =>
                  setForm((current) => ({ ...current, unitPriceUsd: event.target.value }))
                }
                disabled={isSubmitting}
              />
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                5. Expiry (days)
              </p>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.expiryDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiryDays: event.target.value }))
                }
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3 text-sm text-[var(--muted)]">
            Preview Symbol:{" "}
            <span className="font-semibold text-[var(--foreground)]">{previewSymbol}</span>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submitListing()} disabled={isSubmitting}>
            {isSubmitting ? "Publishing..." : "Publish Listing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
