"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as yup from "yup";
import { Button } from "@fractals/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@fractals/ui/ui/dialog";
import { Input } from "@fractals/ui/ui/input";
import { CircleAlert, Info, Loader2 } from "lucide-react";
import { parseUnits } from "viem";
import { makeContractWriteStep, TransactionFlowButton, type TxStep } from "@/lib/tx-flow";
import { useReadContract } from "wagmi";
import { getContractConfig } from "@/contracts/client";
import { ListingReadinessPanel } from "./listing-readiness-panel";
import { formatRawTokenAmount, formatTokenAmount } from "../helpers/formatters";
import { useBidRequirements } from "../hooks/use-bid-requirements";
import { useTradeFlowContext } from "../hooks/use-trade-flow-context";
import { buildBidAutoMatchCandidate, extractCreatedBidId } from "../utils/order-routing";
import type { CreateTradeBidInput, TradeMarket } from "../types";
import { asTrimmedString, isValidDecimalInput } from "../utils/form";
import { quoteRequiredPaymentRaw } from "../utils/pricing";
import {
  deriveFractionSymbol,
  deriveTrancheId,
  TRANCHE_MAX,
  TRANCHE_MIN,
  type CanonicalAssetVariant,
} from "../utils/tranche";

type TradePlaceBidDialogProps = {
  markets: TradeMarket[];
  paymentTokenOptions: Array<{
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  }>;
  createBidSteps: (input: CreateTradeBidInput) => TxStep[];
  canPlaceBid: boolean;
  bidWorkflowContracts: {
    marketplaceAddress: `0x${string}`;
    paymentRouterAddress: `0x${string}`;
  } | null;
  onBidPlaced?: () => void;
};

type FormState = {
  assetVariant: "" | CanonicalAssetVariant;
  trancheNumber: string;
  paymentToken: `0x${string}` | "";
  bidAmount: string;
  unitPrice: string;
  expiryMode: "timed" | "none";
  expiryDays: string;
};

const INITIAL_FORM: FormState = {
  assetVariant: "",
  trancheNumber: "",
  paymentToken: "",
  bidAmount: "1",
  unitPrice: "",
  expiryMode: "timed",
  expiryDays: "7",
};

const MAX_VEBTC_BID_WEEKS = 4;
const EXPIRY_PRESETS = [7, 14, 30] as const;
const TRANCHE_PRESETS = [4, 12, 26, 52, 104, 208] as const;

