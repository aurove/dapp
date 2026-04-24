"use client";

import { useMemo, type ReactNode } from "react";
import { useFormik } from "formik";
import * as yup from "yup";
import { erc20Abi, formatUnits, parseUnits, type Abi, type Address } from "viem";
import { Button } from "@fractals/ui/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@fractals/ui/ui/card";
import { Input } from "@fractals/ui/ui/input";
import { Loader2 } from "lucide-react";
import {
  makeAddressWriteStep,
  makeContractWriteStep,
  TransactionFlowButton,
  type TxStep,
} from "@/lib/tx-flow";
import type { TradeMarket, TradeMarketBidPreview, TradeMarketListingPreview } from "../types";
import { quoteRequiredPaymentRaw } from "../utils/pricing";

type ActionShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

type CommonActionProps = {
  market: TradeMarket;
  isPaused: boolean;
  onTradeExecuted?: () => void;
  userAddress?: Address;
};

type BuyTradeActionProps = CommonActionProps & {
  marketplaceAddress?: Address;
  marketplaceAbi?: Abi;
  paymentRouterAddress?: Address;
  paymentBalance: bigint;
  paymentAllowance: bigint;
  selectedListing: TradeMarketListingPreview | null;
};

type SellTradeActionProps = CommonActionProps & {
  marketplaceAddress?: Address;
  marketplaceAbi?: Abi;
  fractionBalance: bigint;
  fractionApproved: boolean;
  selectedBid: TradeMarketBidPreview | null;
};

type BidTradeActionProps = CommonActionProps & {
  assetLedgerAddress?: Address;
  marketplaceAddress?: Address;
  marketplaceAbi?: Abi;
  paymentRouterAddress?: Address;
  paymentBalance: bigint;
  paymentAllowance: bigint;
  initialBidPrice: string;
};

type BuyFormState = {
  amount: string;
};

type SellFormState = {
  amount: string;
};

type BidFormState = {
  amount: string;
  price: string;
  expiryMode: "timed" | "none";
  expiryDays: string;
};

const BUY_INITIAL_VALUES: BuyFormState = { amount: "1" };
const SELL_INITIAL_VALUES: SellFormState = { amount: "1" };

function formatTokenAmount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
}

function formatAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatRawTokenAmount(raw: bigint, decimals: number): string {
  return formatTokenAmount(Number(formatUnits(raw, decimals)));
}

