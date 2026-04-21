"use client";

import { useMemo, useState } from "react";
import { useFormik } from "formik";
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

  const formik = useFormik<FormState>({
    initialValues: INITIAL_FORM,
    validate(values) {
      const errors: Partial<Record<keyof FormState, string>> = {};

      let veNftTokenId = 0n;
      try {
        veNftTokenId = BigInt(values.veNftTokenId || "0");
      } catch {
        errors.veNftTokenId = "veNFT token ID must be a valid integer.";
      }

      if (!errors.veNftTokenId && veNftTokenId < 1n) {
        errors.veNftTokenId = "veNFT token ID must be greater than 0.";
      }

      if (Number.parseFloat(values.listAmount.trim()) <= 0) {
        errors.listAmount = "List amount must be greater than 0.";
      }

      if (Number.parseFloat(values.unitPriceUsd.trim()) <= 0) {
        errors.unitPriceUsd = "Unit price must be greater than 0.";
      }

      const expiryDays = Number.parseInt(values.expiryDays, 10);
      if (!Number.isFinite(expiryDays) || expiryDays < 1) {
        errors.expiryDays = "Expiry must be at least 1 day.";
      }

      return errors;
    },
    async onSubmit(values, actions) {
      let veNftTokenId = 0n;
      try {
        veNftTokenId = BigInt(values.veNftTokenId || "0");
      } catch {
        actions.setStatus("veNFT token ID must be a valid integer.");
        actions.setSubmitting(false);
        return;
      }

      try {
        actions.setStatus(undefined);
        const created = await onCreateListing({
          veAssetType: values.veAssetType,
          veNftTokenId,
          listAmount: values.listAmount.trim(),
          unitPriceUsd: values.unitPriceUsd.trim(),
          expiryDays: Number.parseInt(values.expiryDays, 10),
        });
        onCreated?.(created);
        setOpen(false);
        actions.resetForm();
      } catch (submitError) {
        actions.setStatus(
          submitError instanceof Error ? submitError.message : "Failed to publish listing.",
        );
      } finally {
        actions.setSubmitting(false);
      }
    },
  });
  const submitting = isSubmitting || formik.isSubmitting;

  const previewSymbol = useMemo(() => {
    return `${formik.values.veAssetType}-#${formik.values.veNftTokenId || "?"}`;
  }, [formik.values.veAssetType, formik.values.veNftTokenId]);
  const validationError = useMemo(() => {
    if (formik.submitCount < 1) return null;
    return (
      formik.errors.veNftTokenId ??
      formik.errors.listAmount ??
      formik.errors.unitPriceUsd ??
      formik.errors.expiryDays ??
      null
    );
  }, [formik.errors, formik.submitCount]);

  function resetForm() {
    formik.resetForm();
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

        <form onSubmit={formik.handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
              1. Select ve asset
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={formik.values.veAssetType === "veBTC" ? "default" : "secondary"}
                disabled={submitting}
                onClick={() => void formik.setFieldValue("veAssetType", "veBTC")}
              >
                veBTC
              </Button>
              <Button
                type="button"
                variant={formik.values.veAssetType === "veMEZO" ? "default" : "secondary"}
                disabled={submitting}
                onClick={() => void formik.setFieldValue("veAssetType", "veMEZO")}
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
                name="veNftTokenId"
                type="number"
                min={1}
                step={1}
                value={formik.values.veNftTokenId}
                onChange={formik.handleChange}
                disabled={submitting}
              />
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                3. List amount
              </p>
              <Input
                name="listAmount"
                type="number"
                min={0}
                step={0.000001}
                value={formik.values.listAmount}
                onChange={formik.handleChange}
                disabled={submitting}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                4. Unit price (USD)
              </p>
              <Input
                name="unitPriceUsd"
                type="number"
                min={0}
                step={0.000001}
                value={formik.values.unitPriceUsd}
                onChange={formik.handleChange}
                disabled={submitting}
              />
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                5. Expiry (days)
              </p>
              <Input
                name="expiryDays"
                type="number"
                min={1}
                step={1}
                value={formik.values.expiryDays}
                onChange={formik.handleChange}
                disabled={submitting}
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3 text-sm text-[var(--muted)]">
            Preview Symbol:{" "}
            <span className="font-semibold text-[var(--foreground)]">{previewSymbol}</span>
          </div>

          {validationError || formik.status ? (
            <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {String(validationError ?? formik.status)}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Publishing..." : "Publish Listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