const MARKETPLACE_ADMIN_ABI = [
  {
    inputs: [],
    name: "adminContract",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ADMIN_READ_ABI = [
  {
    inputs: [],
    name: "isPaused",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function touchAll<T extends Record<string, unknown>>(values: T): Record<string, boolean> {
  return Object.keys(values).reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

function parseBidError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const normalized = text.toLowerCase();

  if (normalized.includes("user rejected") || normalized.includes("user denied")) {
    return "Transaction rejected in wallet.";
  }
  if (normalized.includes("insufficientpaymentallowance")) {
    return "Approve enough payment token allowance before placing this bid.";
  }
  if (normalized.includes("insufficientpaymentbalance")) {
    return "Payment token balance is below this bid's total value.";
  }
  if (normalized.includes("paymenttokennotallowed")) {
    return "Selected payment token is not allowed by the marketplace.";
  }
  if (normalized.includes("unsupportedcollection")) {
    return "Selected fraction collection is not supported by marketplace admin.";
  }
  if (normalized.includes("invalidexpiry")) {
    return "Bid expiry must be in the future, or use no expiry.";
  }
  if (normalized.includes("paused")) {
    return "Marketplace is paused by admin.";
  }

  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function parseAmountRaw(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!isValidDecimalInput(normalized, decimals)) return null;
  try {
    const parsed = parseUnits(normalized, decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function marketVariant(market: TradeMarket): CanonicalAssetVariant | null {
  if (market.fractionBase === "veBTC") return "veBTC";
  if (market.fractionBase === "veMEZO") return "veMEZO";

  const normalizedSymbol = market.fractionSymbol.toLowerCase();
  if (normalizedSymbol.startsWith("fvebtc")) return "veBTC";
  if (normalizedSymbol.startsWith("fvemezo")) return "veMEZO";

  return null;
}

export function TradePlaceBidDialog({
  markets,
  paymentTokenOptions,
  createBidSteps,
  canPlaceBid,
  bidWorkflowContracts,
  onBidPlaced,
}: TradePlaceBidDialogProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [stepValidationErrors, setStepValidationErrors] = useState<string[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [successHash, setSuccessHash] = useState<`0x${string}` | null>(null);

  const { userAddress, isConnected, isCorrectNetwork, expectedChainId, blockExplorerUrl } =
    useTradeFlowContext();

  const marketplace = getContractConfig(expectedChainId, "Marketplace");
  const assetLedger = getContractConfig(expectedChainId, "AssetLedger");
  const assetLedgerAddress = assetLedger?.address;

  const canonicalMarkets = useMemo(
    () => markets.filter((market) => marketVariant(market) !== null),
    [markets],
  );

  const adminContractRead = useReadContract({
    address: marketplace?.address,
    abi: MARKETPLACE_ADMIN_ABI,
    functionName: "adminContract",
    chainId: expectedChainId,
    query: {
      enabled: Boolean(open && marketplace?.address && marketplace.abi),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  });

  const adminContractAddress = adminContractRead.data as `0x${string}` | undefined;

  const pausedRead = useReadContract({
    address: adminContractAddress,
    abi: ADMIN_READ_ABI,
    functionName: "isPaused",
    chainId: expectedChainId,
    query: {
      enabled: Boolean(
        open &&
        adminContractAddress &&
        adminContractAddress !== "0x0000000000000000000000000000000000000000",
      ),
      staleTime: 15_000,
      gcTime: 5 * 60_000,
    },
  });

  const isPaused = pausedRead.data === true;

  const validationSchema = useMemo(
    () =>
      yup.object({
        assetVariant: yup
          .string()
          .oneOf(["veBTC", "veMEZO"], "Select a canonical asset variant.")
          .required("Select a canonical asset variant."),
        trancheNumber: yup
          .string()
          .required("Tranche weeks are required.")
          .test("tranche-range", function (v) {
            if (!v) {
              return this.createError({ message: "Tranche weeks are required." });
            }

            const parsed = Number.parseInt(v, 10);
            if (!Number.isInteger(parsed) || parsed < TRANCHE_MIN || parsed > TRANCHE_MAX) {
              return this.createError({
                message: `Tranche weeks must be ${TRANCHE_MIN}-${TRANCHE_MAX}.`,
              });
            }

            if (
              (this.parent as FormState).assetVariant === "veBTC" &&
              parsed > MAX_VEBTC_BID_WEEKS
            ) {
              return this.createError({
                message: `veBTC bids are limited to ${MAX_VEBTC_BID_WEEKS} weeks.`,
              });
            }

            return true;
          }),
        paymentToken: yup.string().required("Select a payment token for this tranche market."),
        bidAmount: yup
          .string()
          .required("Bid amount must be greater than 0.")
          .test("amount-valid", "Bid amount must be a valid decimal value.", (value) => {
            if (!value) return false;
            return isValidDecimalInput(value.trim(), 18);
          })
          .test("amount-positive", "Bid amount must be greater than 0.", (value) => {
            if (!value) return false;
            return Number.parseFloat(value.trim()) > 0;
          }),
        unitPrice: yup
          .string()
          .required("Bid unit price must be greater than 0.")
          .test("price-valid", "Bid unit price must be a valid decimal value.", function (value) {
            if (!value) return false;
            const decimals =
              paymentTokenOptions.find(
                (token) => token.address.toLowerCase() === this.parent.paymentToken?.toLowerCase(),
              )?.decimals ?? 18;
            return isValidDecimalInput(value.trim(), decimals);
          })
          .test("price-positive", "Bid unit price must be greater than 0.", (value) => {
            if (!value) return false;
            return Number.parseFloat(value.trim()) > 0;
          }),
        expiryMode: yup.string().oneOf(["timed", "none"]).required(),
        expiryDays: yup
          .string()
          .test("expiry-valid", "Expiry must be at least 1 day.", (v, ctx) => {
            if ((ctx.parent as FormState).expiryMode === "none") return true;
            if (!v) return false;
            const parsed = Number.parseInt(v, 10);
            return Number.isFinite(parsed) && parsed >= 1;
          }),
      }),
    [paymentTokenOptions],
  );

  const formik = useFormik<FormState>({
    initialValues: INITIAL_FORM,
    validationSchema,
    onSubmit: () => undefined,
  });

  const trancheNumberValue = Number.parseInt(formik.values.trancheNumber, 10);
  const maxBidWeeks = formik.values.assetVariant === "veBTC" ? MAX_VEBTC_BID_WEEKS : TRANCHE_MAX;

  const computedTokenId = useMemo(() => {
    if (formik.values.assetVariant !== "veBTC" && formik.values.assetVariant !== "veMEZO") {
      return null;
    }
    if (
      !Number.isInteger(trancheNumberValue) ||
      trancheNumberValue < TRANCHE_MIN ||
      trancheNumberValue > TRANCHE_MAX ||
      (formik.values.assetVariant === "veBTC" && trancheNumberValue > MAX_VEBTC_BID_WEEKS)
    ) {
      return null;
    }

    try {
      return deriveTrancheId(formik.values.assetVariant, trancheNumberValue);
    } catch {
      return null;
    }
  }, [formik.values.assetVariant, trancheNumberValue]);

  const computedFractionSymbol = useMemo(() => {
    if (formik.values.assetVariant !== "veBTC" && formik.values.assetVariant !== "veMEZO") {
      return null;
    }
    if (
      !Number.isInteger(trancheNumberValue) ||
      trancheNumberValue < TRANCHE_MIN ||
      trancheNumberValue > TRANCHE_MAX ||
      (formik.values.assetVariant === "veBTC" && trancheNumberValue > MAX_VEBTC_BID_WEEKS)
    ) {
      return null;
    }
    try {
      return deriveFractionSymbol(formik.values.assetVariant, trancheNumberValue);
    } catch {
      return null;
    }
  }, [formik.values.assetVariant, trancheNumberValue]);

  const selectedPaymentToken = useMemo(
    () =>
      paymentTokenOptions.find(
        (token) => token.address.toLowerCase() === formik.values.paymentToken.toLowerCase(),
      ) ?? null,
    [formik.values.paymentToken, paymentTokenOptions],
  );

  const selectedMarket = useMemo(() => {
    if (!computedTokenId || !formik.values.paymentToken) return null;
    return (
      canonicalMarkets.find(
        (market) =>
          market.trancheId === computedTokenId &&
          market.paymentToken.toLowerCase() === formik.values.paymentToken.toLowerCase(),
      ) ?? null
    );
  }, [canonicalMarkets, computedTokenId, formik.values.paymentToken]);

  const bidAmountInput = asTrimmedString(formik.values.bidAmount);
  const unitPriceInput = asTrimmedString(formik.values.unitPrice);

  const bidAmountRaw = useMemo(() => parseAmountRaw(bidAmountInput || "0", 18), [bidAmountInput]);

  const bidPriceRaw = useMemo(() => {
    if (!selectedPaymentToken) return null;
    return parseAmountRaw(unitPriceInput || "0", selectedPaymentToken.decimals);
  }, [selectedPaymentToken, unitPriceInput]);

  const requiredPaymentRaw = useMemo(() => {
    return quoteRequiredPaymentRaw(bidAmountRaw, bidPriceRaw);
  }, [bidAmountRaw, bidPriceRaw]);

  const bidRequirements = useBidRequirements({
    bidderAddress: userAddress,
    paymentToken: selectedPaymentToken?.address,
    paymentRouterAddress: bidWorkflowContracts?.paymentRouterAddress,
    requiredPaymentRaw,
    isNativePayment: selectedPaymentToken?.symbol === "BTC",
    chainId: expectedChainId,
  });

  const requiredPaymentLabel = useMemo(() => {
    if (!selectedPaymentToken || requiredPaymentRaw <= 0n) {
      return `0 ${selectedPaymentToken?.symbol ?? ""}`;
    }
    return formatRawTokenAmount(
      requiredPaymentRaw,
      selectedPaymentToken.decimals,
      selectedPaymentToken.symbol,
    );
  }, [requiredPaymentRaw, selectedPaymentToken]);

  const balanceLabel = useMemo(() => {
    if (!selectedPaymentToken) return "-";
    return formatRawTokenAmount(
      bidRequirements.balanceRaw,
      selectedPaymentToken.decimals,
      selectedPaymentToken.symbol,
    );
  }, [bidRequirements.balanceRaw, selectedPaymentToken]);

  const allowanceLabel = useMemo(() => {
    if (!selectedPaymentToken) return "-";
    return formatRawTokenAmount(
      bidRequirements.allowanceRaw,
      selectedPaymentToken.decimals,
      selectedPaymentToken.symbol,
    );
  }, [bidRequirements.allowanceRaw, selectedPaymentToken]);

  const parsedBidDays = Number.parseInt(formik.values.expiryDays, 10);

  const preparedBidInput = useMemo(() => {
    if (
      !computedTokenId ||
      !selectedPaymentToken ||
      !bidAmountRaw ||
      !bidPriceRaw ||
      !canPlaceBid ||
      !isConnected ||
      !isCorrectNetwork ||
      !bidWorkflowContracts ||
      !assetLedgerAddress
    ) {
      return null;
    }

    if (
      formik.values.expiryMode === "timed" &&
      (!Number.isFinite(parsedBidDays) || parsedBidDays < 1)
    ) {
      return null;
    }

    if (
      formik.values.assetVariant === "veBTC" &&
      Number.isFinite(trancheNumberValue) &&
      trancheNumberValue > MAX_VEBTC_BID_WEEKS
    ) {
      return null;
    }

    return {
      collection: assetLedgerAddress,
      tokenId: computedTokenId,
      bidAmountRaw,
      bidAmount: bidAmountInput,
      paymentToken: selectedPaymentToken.address,
      paymentTokenSymbol: selectedPaymentToken.symbol,
      paymentTokenDecimals: selectedPaymentToken.decimals,
      bidPriceRaw,
      unitPrice: unitPriceInput,
      requiredPaymentRaw,
      expiryMode: formik.values.expiryMode,
      expiryDays: formik.values.expiryMode === "none" ? 0 : parsedBidDays,
      requiresPaymentApproval: bidRequirements.needsApproval,
    } satisfies CreateTradeBidInput;
  }, [
    assetLedgerAddress,
    bidAmountInput,
    bidAmountRaw,
    bidPriceRaw,
    bidRequirements.needsApproval,
    bidWorkflowContracts,
    canPlaceBid,
    computedTokenId,
    formik.values.expiryMode,
    isConnected,
    isCorrectNetwork,
    parsedBidDays,
    requiredPaymentRaw,
    selectedPaymentToken,
    formik.values.assetVariant,
    trancheNumberValue,
    unitPriceInput,
  ]);

  const bidAutoMatchCandidate = useMemo(() => {
    if (!preparedBidInput) return null;

    return buildBidAutoMatchCandidate({
      markets,
      tokenId: preparedBidInput.tokenId,
      paymentToken: preparedBidInput.paymentToken,
      bidPriceRaw: preparedBidInput.bidPriceRaw,
      bidAmountRaw: preparedBidInput.bidAmountRaw,
      userAddress,
    });
  }, [markets, preparedBidInput, userAddress]);

  const bidSteps = useMemo(() => {
    if (!preparedBidInput) return [];
    try {
      const baseSteps = createBidSteps(preparedBidInput);
      if (!bidAutoMatchCandidate || !marketplace?.address || !marketplace.abi) {
        return baseSteps;
      }

      return [
        ...baseSteps,
        makeContractWriteStep({
          key: "match-best-listing",
          label: `Match ${bidAutoMatchCandidate.marketLabel}`,
          contractName: "Marketplace",
          variables: ({ prev }: { prev: Array<{ receipt?: unknown }> }) => {
            const previousReceipt = prev[prev.length - 1]?.receipt as Parameters<
              typeof extractCreatedBidId
            >[0];
            const createdBidId = extractCreatedBidId(previousReceipt);
            if (!createdBidId) {
              throw new Error("Unable to resolve created bid ID for auto-match.");
            }

            return {
              functionName: "matchOrders",
              args: [
                bidAutoMatchCandidate.opposingOrderId,
                createdBidId,
                bidAutoMatchCandidate.fillAmountRaw,
              ] as const,
            };
          },
        }) as unknown as TxStep,
      ];
    } catch {
      return [];
    }
  }, [bidAutoMatchCandidate, createBidSteps, marketplace, preparedBidInput]);

  const canSubmit =
    Boolean(preparedBidInput) &&
    bidSteps.length > 0 &&
    !isPaused &&
    !isBroadcasting &&
    !bidRequirements.isChecking;

  const bidStepsWithPreflight: TxStep[] = [
    {
      type: "custom",
      key: "bid-preflight",
      label: "Place bid",
      run: async () => {
        setSuccessHash(null);
        setIsBroadcasting(true);
        formik.setStatus(undefined);

        const errors = await formik.validateForm();
        if (Object.keys(errors).length > 0) {
          resetFormState();
          const message = parseBidError(String(Object.values(errors)[0]));
          formik.setStatus(message);
          await formik.setTouched(touchAll(formik.values));
          throw new Error(message);
        }

        return "skip";
      },
    },
    ...bidSteps,
  ];

  const primaryActionLabel = useMemo(() => {
    if (preparedBidInput?.requiresPaymentApproval) {
      return `Approve ${preparedBidInput.paymentTokenSymbol}`;
    }
    return bidAutoMatchCandidate ? "Place bid & match" : "Place Bid";
  }, [bidAutoMatchCandidate, preparedBidInput]);

  const successHref =
    successHash && blockExplorerUrl ? `${blockExplorerUrl}/tx/${successHash}` : null;

  const readinessItems = useMemo(
    () => [
      {
        key: "wallet",
        label: "Wallet connected",
        detail: "Connect wallet to sign approval and bid transactions.",
        ready: isConnected,
      },
      {
        key: "network",
        label: "Correct network",
        detail: `Connect to chain ${expectedChainId} for Fractals marketplace contracts.`,
        ready: isCorrectNetwork,
      },
      {
        key: "token-id",
        label: "Fraction symbol derived",
        detail: computedFractionSymbol
          ? `Computed symbol: ${computedFractionSymbol}`
          : "Set asset type and lock duration to derive a valid fraction symbol.",
        ready: Boolean(computedFractionSymbol),
      },
      {
        key: "duration-cap",
        label: "Bid duration cap",
        detail:
          formik.values.assetVariant === "veBTC"
            ? `veBTC bids are capped at ${MAX_VEBTC_BID_WEEKS} weeks.`
            : `veMEZO bids can use up to ${TRANCHE_MAX} weeks.`,
        ready:
          formik.values.assetVariant !== "veBTC" ||
          !Number.isFinite(trancheNumberValue) ||
          trancheNumberValue <= MAX_VEBTC_BID_WEEKS,
      },
      {
        key: "pause",
        label: "Marketplace not paused",
        detail: "Admin pause blocks all order creation including bids.",
        ready: !isPaused,
      },
      {
        key: "allowance",
        label: "Payment allowance",
        detail: `Allowance to PaymentRouter: ${allowanceLabel}`,
        ready: !preparedBidInput?.requiresPaymentApproval,
      },
      ...(bidAutoMatchCandidate
        ? [
            {
              key: "auto-match",
              label: `Auto-match ${bidAutoMatchCandidate.marketLabel}`,
              detail: `The bid will be matched against order #${bidAutoMatchCandidate.opposingOrderId.toString()} if the create transaction succeeds.`,
              ready: false,
            },
          ]
        : []),
    ],
    [
      allowanceLabel,
      computedFractionSymbol,
      expectedChainId,
      isConnected,
      isCorrectNetwork,
      isPaused,
      bidAutoMatchCandidate,
      preparedBidInput?.requiresPaymentApproval,
      formik.values.assetVariant,
      trancheNumberValue,
    ],
  );

  const pendingReadinessItems = useMemo(
    () => readinessItems.filter((item) => !item.ready),
    [readinessItems],
  );

  const transactionPlanItems = useMemo(() => {
    if (!preparedBidInput) return [];
    return [
      ...(preparedBidInput.requiresPaymentApproval
        ? [
            {
              key: "approval",
              label: `Approve ${preparedBidInput.paymentTokenSymbol}`,
              detail:
                "One ERC20 approval transaction may be required for PaymentRouter to pull quote funds.",
              ready: false,
            },
          ]
        : []),
      ...(bidAutoMatchCandidate
        ? [
            {
              key: "auto-match",
              label: `Auto-match ${bidAutoMatchCandidate.marketLabel}`,
              detail: `The bid will be matched against order #${bidAutoMatchCandidate.opposingOrderId.toString()} if the create transaction succeeds.`,
              ready: false,
            },
          ]
        : []),
    ];
  }, [bidAutoMatchCandidate, preparedBidInput]);

  useEffect(() => {
    if (formik.values.assetVariant !== "veBTC" && formik.values.assetVariant !== "veMEZO") {
      void formik.setFieldValue("assetVariant", "veBTC");
    }

    const existingTranche = Number.parseInt(formik.values.trancheNumber, 10);
    if (
      !Number.isInteger(existingTranche) ||
      existingTranche < TRANCHE_MIN ||
      existingTranche > TRANCHE_MAX
    ) {
      void formik.setFieldValue("trancheNumber", "52");
      return;
    }

    if (formik.values.assetVariant === "veBTC" && existingTranche > MAX_VEBTC_BID_WEEKS) {
      void formik.setFieldValue("trancheNumber", String(MAX_VEBTC_BID_WEEKS));
    }
  }, [formik, formik.values.assetVariant, formik.values.trancheNumber]);

  useEffect(() => {
    if (paymentTokenOptions.length === 0) {
      if (formik.values.paymentToken) {
        void formik.setFieldValue("paymentToken", "");
      }
      return;
    }

    const hasSelection = paymentTokenOptions.some(
      (option) => option.address.toLowerCase() === formik.values.paymentToken.toLowerCase(),
    );

    if (!hasSelection) {
      void formik.setFieldValue("paymentToken", paymentTokenOptions[0]!.address);
    }
  }, [formik, formik.values.paymentToken, paymentTokenOptions]);

  useEffect(() => {
    if (!selectedMarket) return;
    if (!formik.values.unitPrice) {
      const defaultPrice = selectedMarket.bestBidPrice ?? selectedMarket.floorPrice ?? 0;
      if (defaultPrice > 0) {
        void formik.setFieldValue("unitPrice", String(defaultPrice));
      }
    }
  }, [formik, formik.values.unitPrice, selectedMarket]);

  function resetFlow() {
    setStepIndex(1);
    setStepValidationErrors([]);
    setSuccessHash(null);
    formik.resetForm();
  }

  function resetFormState() {
    setStepIndex(1);
    setStepValidationErrors([]);
    formik.resetForm();
  }

  function getStepFields(step: number): Array<keyof FormState> {
    if (step === 1) return ["assetVariant", "trancheNumber", "paymentToken"];
    if (step === 2) return ["bidAmount", "unitPrice", "expiryMode", "expiryDays"];
    return [];
  }

  async function handleNextStep() {
    const errors = await formik.validateForm();
    const stepFields = getStepFields(stepIndex);
    const messages = Array.from(
      new Set(
        stepFields
          .map((field) => errors[field])
          .filter(
            (message): message is string => typeof message === "string" && message.length > 0,
          ),
      ),
    );

    if (stepIndex === 1) {
      if (!computedTokenId) {
        messages.push("Selected asset configuration is invalid.");
      }
      if (!formik.values.paymentToken) {
        messages.push("Choose an allowed payment token.");
      }
    }

    if (stepIndex === 3) {
      if (!isConnected) {
        setStepValidationErrors(["Connect your wallet before placing a bid."]);
        return;
      }
      if (!isCorrectNetwork) {
        setStepValidationErrors([
          "Switch to the configured Fractals network before placing a bid.",
        ]);
        return;
      }
      if (!canPlaceBid || !bidWorkflowContracts) {
        setStepValidationErrors(["Bid contracts are unavailable for this network."]);
        return;
      }
      if (!assetLedgerAddress) {
        setStepValidationErrors(["AssetLedger contract is unavailable for this network."]);
        return;
      }
      if (isPaused) {
        setStepValidationErrors(["Marketplace is paused by admin and cannot accept bids."]);
        return;
      }
    }

    if (messages.length > 0) {
      setStepValidationErrors(messages);
      await Promise.all(stepFields.map((field) => formik.setFieldTouched(field, true, false)));
      return;
    }

    setStepValidationErrors([]);
    setStepIndex((current) => Math.min(4, current + 1));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetFlow();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={paymentTokenOptions.length === 0}>
          Place Bid
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Place bid</DialogTitle>
          <DialogDescription>
            Create a non-custodial bid for a fraction market. Funds stay in your wallet until a
            seller fills your bid.
          </DialogDescription>
        </DialogHeader>

        {successHash ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <div className="flex items-center justify-between gap-3">
              <p>Bid transaction submitted successfully.</p>
              <div className="flex items-center gap-2">
                {successHref ? (
                  <a
                    href={successHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-100 underline underline-offset-4"
                  >
                    View transaction
                  </a>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSuccessHash(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.02] p-2 sm:grid-cols-4">
          {[
            { id: 1, title: "What" },
            { id: 2, title: "Offer" },
            { id: 3, title: "Ready" },
            { id: 4, title: "Confirm" },
          ].map((step) => {
            const isActive = stepIndex === step.id;
            const isComplete = stepIndex > step.id;

            return (
              <div
                key={step.id}
                className={`rounded-lg px-3 py-2 text-xs ${
                  isActive
                    ? "bg-[#b58f5f]/20 text-[var(--foreground)]"
                    : isComplete
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "bg-white/[0.02] text-[var(--muted)]"
                }`}
              >
                <p className="font-semibold">Step {step.id}</p>
                <p>{step.title}</p>
              </div>
            );
          })}
        </div>

        <form className="space-y-4">
          {stepIndex === 1 ? (
            <div className="space-y-4 rounded-xl bg-white/[0.02] p-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Asset type
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { value: "veBTC", label: "veBTC" },
                      { value: "veMEZO", label: "veMEZO" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
                        formik.values.assetVariant === option.value
                          ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                          : "border-white/15 bg-white/[0.02]"
                      }`}
                      onClick={() => void formik.setFieldValue("assetVariant", option.value)}
                      disabled={isBroadcasting}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Lock duration (weeks) ({TRANCHE_MIN}-{maxBidWeeks})
                </p>
                <Input
                  name="trancheNumber"
                  type="number"
                  min={TRANCHE_MIN}
                  max={maxBidWeeks}
                  step={1}
                  value={formik.values.trancheNumber}
                  onChange={formik.handleChange}
                  disabled={isBroadcasting}
                />
                <div className="flex flex-wrap gap-2">
                  {TRANCHE_PRESETS.filter((preset) => preset <= maxBidWeeks).map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant={
                        Number.parseInt(formik.values.trancheNumber, 10) === preset
                          ? "default"
                          : "secondary"
                      }
                      onClick={() => void formik.setFieldValue("trancheNumber", String(preset))}
                      disabled={isBroadcasting}
                    >
                      {preset}w
                    </Button>
                  ))}
                </div>
                {formik.values.assetVariant === "veBTC" ? (
                  <p className="text-xs text-amber-100">
                    veBTC bids can only target lock durations up to {MAX_VEBTC_BID_WEEKS} weeks.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Payment token
                </p>
                <select
                  name="paymentToken"
                  value={formik.values.paymentToken}
                  onChange={formik.handleChange}
                  disabled={paymentTokenOptions.length === 0 || isBroadcasting}
                  className="h-10 w-full rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
                >
                  <option value="">Select payment token</option>
                  {paymentTokenOptions.map((token) => (
                    <option key={token.address} value={token.address}>
                      {token.symbol}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--muted)]">
                  Use any allowed payment token. Live market stats appear when available.
                </p>
              </div>

              {selectedMarket ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <p className="font-semibold text-[var(--foreground)]">{selectedMarket.pair}</p>
                  <div className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                    <p>Bidding on: {selectedMarket.fractionName}</p>
                    <p>Tranche tokenId: {computedTokenId?.toString() ?? "-"}</p>
                    <p>
                      Best ask:{" "}
                      {selectedMarket.floorPrice
                        ? formatTokenAmount(selectedMarket.floorPrice)
                        : "-"}{" "}
                      {selectedMarket.paymentTokenSymbol}
                    </p>
                    <p>
                      Best bid:{" "}
                      {selectedMarket.bestBidPrice
                        ? formatTokenAmount(selectedMarket.bestBidPrice)
                        : "-"}{" "}
                      {selectedMarket.paymentTokenSymbol}
                    </p>
                  </div>
                </div>
              ) : null}

              {paymentTokenOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                  No allowed payment tokens are configured for this marketplace yet.
                </div>
              ) : null}
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="space-y-4 rounded-xl bg-white/[0.02] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Bid amount
                  </p>
                  <Input
                    name="bidAmount"
                    type="number"
                    min={0}
                    step="any"
                    value={formik.values.bidAmount}
                    onChange={formik.handleChange}
                    disabled={!selectedPaymentToken || isBroadcasting}
                  />
                  <p className="text-xs text-[var(--muted)]">
                    Amount of {selectedMarket?.fractionSymbol ?? "fraction"} to bid for.
                  </p>
                </label>

                <label className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Bid price per fraction
                  </p>
                  <Input
                    name="unitPrice"
                    type="number"
                    min={0}
                    step="any"
                    value={formik.values.unitPrice}
                    onChange={formik.handleChange}
                    disabled={!selectedPaymentToken || isBroadcasting}
                  />
                  <p className="text-xs text-[var(--muted)]">
                    Price in {selectedMarket?.paymentTokenSymbol ?? "payment token"}.
                  </p>
                </label>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3 text-xs text-[var(--muted)]">
                <p>
                  Required quote token:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {requiredPaymentLabel}
                  </span>
                </p>
                <p>
                  Wallet balance:{" "}
                  <span className="font-medium text-[var(--foreground)]">{balanceLabel}</span>
                </p>
                <p>
                  Allowance to PaymentRouter:{" "}
                  <span className="font-medium text-[var(--foreground)]">{allowanceLabel}</span>
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Bid expiry
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      formik.values.expiryMode === "timed"
                        ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                        : "border-white/15 bg-white/[0.02]"
                    }`}
                    onClick={() => void formik.setFieldValue("expiryMode", "timed")}
                  >
                    Timed bid
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      formik.values.expiryMode === "none"
                        ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                        : "border-white/15 bg-white/[0.02]"
                    }`}
                    onClick={() => void formik.setFieldValue("expiryMode", "none")}
                  >
                    No expiry
                  </button>
                </div>

                {formik.values.expiryMode === "timed" ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {EXPIRY_PRESETS.map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          size="sm"
                          variant={
                            Number.parseInt(formik.values.expiryDays, 10) === preset
                              ? "default"
                              : "secondary"
                          }
                          onClick={() => void formik.setFieldValue("expiryDays", String(preset))}
                          disabled={isBroadcasting}
                        >
                          {preset} days
                        </Button>
                      ))}
                    </div>
                    <Input
                      name="expiryDays"
                      type="number"
                      min={1}
                      step={1}
                      value={formik.values.expiryDays}
                      onChange={formik.handleChange}
                      disabled={isBroadcasting}
                    />
                  </>
                ) : (
                  <p className="text-xs text-[var(--muted)]">
                    This sends <code>expiry = 0</code> so the bid remains active until filled or
                    cancelled.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {stepIndex === 3 ? (
            <div className="space-y-4">
              <ListingReadinessPanel
                title="Bid prerequisites"
                isChecking={
                  bidRequirements.isChecking ||
                  pausedRead.isFetching ||
                  adminContractRead.isFetching
                }
                error={bidRequirements.error?.message ?? null}
                onRefresh={() => {
                  bidRequirements.refresh();
                  void pausedRead.refetch();
                  void adminContractRead.refetch();
                }}
                items={pendingReadinessItems}
                allDone={pendingReadinessItems.length === 0}
                emptyLabel="All bid prerequisites are satisfied."
              />

              <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-xs text-[var(--muted)]">
                <p className="mb-1 flex items-center gap-1 font-semibold text-[var(--foreground)]">
                  <Info className="h-3.5 w-3.5" />
                  Marketplace behavior
                </p>
                <p>Token ID is derived canonically from asset type and lock duration.</p>
              </div>
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white/[0.02] p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Review bid
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                    {selectedMarket && computedTokenId
                      ? `${selectedMarket.pair} • tokenId ${computedTokenId.toString()}`
                      : "Bid configuration incomplete"}
                  </p>
                </div>

                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
                    Market pair:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {computedFractionSymbol ?? "-"}
                    </span>
                  </p>
                  <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
                    Bid amount:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {formik.values.bidAmount} {selectedMarket?.fractionSymbol ?? ""}
                    </span>
                  </p>
                  <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
                    Unit price:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {formik.values.unitPrice} {selectedMarket?.paymentTokenSymbol ?? ""}
                    </span>
                  </p>
                  <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
                    Required payment:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {requiredPaymentLabel}
                    </span>
                  </p>
                  <p className="rounded-lg bg-black/20 px-3 py-2 text-[var(--muted)]">
                    Expiry:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {formik.values.expiryMode === "none"
                        ? "No expiry"
                        : `${formik.values.expiryDays} days`}
                    </span>
                  </p>
                </div>
              </div>

              {transactionPlanItems.length > 0 ? (
                <ListingReadinessPanel
                  title="Transaction plan"
                  isChecking={bidRequirements.isChecking}
                  items={transactionPlanItems}
                />
              ) : null}
            </div>
          ) : null}

          {stepValidationErrors.length > 0 ? (
            <div className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {stepValidationErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : null}

          {formik.status ? (
            <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {String(formik.status)}
            </p>
          ) : null}

          {!preparedBidInput && stepIndex === 4 ? (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="flex items-center gap-1">
                <CircleAlert className="h-4 w-4" />
                Bid input is incomplete or invalid. Review previous steps before submitting.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={isBroadcasting}
            >
              Cancel
            </Button>

            {stepIndex > 1 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStepValidationErrors([]);
                  setStepIndex((current) => Math.max(1, current - 1));
                }}
                disabled={isBroadcasting}
              >
                Back
              </Button>
            ) : null}

            {stepIndex < 4 ? (
              <Button type="button" onClick={handleNextStep} disabled={isBroadcasting}>
                Continue
              </Button>
            ) : (
              <TransactionFlowButton
                steps={bidStepsWithPreflight}
                disabled={!canSubmit}
                onComplete={(results) => {
                  const txHash = [...results].reverse().find((result) => result.hash)?.hash;
                  if (txHash) {
                    setSuccessHash(txHash);
                  }
                  resetFormState();
                  bidRequirements.refresh();
                  onBidPlaced?.();
                  setIsBroadcasting(false);
                }}
                onError={(message) => {
                  resetFormState();
                  formik.setStatus(parseBidError(message ?? "Failed to place bid."));
                  setIsBroadcasting(false);
                }}
                renderStatusIcon={(state) =>
                  state === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : null
                }
              >
                {primaryActionLabel}
              </TransactionFlowButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