function parseAmountRaw(value: string, decimals: number): bigint | null {
  try {
    const parsed = parseUnits(value.trim(), decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function touchAll<T extends Record<string, unknown>>(values: T): Record<string, boolean> {
  return Object.keys(values).reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

function ActionShell({ title, description, children }: ActionShellProps) {
  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-[var(--muted)]">{description}</p>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4 pb-5 pt-0">{children}</CardContent>
    </Card>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-200">{error}</p>;
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium text-[var(--foreground)]">{value}</span>
    </div>
  );
}

function ActionStatus({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 [overflow-wrap:anywhere]">
      {message}
    </div>
  );
}

export function BuyTradeAction({
  market,
  marketplaceAddress,
  marketplaceAbi,
  paymentRouterAddress,
  userAddress,
  paymentBalance,
  paymentAllowance,
  selectedListing,
  isPaused,
  onTradeExecuted,
}: BuyTradeActionProps) {
  const formik = useFormik<BuyFormState>({
    initialValues: BUY_INITIAL_VALUES,
    enableReinitialize: true,
    validateOnBlur: true,
    validateOnChange: true,
    validationSchema: useMemo(
      () =>
        yup.object({
          amount: yup
            .string()
            .required("Enter the amount to buy.")
            .test("valid-decimal", "Enter a valid amount.", (value) => {
              return parseAmountRaw(value ?? "", 18) !== null;
            })
            .test("listing-selected", "Select an ask from the orderbook.", () => {
              return Boolean(selectedListing);
            })
            .test("not-paused", "Marketplace is paused.", () => !isPaused)
            .test("not-self", "You cannot buy your own listing.", () =>
              Boolean(
                !selectedListing ||
                selectedListing.seller.toLowerCase() !== userAddress?.toLowerCase(),
              ),
            )
            .test("within-listing", "Amount exceeds the selected listing.", function (value) {
              const amountRaw = parseAmountRaw(value ?? "", 18);
              if (!selectedListing || !amountRaw) return false;
              return amountRaw <= selectedListing.amountRaw;
            })
            .test(
              "balance",
              "Wallet balance is below the required quote amount.",
              function (value) {
                const amountRaw = parseAmountRaw(value ?? "", 18);
                const required = selectedListing
                  ? quoteRequiredPaymentRaw(amountRaw, selectedListing.priceRaw)
                  : 0n;
                return required === 0n || paymentBalance >= required;
              },
            ),
        }),
      [isPaused, paymentBalance, selectedListing, userAddress],
    ),
    onSubmit: () => undefined,
  });

  const amountRaw = useMemo(() => parseAmountRaw(formik.values.amount, 18), [formik.values.amount]);
  const requiredPayment = useMemo(
    () =>
      selectedListing && amountRaw
        ? quoteRequiredPaymentRaw(amountRaw, selectedListing.priceRaw)
        : 0n,
    [amountRaw, selectedListing],
  );

  const approvalRequired = Boolean(
    paymentRouterAddress && requiredPayment > 0n && paymentAllowance < requiredPayment,
  );
  const steps = useMemo<TxStep[]>(() => {
    if (!marketplaceAddress || !marketplaceAbi || !selectedListing || !amountRaw) return [];

    const approvalStep =
      paymentRouterAddress && approvalRequired
        ? (makeAddressWriteStep({
            key: "approve-payment",
            label: `Approve ${market.paymentTokenSymbol}`,
            address: market.paymentToken,
            abi: erc20Abi,
            variables: {
              functionName: "approve",
              args: [paymentRouterAddress, requiredPayment] as const,
            },
          }) as unknown as TxStep)
        : null;

    return [
      ...(approvalStep ? [approvalStep] : []),
      makeContractWriteStep({
        key: "buy-listing",
        label: `Buy listing #${selectedListing.listingId.toString()}`,
        contractName: "Marketplace",
        variables: {
          functionName: "buyFromListing",
          args: [selectedListing.listingId, amountRaw] as const,
          value: market.paymentTokenSymbol === "BTC" ? requiredPayment : undefined,
        },
      }) as unknown as TxStep,
    ];
  }, [
    amountRaw,
    approvalRequired,
    market.paymentToken,
    market.paymentTokenSymbol,
    marketplaceAbi,
    marketplaceAddress,
    paymentRouterAddress,
    requiredPayment,
    selectedListing,
  ]);

  const handleRun = async (): Promise<string | null> => {
    const errors = await formik.validateForm();
    if (Object.keys(errors).length > 0) {
      const message = String(Object.values(errors)[0]);
      formik.setStatus(message);
      await formik.setTouched(touchAll(formik.values));
      return message;
    }

    return null;
  };

  const buySteps: TxStep[] = [
    {
      type: "custom",
      key: "buy-preflight",
      label: `Buy ${market.fractionSymbol}`,
      run: async () => {
        formik.setStatus(undefined);
        const validationError = await handleRun();
        if (validationError) {
          throw new Error(validationError);
        }
        return "skip";
      },
    },
    ...steps,
  ];

  return (
    <ActionShell
      title="Buy from listing"
      description="Pick an ask, review the cost, and submit the purchase in one flow."
    >
      <div className="space-y-3">
        <label className="block text-xs text-[var(--muted)]">
          Amount to buy ({market.fractionSymbol})
          <Input
            name="amount"
            value={formik.values.amount}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            inputMode="decimal"
            placeholder="1"
          />
        </label>
        <FieldError error={formik.touched.amount ? formik.errors.amount : undefined} />
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <SummaryRow
          label="Selected ask"
          value={
            selectedListing
              ? `#${selectedListing.listingId.toString()} by ${formatAddress(selectedListing.seller)}`
              : "Select one from the orderbook"
          }
        />
        <SummaryRow
          label="Estimated cost"
          value={`${formatRawTokenAmount(requiredPayment, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
        <SummaryRow
          label="Balance / allowance"
          value={`${formatRawTokenAmount(paymentBalance, market.paymentTokenDecimals)} / ${formatRawTokenAmount(paymentAllowance, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
      </div>

      {approvalRequired ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Payment token approval will run before the buy transaction.
        </div>
      ) : null}

      <ActionStatus message={formik.status ? String(formik.status) : undefined} />

      <TransactionFlowButton
        steps={buySteps}
        disabled={!marketplaceAddress || !marketplaceAbi}
        onComplete={() => {
          formik.resetForm();
          onTradeExecuted?.();
        }}
        onError={(message) => {
          formik.setStatus(message || "Failed to buy from listing.");
        }}
        renderStatusIcon={(state) =>
          state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
        }
      >
        Buy
      </TransactionFlowButton>
    </ActionShell>
  );
}

export function SellTradeAction({
  market,
  marketplaceAddress,
  marketplaceAbi,
  userAddress,
  fractionBalance,
  fractionApproved,
  selectedBid,
  isPaused,
  onTradeExecuted,
}: SellTradeActionProps) {
  const formik = useFormik<SellFormState>({
    initialValues: SELL_INITIAL_VALUES,
    enableReinitialize: true,
    validateOnBlur: true,
    validateOnChange: true,
    validationSchema: useMemo(
      () =>
        yup.object({
          amount: yup
            .string()
            .required("Enter the amount to sell.")
            .test("valid-decimal", "Enter a valid amount.", (value) => {
              return parseAmountRaw(value ?? "", 18) !== null;
            })
            .test("bid-selected", "Select a bid from the orderbook.", () => Boolean(selectedBid))
            .test("not-paused", "Marketplace is paused.", () => !isPaused)
            .test("not-self", "You cannot sell into your own bid.", () =>
              Boolean(
                !selectedBid || selectedBid.bidder.toLowerCase() !== userAddress?.toLowerCase(),
              ),
            )
            .test("within-bid", "Amount exceeds the selected bid.", function (value) {
              const amountRaw = parseAmountRaw(value ?? "", 18);
              if (!selectedBid || !amountRaw) return false;
              return amountRaw <= selectedBid.amountRaw;
            })
            .test(
              "balance",
              "Wallet balance is below the requested sell amount.",
              function (value) {
                const amountRaw = parseAmountRaw(value ?? "", 18);
                return !amountRaw || fractionBalance >= amountRaw;
              },
            )
            .test(
              "approval",
              "Approve fraction transfers before selling into a bid.",
              () => fractionApproved,
            ),
        }),
      [fractionApproved, fractionBalance, isPaused, selectedBid, userAddress],
    ),
    onSubmit: () => undefined,
  });

  const amountRaw = useMemo(() => parseAmountRaw(formik.values.amount, 18), [formik.values.amount]);
  const expectedProceeds = useMemo(
    () =>
      selectedBid && amountRaw ? quoteRequiredPaymentRaw(amountRaw, selectedBid.priceRaw) : 0n,
    [amountRaw, selectedBid],
  );

  const steps = useMemo<TxStep[]>(() => {
    if (!marketplaceAddress || !marketplaceAbi || !selectedBid || !amountRaw) return [];

    return [
      makeContractWriteStep({
        key: "sell-to-bid",
        label: `Sell to bid #${selectedBid.bidId.toString()}`,
        contractName: "Marketplace",
        variables: {
          functionName: "sellToBid",
          args: [selectedBid.bidId, amountRaw] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [amountRaw, marketplaceAbi, marketplaceAddress, selectedBid]);
  const handleRun = async (): Promise<string | null> => {
    const errors = await formik.validateForm();
    if (Object.keys(errors).length > 0) {
      const message = String(Object.values(errors)[0]);
      formik.setStatus(message);
      await formik.setTouched(touchAll(formik.values));
      return message;
    }

    return null;
  };

  const sellSteps: TxStep[] = [
    {
      type: "custom",
      key: "sell-preflight",
      label: `Sell ${market.fractionSymbol}`,
      run: async () => {
        formik.setStatus(undefined);
        const validationError = await handleRun();
        if (validationError) {
          throw new Error(validationError);
        }
        return "skip";
      },
    },
    ...steps,
  ];

  return (
    <ActionShell
      title="Sell into bid"
      description="Fill an active bid and receive the quoted payment token in your wallet."
    >
      <div className="space-y-3">
        <label className="block text-xs text-[var(--muted)]">
          Amount to sell ({market.fractionSymbol})
          <Input
            name="amount"
            value={formik.values.amount}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            inputMode="decimal"
            placeholder="1"
          />
        </label>
        <FieldError error={formik.touched.amount ? formik.errors.amount : undefined} />
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <SummaryRow
          label="Selected bid"
          value={
            selectedBid
              ? `#${selectedBid.bidId.toString()} by ${formatAddress(selectedBid.bidder)}`
              : "Select one from the orderbook"
          }
        />
        <SummaryRow
          label="Estimated proceeds"
          value={`${formatRawTokenAmount(expectedProceeds, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
        <SummaryRow
          label="Wallet fraction balance"
          value={`${formatRawTokenAmount(fractionBalance, 18)} ${market.fractionSymbol}`}
        />
      </div>

      <ActionStatus message={formik.status ? String(formik.status) : undefined} />

      <TransactionFlowButton
        steps={sellSteps}
        disabled={!marketplaceAddress || !marketplaceAbi}
        onComplete={() => {
          formik.resetForm();
          onTradeExecuted?.();
        }}
        onError={(message) => {
          formik.setStatus(message || "Failed to sell into bid.");
        }}
        renderStatusIcon={(state) =>
          state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
        }
      >
        Sell
      </TransactionFlowButton>
    </ActionShell>
  );
}

export function BidTradeAction({
  market,
  assetLedgerAddress,
  marketplaceAddress,
  marketplaceAbi,
  paymentRouterAddress,
  paymentBalance,
  paymentAllowance,
  initialBidPrice,
  isPaused,
  onTradeExecuted,
}: BidTradeActionProps) {
  const formik = useFormik<BidFormState>({
    initialValues: {
      amount: "1",
      price: initialBidPrice || "",
      expiryMode: "timed",
      expiryDays: "7",
    },
    enableReinitialize: true,
    validateOnBlur: true,
    validateOnChange: true,
    validationSchema: useMemo(
      () =>
        yup.object({
          amount: yup
            .string()
            .required("Enter the bid amount.")
            .test("valid-decimal", "Enter a valid amount.", (value) => {
              return parseAmountRaw(value ?? "", 18) !== null;
            }),
          price: yup
            .string()
            .required("Enter a bid price.")
            .test("valid-price", "Enter a valid price.", (value) => {
              return parseAmountRaw(value ?? "", market.paymentTokenDecimals) !== null;
            }),
          expiryMode: yup.string().oneOf(["timed", "none"]).required(),
          expiryDays: yup
            .string()
            .test("expiry-valid", "Expiry must be at least 1 day.", function (value) {
              const parent = this.parent as BidFormState;
              if (parent.expiryMode === "none") return true;
              const parsed = Number.parseInt(value ?? "", 10);
              return Number.isFinite(parsed) && parsed >= 1;
            }),
          notPaused: yup.boolean().test("not-paused", "Marketplace is paused.", () => !isPaused),
        }),
      [isPaused, market.paymentTokenDecimals],
    ),
    onSubmit: () => undefined,
  });

  const amountRaw = useMemo(() => parseAmountRaw(formik.values.amount, 18), [formik.values.amount]);
  const priceRaw = useMemo(
    () => parseAmountRaw(formik.values.price, market.paymentTokenDecimals),
    [formik.values.price, market.paymentTokenDecimals],
  );
  const requiredPayment = useMemo(
    () => quoteRequiredPaymentRaw(amountRaw, priceRaw),
    [amountRaw, priceRaw],
  );
  const parsedExpiryDays = Number.parseInt(formik.values.expiryDays, 10);
  const approvalRequired = Boolean(
    paymentRouterAddress && requiredPayment > 0n && paymentAllowance < requiredPayment,
  );

  const steps = useMemo<TxStep[]>(() => {
    if (!assetLedgerAddress || !marketplaceAddress || !marketplaceAbi || !amountRaw || !priceRaw) {
      return [];
    }

    const expiry =
      formik.values.expiryMode === "none"
        ? 0n
        : BigInt(Math.floor(Date.now() / 1000) + Math.max(1, parsedExpiryDays) * 24 * 60 * 60);

    const approvalStep =
      paymentRouterAddress && approvalRequired
        ? (makeAddressWriteStep({
            key: "approve-payment",
            label: `Approve ${market.paymentTokenSymbol}`,
            address: market.paymentToken,
            abi: erc20Abi,
            variables: {
              functionName: "approve",
              args: [paymentRouterAddress, requiredPayment] as const,
            },
          }) as unknown as TxStep)
        : null;

    return [
      ...(approvalStep ? [approvalStep] : []),
      makeContractWriteStep({
        key: "place-bid",
        label: "Place bid",
        contractName: "Marketplace",
        variables: {
          functionName: "placeBidWithExpiry",
          args: [
            assetLedgerAddress,
            market.trancheId,
            amountRaw,
            market.paymentToken,
            priceRaw,
            expiry,
          ] as const,
        },
      }) as unknown as TxStep,
    ];
  }, [
    amountRaw,
    assetLedgerAddress,
    approvalRequired,
    formik.values.expiryMode,
    market.paymentToken,
    market.paymentTokenSymbol,
    market.trancheId,
    marketplaceAbi,
    marketplaceAddress,
    paymentRouterAddress,
    parsedExpiryDays,
    priceRaw,
    requiredPayment,
  ]);
  const handleRun = async (): Promise<string | null> => {
    const errors = await formik.validateForm();
    if (Object.keys(errors).length > 0) {
      const message = String(Object.values(errors)[0]);
      formik.setStatus(message);
      await formik.setTouched(touchAll(formik.values));
      return message;
    }

    return null;
  };

  const bidStepsWithPreflight: TxStep[] = [
    {
      type: "custom",
      key: "bid-preflight",
      label: "Place bid",
      run: async () => {
        formik.setStatus(undefined);
        const validationError = await handleRun();
        if (validationError) {
          throw new Error(validationError);
        }
        return "skip";
      },
    },
    ...steps,
  ];

  return (
    <ActionShell
      title="Place bid"
      description="Reserve funds for a bid and optionally choose a timed expiry."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-[var(--muted)]">
          Bid amount ({market.fractionSymbol})
          <Input
            name="amount"
            value={formik.values.amount}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            inputMode="decimal"
            placeholder="1"
          />
          <FieldError error={formik.touched.amount ? formik.errors.amount : undefined} />
        </label>
        <label className="block text-xs text-[var(--muted)]">
          Price per fraction ({market.paymentTokenSymbol})
          <Input
            name="price"
            value={formik.values.price}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            inputMode="decimal"
            placeholder={initialBidPrice || "0"}
          />
          <FieldError error={formik.touched.price ? formik.errors.price : undefined} />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <select
          aria-label="Bid expiry mode"
          name="expiryMode"
          className="h-10 rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm"
          value={formik.values.expiryMode}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
        >
          <option value="timed">Timed expiry</option>
          <option value="none">No expiry</option>
        </select>
        <Input
          name="expiryDays"
          value={formik.values.expiryDays}
          disabled={formik.values.expiryMode === "none"}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          placeholder="Days"
        />
      </div>
      <FieldError error={formik.touched.expiryDays ? formik.errors.expiryDays : undefined} />

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <SummaryRow
          label="Estimated reserve"
          value={`${formatRawTokenAmount(requiredPayment, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
        <SummaryRow
          label="Wallet balance"
          value={`${formatRawTokenAmount(paymentBalance, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
        <SummaryRow
          label="Allowance"
          value={`${formatRawTokenAmount(paymentAllowance, market.paymentTokenDecimals)} ${market.paymentTokenSymbol}`}
        />
        <SummaryRow
          label="Expiry"
          value={
            formik.values.expiryMode === "none" ? "No expiry" : `${formik.values.expiryDays} days`
          }
        />
      </div>

      {approvalRequired ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Payment token approval will run before the bid transaction.
        </div>
      ) : null}

      <ActionStatus message={formik.status ? String(formik.status) : undefined} />

      <TransactionFlowButton
        steps={bidStepsWithPreflight}
        disabled={!assetLedgerAddress || !marketplaceAddress || !marketplaceAbi}
        onComplete={() => {
          formik.resetForm();
          onTradeExecuted?.();
        }}
        onError={(message) => {
          formik.setStatus(message || "Failed to place bid.");
        }}
        renderStatusIcon={(state) =>
          state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
        }
      >
        Place bid
      </TransactionFlowButton>
    </ActionShell>
  );
}
