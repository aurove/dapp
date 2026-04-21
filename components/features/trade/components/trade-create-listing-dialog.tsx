"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@fractals/ui/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { useUserVeTokens } from "../hooks/use-user-ve-tokens";
import type { CreateVeTradeListingInput, TradeAsset, TradeVeAssetType } from "../types";

type TradeCreateListingDialogProps = {
  onCreateListing: (input: CreateVeTradeListingInput) => Promise<TradeAsset>;
  onCreated?: (asset: TradeAsset) => void;
  isSubmitting?: boolean;
  paymentTokenOptions: Array<{
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  }>;
  isLoadingPaymentTokens?: boolean;
  paymentTokenError?: Error | null;
  onRefreshPaymentTokens?: () => void;
};

type FormState = {
  veAssetType: TradeVeAssetType;
  veNftTokenId: string;
  listAmount: string;
  paymentToken: `0x${string}` | "";
  unitPriceUsd: string;
  expiryDays: string;
};

const INITIAL_FORM: FormState = {
  veAssetType: "veBTC",
  veNftTokenId: "",
  listAmount: "1",
  paymentToken: "",
  unitPriceUsd: "0.90",
  expiryDays: "30",
};

export function TradeCreateListingDialog({
  onCreateListing,
  onCreated,
  isSubmitting = false,
  paymentTokenOptions,
  isLoadingPaymentTokens = false,
  paymentTokenError = null,
  onRefreshPaymentTokens,
}: TradeCreateListingDialogProps) {
  const [open, setOpen] = useState(false);
  const { veTokens, isConnected, isLoading, isFetching, error, refresh } = useUserVeTokens();

  const formik = useFormik<FormState>({
    initialValues: INITIAL_FORM,
    validate(values) {
      const errors: Partial<Record<keyof FormState, string>> = {};
      const selectedToken = veTokens.find((token) => token.assetType === values.veAssetType);

      if (!isConnected) {
        errors.veAssetType = "Connect your wallet to load ve token balances.";
      }

      if (!selectedToken) {
        errors.veAssetType = "Select an available ve token with a non-zero balance.";
      }

      let veNftTokenId = 0n;
      try {
        veNftTokenId = BigInt(values.veNftTokenId || "0");
      } catch {
        errors.veNftTokenId = "veNFT token ID must be a valid integer.";
      }

      if (!errors.veNftTokenId && veNftTokenId < 1n) {
        errors.veNftTokenId = "veNFT token ID must be greater than 0.";
      }
      if (selectedToken && !selectedToken.tokenIds.some((tokenId) => tokenId === veNftTokenId)) {
        errors.veNftTokenId = "Choose a veNFT token ID from your wallet balance.";
      }

      if (Number.parseFloat(values.listAmount.trim()) <= 0) {
        errors.listAmount = "List amount must be greater than 0.";
      }
      if (!values.paymentToken) {
        errors.paymentToken = "Select a supported payment token.";
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
        const selectedPaymentToken = paymentTokenOptions.find(
          (token) => token.address.toLowerCase() === values.paymentToken.toLowerCase(),
        );
        if (!selectedToken || !selectedPaymentToken) {
          actions.setStatus("Select a valid ve token and payment token before publishing.");
          actions.setSubmitting(false);
          return;
        }
        const created = await onCreateListing({
          veAssetType: values.veAssetType,
          veNftAddress: selectedToken.contractAddress,
          veNftTokenId,
          listAmount: values.listAmount.trim(),
          paymentToken: selectedPaymentToken.address,
          paymentTokenDecimals: selectedPaymentToken.decimals,
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
  const selectedToken =
    veTokens.find((token) => token.assetType === formik.values.veAssetType) ?? null;
  const setFieldValue = formik.setFieldValue;
  const veAssetTypeValue = formik.values.veAssetType;
  const veNftTokenIdValue = formik.values.veNftTokenId;
  const paymentTokenValue = formik.values.paymentToken;
  const submitting = isSubmitting || formik.isSubmitting;
  const selectionDisabled =
    submitting || isLoading || isFetching || !isConnected || veTokens.length === 0;
  const canSubmit =
    !selectionDisabled &&
    selectedToken !== null &&
    selectedToken.tokenIds.length > 0 &&
    formik.values.paymentToken.length > 0 &&
    formik.values.veNftTokenId.trim().length > 0;

  useEffect(() => {
    if (veTokens.length === 0) return;
    if (!veTokens.some((token) => token.assetType === veAssetTypeValue)) {
      void setFieldValue("veAssetType", veTokens[0].assetType);
    }
  }, [setFieldValue, veAssetTypeValue, veTokens]);

  useEffect(() => {
    if (!selectedToken) {
      if (veNftTokenIdValue) {
        void setFieldValue("veNftTokenId", "");
      }
      return;
    }

    const hasCurrentTokenId = selectedToken.tokenIds.some(
      (tokenId) => tokenId.toString() === veNftTokenIdValue,
    );
    if (!hasCurrentTokenId) {
      void setFieldValue("veNftTokenId", selectedToken.tokenIds[0]?.toString() ?? "");
    }
  }, [setFieldValue, veNftTokenIdValue, selectedToken]);

  useEffect(() => {
    if (paymentTokenOptions.length === 0) {
      if (paymentTokenValue) {
        void setFieldValue("paymentToken", "");
      }
      return;
    }
    const exists = paymentTokenOptions.some(
      (token) => token.address.toLowerCase() === paymentTokenValue.toLowerCase(),
    );
    if (!exists) {
      void setFieldValue("paymentToken", paymentTokenOptions[0].address);
    }
  }, [paymentTokenOptions, paymentTokenValue, setFieldValue]);

  const previewSymbol = useMemo(() => {
    return `${formik.values.veAssetType}-#${formik.values.veNftTokenId || "?"}`;
  }, [formik.values.veAssetType, formik.values.veNftTokenId]);
  const validationError = useMemo(() => {
    if (formik.submitCount < 1) return null;
    return (
      formik.errors.veAssetType ??
      formik.errors.veNftTokenId ??
      formik.errors.paymentToken ??
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
            {isLoading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            ) : null}

            {!isLoading && isConnected && veTokens.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {veTokens.map((token) => (
                  <button
                    key={`${token.assetType}-${token.contractAddress}`}
                    type="button"
                    disabled={selectionDisabled}
                    onClick={() => void formik.setFieldValue("veAssetType", token.assetType)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      formik.values.veAssetType === token.assetType
                        ? "border-[#b58f5f] bg-[#b58f5f]/10"
                        : "border-white/15 bg-white/[0.02] hover:border-white/30"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--foreground)]">{token.symbol}</p>
                    <p className="text-xs text-[var(--muted)]">{token.balanceFormatted}</p>
                  </button>
                ))}
              </div>
            ) : null}

            {!isLoading && isConnected && veTokens.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                No ve token balances found in this wallet on the current network.
              </div>
            ) : null}

            {!isConnected ? (
              <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                Connect your wallet to view available ve token balances.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-200">
                <p>Could not load ve token balances.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={refresh}
                  disabled={selectionDisabled}
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : null}
            {paymentTokenError ? (
              <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-200">
                <p>Could not load payment token configuration.</p>
                {onRefreshPaymentTokens ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={onRefreshPaymentTokens}
                    disabled={selectionDisabled}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                2. veNFT token ID
              </p>
              <select
                name="veNftTokenId"
                value={formik.values.veNftTokenId}
                onChange={formik.handleChange}
                disabled={selectionDisabled || !selectedToken || selectedToken.tokenIds.length === 0}
                className="h-10 w-full rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
              >
                <option value="">Select token ID</option>
                {(selectedToken?.tokenIds ?? []).map((tokenId) => (
                  <option key={tokenId.toString()} value={tokenId.toString()}>
                    #{tokenId.toString()}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                3. Payment token
              </p>
              <select
                name="paymentToken"
                value={formik.values.paymentToken}
                onChange={formik.handleChange}
                disabled={
                  selectionDisabled || isLoadingPaymentTokens || paymentTokenOptions.length === 0
                }
                className="h-10 w-full rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
              >
                <option value="">Select payment token</option>
                {paymentTokenOptions.map((token) => (
                  <option key={token.address} value={token.address}>
                    {token.symbol}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                4. List amount
              </p>
              <Input
                name="listAmount"
                type="number"
                min={0}
                step={0.000001}
                value={formik.values.listAmount}
                onChange={formik.handleChange}
                disabled={selectionDisabled}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                5. Unit price
              </p>
              <Input
                name="unitPriceUsd"
                type="number"
                min={0}
                step={0.000001}
                value={formik.values.unitPriceUsd}
                onChange={formik.handleChange}
                disabled={selectionDisabled}
              />
            </label>

            <label className="space-y-2">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                6. Expiry (days)
              </p>
              <Input
                name="expiryDays"
                type="number"
                min={1}
                step={1}
                value={formik.values.expiryDays}
                onChange={formik.handleChange}
                disabled={selectionDisabled}
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
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Publishing..." : "Publish Listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
