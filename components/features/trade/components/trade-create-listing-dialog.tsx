"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as yup from "yup";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, Skeleton } from "@ui";
import { CircleAlert, Info, Loader2, RefreshCw } from "lucide-react";
import { formatUnits, parseUnits } from "viem";
import {
  makeContractWriteStep,
  TransactionFlowButton,
  type TxStep,
  type TxStepResult,
} from "@/lib/tx-flow";
import { getContractConfig } from "@/contracts/client";
import { ListingReadinessPanel } from "./listing-readiness-panel";
import { ListingReviewCard } from "./listing-review-card";
import { formatTokenAmount } from "../helpers/formatters";
import { useListingPreview } from "../hooks/use-listing-preview";
import { useListingRequirements } from "../hooks/use-listing-requirements";
import { useTradeFlowContext } from "../hooks/use-trade-flow-context";
import { useUserFractions } from "../hooks/use-user-fractions";
import { useUserVeNFTs, type UserVeNft } from "../hooks/use-user-ve-nfts";
import { buildListingAutoMatchCandidate, extractCreatedListingId } from "../utils/order-routing";

import type {
  CreateFractionTradeListingInput,
  CreateVeTradeListingInput,
  TradeMarket,
  TradeAsset,
  TradeVeAssetType,
} from "../types";
import { asTrimmedString, isValidDecimalInput, normalizeInputAmount } from "../utils/form";

type TradeCreateListingDialogProps = {
  createVeListingSteps: (input: CreateVeTradeListingInput) => TxStep[];
  createFractionListingSteps: (input: CreateFractionTradeListingInput) => TxStep[];
  canCreateListing: boolean;
  mapCreatedListingAsset: (input: CreateVeTradeListingInput, hash: string) => TradeAsset;
  mapCreatedFractionListingAsset: (
    input: CreateFractionTradeListingInput,
    hash: string,
  ) => TradeAsset;
  onCreated?: (asset: TradeAsset) => void;
  onListingCompleted?: () => void;
  markets: TradeMarket[];
  listingWorkflowContracts: {
    listingWrapperAddress: `0x${string}`;
    assetLedgerAddress: `0x${string}`;
    marketplaceAddress: `0x${string}`;
  } | null;
  blockExplorerUrl: string | null;
  paymentTokenOptions: Array<{
    address: `0x${string}`;
    symbol: string;
    decimals: number;
  }>;
  protocolFeeBps?: number | null;
  isLoadingPaymentTokens?: boolean;
  paymentTokenError?: Error | null;
  onRefreshPaymentTokens?: () => void;
};

type FormState = {
  listingMode: "ve_nft" | "fraction";
  veAssetType: TradeVeAssetType;
  veNftTokenId: string;
  fractionTrancheId: string;
  listAmount: string;
  paymentToken: `0x${string}` | "";
  unitPrice: string;
  expiryMode: "timed" | "none";
  expiryDays: string;
};

const INITIAL_FORM: FormState = {
  listingMode: "ve_nft",
  veAssetType: "veBTC",
  veNftTokenId: "",
  fractionTrancheId: "",
  listAmount: "1",
  paymentToken: "",
  unitPrice: "0",
  expiryMode: "none",
  expiryDays: "30",
};

const EXPIRY_PRESETS = [7, 14, 30] as const;
const MAX_PRICE_DECIMALS = 18;

function touchAll<T extends Record<string, unknown>>(values: T): Record<string, boolean> {
  return Object.keys(values).reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

export function TradeCreateListingDialog({
  createVeListingSteps,
  createFractionListingSteps,
  canCreateListing,
  mapCreatedListingAsset,
  mapCreatedFractionListingAsset,
  onCreated,
  onListingCompleted,
  markets,
  listingWorkflowContracts,
  blockExplorerUrl,
  paymentTokenOptions,
  protocolFeeBps = null,
  isLoadingPaymentTokens = false,
  paymentTokenError = null,
  onRefreshPaymentTokens,
}: TradeCreateListingDialogProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [stepValidationErrors, setStepValidationErrors] = useState<string[]>([]);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [successHash, setSuccessHash] = useState<`0x${string}` | null>(null);
  const { userAddress, isConnected, expectedChainId, isCorrectNetwork } = useTradeFlowContext();
  const marketplace = getContractConfig(expectedChainId, "Marketplace");

  const { veCollections, isLoading, isFetching, error, refresh: refreshVeNfts } = useUserVeNFTs();
  const {
    positions: ownedFractions,
    isLoading: fractionsLoading,
    isFetching: fractionsFetching,
    error: fractionsError,
    refresh: refreshFractions,
  } = useUserFractions();

  const resolveCollection = useCallback(
    (values: FormState) =>
      veCollections.find((collection) => collection.assetType === values.veAssetType) ?? null,
    [veCollections],
  );

  const resolveSelectedNft = useCallback(
    (values: FormState) => {
      const collection = resolveCollection(values);
      if (!collection) return null;
      return (
        collection.veNfts.find((veNft) => veNft.tokenId.toString() === values.veNftTokenId) ?? null
      );
    },
    [resolveCollection],
  );

  const validationSchema = useMemo(() => {
    return yup.object({
      listingMode: yup.string().oneOf(["ve_nft", "fraction"]).required(),
      veAssetType: yup
        .string()
        .required("Select a ve asset with available NFTs.")
        .test("wallet-connected", "Connect your wallet to load veNFTs.", () => isConnected)
        .test("asset-has-positions", "Select a ve asset with available NFTs.", function (value) {
          const parent = this.parent as FormState;
          if (parent.listingMode === "fraction") return true;
          if (!value) return false;
          return veCollections.some(
            (collection) => collection.assetType === value && collection.veNfts.length > 0,
          );
        }),
      veNftTokenId: yup
        .string()
        .test("ve-required", "Choose a veNFT from your wallet.", function (value) {
          const parent = this.parent as FormState;
          if (parent.listingMode === "fraction") return true;
          return Boolean(value);
        })
        .test("token-exists", "Choose a veNFT from your wallet.", function (value) {
          const parent = this.parent as FormState;
          if (parent.listingMode === "fraction") return true;
          const selected = resolveSelectedNft(parent);
          if (!value) return false;
          return Boolean(selected && selected.tokenId.toString() === value);
        }),
      fractionTrancheId: yup
        .string()
        .test(
          "fraction-required",
          "Choose a fraction position from your wallet.",
          function (value) {
            const parent = this.parent as FormState;
            if (parent.listingMode === "ve_nft") return true;
            if (!value) return false;
            return ownedFractions.some((position) => position.trancheId.toString() === value);
          },
        ),
      listAmount: yup
        .string()
        .required("List amount must be greater than 0.")
        .test("list-valid", "List amount must be a valid decimal value.", (value) => {
          if (!value) return false;
          return isValidDecimalInput(value.trim(), 18);
        })
        .test("list-positive", "List amount must be greater than 0.", (value) => {
          if (!value) return false;
          return Number.parseFloat(value.trim()) > 0;
        })
        .test(
          "list-under-capacity",
          "List amount cannot exceed available fraction capacity.",
          function (value) {
            const parent = this.parent as FormState;
            if (!value) return true;
            try {
              const listRaw = parseUnits(value.trim(), 18);
              if (parent.listingMode === "fraction") {
                const selectedFraction = ownedFractions.find(
                  (position) => position.trancheId.toString() === parent.fractionTrancheId,
                );
                if (!selectedFraction) return true;
                return listRaw <= selectedFraction.balanceRaw;
              }
              const selected = resolveSelectedNft(parent);
              if (!selected) return true;
              return listRaw <= selected.availableFractionCapacityRaw;
            } catch {
              return false;
            }
          },
        ),
      paymentToken: yup.string().required("Select a supported payment token."),
      unitPrice: yup
        .string()
        .required("Unit price must be greater than 0.")
        .test("unit-price-valid", "Unit price must be a valid decimal value.", (value) => {
          if (!value) return false;
          const normalized = value.trim();
          if (!isValidDecimalInput(normalized, MAX_PRICE_DECIMALS)) return false;
          const parsed = Number.parseFloat(normalized);
          return Number.isFinite(parsed) && parsed > 0;
        }),
      expiryMode: yup.string().oneOf(["timed", "none"]).required(),
      expiryDays: yup.string().test("expiry-valid", "Expiry must be at least 1 day.", function (v) {
        const parent = this.parent as FormState;
        if (parent.expiryMode === "none") return true;
        if (!v) return false;
        const parsed = Number.parseInt(v, 10);
        return Number.isFinite(parsed) && parsed >= 1;
      }),
    });
  }, [isConnected, ownedFractions, resolveSelectedNft, veCollections]);

  const formik = useFormik<FormState>({
    initialValues: INITIAL_FORM,
    validationSchema,
    onSubmit: () => undefined,
  });

  const selectedCollection = useMemo(
    () => resolveCollection(formik.values),
    [formik.values, resolveCollection],
  );
  const selectedNft = useMemo(
    () => resolveSelectedNft(formik.values),
    [formik.values, resolveSelectedNft],
  );

  const selectedPaymentToken = useMemo(
    () =>
      paymentTokenOptions.find(
        (token) => token.address.toLowerCase() === formik.values.paymentToken.toLowerCase(),
      ) ?? null,
    [formik.values.paymentToken, paymentTokenOptions],
  );

  const selectedFractionPosition = useMemo(
    () =>
      ownedFractions.find(
        (position) => position.trancheId.toString() === formik.values.fractionTrancheId,
      ) ?? null,
    [formik.values.fractionTrancheId, ownedFractions],
  );

  const requirements = useListingRequirements({
    sellerAddress: userAddress,
    veNftCollectionAddress:
      formik.values.listingMode === "ve_nft" ? selectedCollection?.contractAddress : undefined,
    listingWorkflowContracts,
    chainId: expectedChainId,
    includeVeFlow: formik.values.listingMode === "ve_nft",
  });

  const maxListAmount = useMemo(() => {
    if (formik.values.listingMode === "fraction") {
      if (!selectedFractionPosition) return 0;
      return Number.parseFloat(formatUnits(selectedFractionPosition.balanceRaw, 18));
    }
    if (!selectedNft) return 0;
    return Number.parseFloat(formatUnits(selectedNft.availableFractionCapacityRaw, 18));
  }, [formik.values.listingMode, selectedFractionPosition, selectedNft]);

  const listAmountValue = Number.parseFloat(asTrimmedString(formik.values.listAmount) || "0");
  const sliderValue = Number.isFinite(listAmountValue)
    ? Math.min(Math.max(listAmountValue, 0), Number.isFinite(maxListAmount) ? maxListAmount : 0)
    : 0;

  const selectedPreviewPosition = useMemo(() => {
    if (formik.values.listingMode === "fraction") {
      if (!selectedFractionPosition) return null;
      return {
        availableFractionCapacityRaw: selectedFractionPosition.balanceRaw,
      };
    }
    return selectedNft;
  }, [formik.values.listingMode, selectedFractionPosition, selectedNft]);

  const listingPreview = useListingPreview({
    selectedNft: selectedPreviewPosition as UserVeNft | null,
    listAmount: formik.values.listAmount,
    unitPrice: formik.values.unitPrice,
    expiryDays: formik.values.expiryMode === "none" ? "0" : formik.values.expiryDays,
    paymentTokenSymbol: selectedPaymentToken?.symbol ?? null,
    protocolFeeBps,
  });

  const commonListingInputs = useMemo(() => {
    const unitPriceInput = asTrimmedString(formik.values.unitPrice);
    const listAmount = asTrimmedString(formik.values.listAmount);
    const unitPriceValue = Number.parseFloat(unitPriceInput || "0");
    const expiryDays = Number.parseInt(formik.values.expiryDays, 10);

    const hasValidCommonInputs =
      Number.isFinite(unitPriceValue) &&
      unitPriceValue > 0 &&
      listAmount.length > 0 &&
      isValidDecimalInput(listAmount, 18) &&
      Boolean(selectedPaymentToken) &&
      isValidDecimalInput(unitPriceInput, selectedPaymentToken?.decimals ?? 18) &&
      (formik.values.expiryMode === "none" || (Number.isFinite(expiryDays) && expiryDays >= 1));

    return {
      listAmount,
      unitPriceInput,
      expiryDays,
      hasValidCommonInputs,
    };
  }, [
    formik.values.expiryDays,
    formik.values.expiryMode,
    formik.values.listAmount,
    formik.values.unitPrice,
    selectedPaymentToken,
  ]);

  const preparedVeListingInput = useMemo(() => {
    if (
      formik.values.listingMode !== "ve_nft" ||
      !selectedCollection ||
      !selectedNft ||
      !selectedPaymentToken ||
      !canCreateListing ||
      !isConnected ||
      !isCorrectNetwork ||
      !commonListingInputs.hasValidCommonInputs
    ) {
      return null;
    }

    try {
      const listRaw = parseUnits(commonListingInputs.listAmount, 18);
      if (listRaw <= 0n || listRaw > selectedNft.availableFractionCapacityRaw) {
        return null;
      }
      parseUnits(commonListingInputs.unitPriceInput, selectedPaymentToken.decimals);
    } catch {
      return null;
    }

    return {
      veAssetType: formik.values.veAssetType,
      veNftAddress: selectedCollection.contractAddress,
      veNftTokenId: selectedNft.tokenId,
      listAmount: commonListingInputs.listAmount,
      paymentToken: selectedPaymentToken.address,
      paymentTokenDecimals: selectedPaymentToken.decimals,
      unitPrice: commonListingInputs.unitPriceInput,
      expiryMode: formik.values.expiryMode,
      expiryDays: formik.values.expiryMode === "none" ? 0 : commonListingInputs.expiryDays,
      requiresVeNftApproval: !requirements.veNftTransferApproved,
      requiresListingOperatorApproval: !requirements.marketplaceOperatorApproved,
      requiresFractionTransferApproval: !requirements.fractionTransferApproved,
    } satisfies CreateVeTradeListingInput;
  }, [
    canCreateListing,
    commonListingInputs.expiryDays,
    commonListingInputs.hasValidCommonInputs,
    commonListingInputs.listAmount,
    commonListingInputs.unitPriceInput,
    formik.values.expiryMode,
    formik.values.listingMode,
    formik.values.veAssetType,
    isConnected,
    isCorrectNetwork,
    requirements.fractionTransferApproved,
    requirements.marketplaceOperatorApproved,
    requirements.veNftTransferApproved,
    selectedCollection,
    selectedNft,
    selectedPaymentToken,
  ]);

  const preparedFractionListingInput = useMemo(() => {
    if (
      formik.values.listingMode !== "fraction" ||
      !selectedFractionPosition ||
      !selectedPaymentToken ||
      !canCreateListing ||
      !isConnected ||
      !isCorrectNetwork ||
      !commonListingInputs.hasValidCommonInputs
    ) {
      return null;
    }

    try {
      const listRaw = parseUnits(commonListingInputs.listAmount, 18);
      if (listRaw <= 0n || listRaw > selectedFractionPosition.balanceRaw) {
        return null;
      }
      parseUnits(commonListingInputs.unitPriceInput, selectedPaymentToken.decimals);
    } catch {
      return null;
    }

    return {
      trancheId: selectedFractionPosition.trancheId,
      listAmount: commonListingInputs.listAmount,
      paymentToken: selectedPaymentToken.address,
      paymentTokenDecimals: selectedPaymentToken.decimals,
      unitPrice: commonListingInputs.unitPriceInput,
      expiryMode: formik.values.expiryMode,
      expiryDays: formik.values.expiryMode === "none" ? 0 : commonListingInputs.expiryDays,
      requiresFractionTransferApproval: !requirements.fractionTransferApproved,
    } satisfies CreateFractionTradeListingInput;
  }, [
    canCreateListing,
    commonListingInputs.expiryDays,
    commonListingInputs.hasValidCommonInputs,
    commonListingInputs.listAmount,
    commonListingInputs.unitPriceInput,
    formik.values.expiryMode,
    formik.values.listingMode,
    isConnected,
    isCorrectNetwork,
    requirements.fractionTransferApproved,
    selectedFractionPosition,
    selectedPaymentToken,
  ]);

  const listingAutoMatchCandidate = useMemo(() => {
    if (preparedFractionListingInput) {
      return buildListingAutoMatchCandidate({
        markets,
        tokenId: preparedFractionListingInput.trancheId,
        paymentToken: preparedFractionListingInput.paymentToken,
        askPriceRaw: parseUnits(
          preparedFractionListingInput.unitPrice,
          preparedFractionListingInput.paymentTokenDecimals,
        ),
        listAmountRaw: parseUnits(preparedFractionListingInput.listAmount, 18),
        userAddress,
      });
    }
    if (preparedVeListingInput) {
      return buildListingAutoMatchCandidate({
        markets,
        tokenId: preparedVeListingInput.veNftTokenId,
        paymentToken: preparedVeListingInput.paymentToken,
        askPriceRaw: parseUnits(
          preparedVeListingInput.unitPrice,
          preparedVeListingInput.paymentTokenDecimals,
        ),
        listAmountRaw: parseUnits(preparedVeListingInput.listAmount, 18),
        userAddress,
      });
    }
    return null;
  }, [markets, preparedFractionListingInput, preparedVeListingInput, userAddress]);

  const listingSteps = useMemo<TxStep[]>(() => {
    try {
      const buildMatchStep = (
        candidate: ReturnType<typeof buildListingAutoMatchCandidate>,
        createdOrderExtractor: (
          receipt?: Parameters<typeof extractCreatedListingId>[0],
        ) => bigint | null,
      ): TxStep | null => {
        if (!candidate || !marketplace?.address || !marketplace.abi) return null;

        return makeContractWriteStep({
          key: "match-best-bid",
          label: `Match ${candidate.marketLabel}`,
          contractName: "Marketplace",
          variables: ({ prev }: { prev: TxStepResult[] }) => {
            const previousReceipt = prev[prev.length - 1]?.receipt;
            const createdOrderId = createdOrderExtractor(previousReceipt);
            if (!createdOrderId) {
              throw new Error("Unable to resolve created listing ID for auto-match.");
            }

            return {
              functionName: "matchOrders",
              args: [createdOrderId, candidate.opposingOrderId, candidate.fillAmountRaw] as const,
            };
          },
        }) as unknown as TxStep;
      };

      if (preparedFractionListingInput) {
        const baseSteps = createFractionListingSteps(preparedFractionListingInput);
        const matchStep = buildMatchStep(listingAutoMatchCandidate, extractCreatedListingId);
        if (!matchStep) {
          return baseSteps;
        }

        return [...baseSteps, matchStep];
      }
      if (preparedVeListingInput) {
        const baseSteps = createVeListingSteps(preparedVeListingInput);
        const matchStep = buildMatchStep(listingAutoMatchCandidate, extractCreatedListingId);
        if (!matchStep) {
          return baseSteps;
        }

        return [...baseSteps, matchStep];
      }
      return [];
    } catch {
      return [];
    }
  }, [
    createFractionListingSteps,
    createVeListingSteps,
    preparedFractionListingInput,
    preparedVeListingInput,
    listingAutoMatchCandidate,
    marketplace,
  ]);

  const canSubmit =
    Boolean(preparedVeListingInput || preparedFractionListingInput) &&
    listingSteps.length > 0 &&
    !(formik.values.listingMode === "ve_nft"
      ? isLoading || isFetching
      : fractionsLoading || fractionsFetching) &&
    !isBroadcasting &&
    !requirements.isChecking;

  const listingStepsWithPreflight: TxStep[] = [
    {
      type: "custom",
      key: "listing-preflight",
      label: "Publish listing",
      run: async () => {
        setSuccessHash(null);
        setIsBroadcasting(true);
        formik.setStatus(undefined);

        const errors = await formik.validateForm();
        if (Object.keys(errors).length > 0) {
          resetFormState();
          const message = String(Object.values(errors)[0]);
          formik.setStatus(message);
          await formik.setTouched(touchAll(formik.values));
          throw new Error(message);
        }

        return "skip";
      },
    },
    ...listingSteps,
  ];

  const primaryActionLabel = useMemo(() => {
    if (preparedVeListingInput) {
      if (preparedVeListingInput.requiresVeNftApproval) return "Approve veNFT";
      if (preparedVeListingInput.requiresListingOperatorApproval) return "Approve listing operator";
      if (preparedVeListingInput.requiresFractionTransferApproval)
        return "Approve fraction transfers";
      return listingAutoMatchCandidate ? "Publish & match" : "Publish listing";
    }
    if (preparedFractionListingInput) {
      if (preparedFractionListingInput.requiresFractionTransferApproval) {
        return "Approve fraction transfers";
      }
      return listingAutoMatchCandidate ? "Publish & match" : "Publish listing";
    }
    return "Publish listing";
  }, [listingAutoMatchCandidate, preparedFractionListingInput, preparedVeListingInput]);

  const selectedExpiryPreset = useMemo(() => {
    if (formik.values.expiryMode === "none") return null;
    const current = Number.parseInt(formik.values.expiryDays, 10);
    return EXPIRY_PRESETS.find((preset) => preset === current) ?? null;
  }, [formik.values.expiryDays, formik.values.expiryMode]);

  const successHref =
    successHash && blockExplorerUrl ? `${blockExplorerUrl}/tx/${successHash}` : null;

  const readinessItems = useMemo(
    () => [
      {
        key: "wallet",
        label: "Wallet connected",
        detail: "A connected wallet is required to sign approvals and listing transactions.",
        ready: isConnected,
      },
      {
        key: "network",
        label: "Correct network",
        detail: `Connect to chain ${expectedChainId} to use deployed Fractals contracts.`,
        ready: isCorrectNetwork,
      },
      ...(formik.values.listingMode === "ve_nft"
        ? [
            {
              key: "venft",
              label: "veNFT transfer approval",
              detail: "Required for wrapper-driven fractionalization.",
              ready: requirements.veNftTransferApproved,
            },
            {
              key: "operator",
              label: "Listing operator approval",
              detail: "Allows wrapper to create listing on your behalf.",
              ready: requirements.marketplaceOperatorApproved,
            },
          ]
        : []),
      {
        key: "fractions",
        label: "Fraction transfer approval",
        detail: "Allows marketplace settlement transfers from your AssetLedger balance.",
        ready: requirements.fractionTransferApproved,
      },
    ],
    [
      expectedChainId,
      isConnected,
      isCorrectNetwork,
      formik.values.listingMode,
      requirements.fractionTransferApproved,
      requirements.marketplaceOperatorApproved,
      requirements.veNftTransferApproved,
    ],
  );

  const pendingReadinessItems = useMemo(
    () => readinessItems.filter((item) => !item.ready),
    [readinessItems],
  );

  const transactionPlanItems = useMemo(() => {
    const hasPreparedInput = Boolean(preparedVeListingInput || preparedFractionListingInput);
    if (!hasPreparedInput) return [];

    return [
      ...(formik.values.listingMode === "ve_nft"
        ? [
            {
              key: "ve-approval",
              label: "veNFT transfer approval",
              detail: "A one-time approval transaction may be requested.",
              ready: requirements.veNftTransferApproved,
            },
            {
              key: "operator-approval",
              label: "Wrapper listing operator",
              detail: "A one-time operator approval may be requested.",
              ready: requirements.marketplaceOperatorApproved,
            },
          ]
        : []),
      {
        key: "fraction-approval",
        label: "AssetLedger transfer approval",
        detail: "A one-time ERC1155 approval may be requested.",
        ready: requirements.fractionTransferApproved,
      },
      ...(listingAutoMatchCandidate
        ? [
            {
              key: "auto-match",
              label: `Auto-match ${listingAutoMatchCandidate.marketLabel}`,
              detail: `The listing will be matched against order #${listingAutoMatchCandidate.opposingOrderId.toString()} if the on-chain create transaction succeeds.`,
              ready: false,
            },
          ]
        : []),
    ].filter((item) => !item.ready);
  }, [
    formik.values.listingMode,
    listingAutoMatchCandidate,
    preparedFractionListingInput,
    preparedVeListingInput,
    requirements.fractionTransferApproved,
    requirements.marketplaceOperatorApproved,
    requirements.veNftTransferApproved,
  ]);

  useEffect(() => {
    if (formik.values.listingMode !== "ve_nft") return;
    if (veCollections.length === 0) return;
    if (!veCollections.some((collection) => collection.assetType === formik.values.veAssetType)) {
      void formik.setFieldValue("veAssetType", veCollections[0].assetType);
    }
  }, [
    formik,
    formik.setFieldValue,
    formik.values.listingMode,
    formik.values.veAssetType,
    veCollections,
  ]);

  useEffect(() => {
    if (formik.values.listingMode !== "ve_nft") return;
    if (!selectedCollection || selectedCollection.veNfts.length === 0) {
      if (formik.values.veNftTokenId) {
        void formik.setFieldValue("veNftTokenId", "");
      }
      return;
    }

    const hasCurrentToken = selectedCollection.veNfts.some(
      (veNft) => veNft.tokenId.toString() === formik.values.veNftTokenId,
    );

    if (!hasCurrentToken) {
      void formik.setFieldValue("veNftTokenId", selectedCollection.veNfts[0].tokenId.toString());
    }
  }, [
    formik,
    formik.setFieldValue,
    formik.values.listingMode,
    formik.values.veNftTokenId,
    selectedCollection,
  ]);

  useEffect(() => {
    if (formik.values.listingMode !== "fraction") return;
    if (ownedFractions.length === 0) {
      if (formik.values.fractionTrancheId) {
        void formik.setFieldValue("fractionTrancheId", "");
      }
      return;
    }

    const exists = ownedFractions.some(
      (position) => position.trancheId.toString() === formik.values.fractionTrancheId,
    );
    if (!exists) {
      void formik.setFieldValue("fractionTrancheId", ownedFractions[0].trancheId.toString());
    }
  }, [
    formik,
    formik.setFieldValue,
    formik.values.fractionTrancheId,
    formik.values.listingMode,
    ownedFractions,
  ]);

  useEffect(() => {
    if (paymentTokenOptions.length === 0) {
      if (formik.values.paymentToken) {
        void formik.setFieldValue("paymentToken", "");
      }
      return;
    }

    const exists = paymentTokenOptions.some(
      (token) => token.address.toLowerCase() === formik.values.paymentToken.toLowerCase(),
    );

    if (!exists) {
      void formik.setFieldValue("paymentToken", paymentTokenOptions[0].address);
    }
  }, [formik, formik.setFieldValue, formik.values.paymentToken, paymentTokenOptions]);

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
    if (step === 1) {
      if (formik.values.listingMode === "fraction") {
        return ["listingMode", "fractionTrancheId"];
      }
      return ["listingMode", "veAssetType", "veNftTokenId"];
    }
    if (step === 2) return ["listAmount", "unitPrice", "paymentToken", "expiryMode", "expiryDays"];
    if (step === 3) return [];
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

    if (stepIndex === 3) {
      if (!isConnected) {
        setStepValidationErrors(["Connect your wallet before publishing."]);
        return;
      }
      if (!isCorrectNetwork) {
        setStepValidationErrors(["Switch to the configured Fractals network before publishing."]);
        return;
      }
      if (!canCreateListing || !listingWorkflowContracts) {
        setStepValidationErrors(["Listing contracts are unavailable for this network."]);
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
        <Button size="sm">List Asset</Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create listing</DialogTitle>
          <DialogDescription>
            {formik.values.listingMode == "ve_nft" ? "Fractionalize a veNFT and p" : "P"}ublish a
            non-custodial listing backed by your fractals position.
          </DialogDescription>
        </DialogHeader>

        {successHash ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <div className="flex items-center justify-between gap-3">
              <p>Listing transaction submitted successfully.</p>
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
            { id: 1, title: "Asset" },
            { id: 2, title: "Configure" },
            { id: 3, title: "Readiness" },
            { id: 4, title: "Review" },
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
                  Listing source
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      formik.values.listingMode === "ve_nft"
                        ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                        : "border-white/15 bg-white/[0.02]"
                    }`}
                    onClick={() => void formik.setFieldValue("listingMode", "ve_nft")}
                  >
                    Fractionalize veNFT + list
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${
                      formik.values.listingMode === "fraction"
                        ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                        : "border-white/15 bg-white/[0.02]"
                    }`}
                    onClick={() => void formik.setFieldValue("listingMode", "fraction")}
                  >
                    List existing fractions
                  </button>
                </div>
              </div>

              {formik.values.listingMode === "ve_nft" ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      Select ve asset
                    </p>
                    {isLoading ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                      </div>
                    ) : null}

                    {!isLoading && isConnected && veCollections.length > 0 ? (
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {veCollections.map((collection) => (
                          <button
                            key={`${collection.assetType}-${collection.contractAddress}`}
                            type="button"
                            disabled={isBroadcasting}
                            onClick={() =>
                              void formik.setFieldValue("veAssetType", collection.assetType)
                            }
                            className={`rounded-xl border px-3 py-2 text-left transition ${
                              formik.values.veAssetType === collection.assetType
                                ? "border-[#b58f5f]/50 bg-[#b58f5f]/15"
                                : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                            }`}
                          >
                            <p className="text-sm font-semibold text-[var(--foreground)]">
                              {collection.symbol}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              {collection.balanceFormatted}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                      Choose veNFT
                    </p>
                    <select
                      name="veNftTokenId"
                      value={formik.values.veNftTokenId}
                      onChange={formik.handleChange}
                      disabled={
                        !selectedCollection ||
                        selectedCollection.veNfts.length === 0 ||
                        isBroadcasting
                      }
                      className="h-10 w-full rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
                    >
                      <option value="">Select veNFT</option>
                      {(selectedCollection?.veNfts ?? []).map((veNft) => (
                        <option key={veNft.tokenId.toString()} value={veNft.tokenId.toString()}>
                          #{veNft.tokenId.toString()} • Lock {veNft.lockAmountFormatted}
                        </option>
                      ))}
                    </select>

                    {selectedNft ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <p className="font-semibold text-[var(--foreground)]">
                          {selectedNft.symbol} #{selectedNft.tokenId.toString()}
                        </p>
                        <div className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-3">
                          <p>Lock value: {selectedNft.lockAmountFormatted}</p>
                          <p>Lock end: {selectedNft.lockEndLabel}</p>
                          <p>Fraction capacity: {selectedNft.availableFractionCapacityFormatted}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {!isLoading && isConnected && veCollections.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                      No veNFTs available to list.
                    </div>
                  ) : null}

                  {error ? (
                    <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-200">
                      <p>Could not load veNFT data.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={refreshVeNfts}
                        disabled={isBroadcasting}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Owned fraction positions
                  </p>
                  {fractionsLoading ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Skeleton className="h-14 w-full rounded-xl" />
                      <Skeleton className="h-14 w-full rounded-xl" />
                    </div>
                  ) : null}
                  <select
                    name="fractionTrancheId"
                    value={formik.values.fractionTrancheId}
                    onChange={formik.handleChange}
                    disabled={ownedFractions.length === 0 || isBroadcasting}
                    className="h-10 w-full rounded-xl border border-white/15 bg-white/[0.02] px-3 text-sm text-white outline-none ring-offset-[#0c1117] focus-visible:ring-2 focus-visible:ring-[#b58f5f]"
                  >
                    <option value="">Select fraction tranche</option>
                    {ownedFractions.map((position) => (
                      <option
                        key={position.trancheId.toString()}
                        value={position.trancheId.toString()}
                      >
                        {position.symbol} • Tranche #{position.trancheId.toString()} • Balance{" "}
                        {position.balanceFormatted}
                      </option>
                    ))}
                  </select>
                  {selectedFractionPosition ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <p className="font-semibold text-[var(--foreground)]">
                        {selectedFractionPosition.symbol} • Tranche #
                        {selectedFractionPosition.trancheId.toString()}
                      </p>
                      <div className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                        <p>Base: {selectedFractionPosition.base}</p>
                        <p>Wallet balance: {selectedFractionPosition.balanceFormatted}</p>
                      </div>
                    </div>
                  ) : null}
                  {!fractionsLoading && ownedFractions.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                      No fraction balances found in your wallet.
                    </div>
                  ) : null}
                  {fractionsError ? (
                    <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm text-red-200">
                      <p>Could not load fraction balances.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={refreshFractions}
                        disabled={isBroadcasting}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {!isConnected ? (
                <div className="rounded-xl border border-dashed border-white/20 bg-white/[0.02] p-3 text-sm text-[var(--muted)]">
                  Connect your wallet to view available positions.
                </div>
              ) : null}
            </div>
          ) : null}

          {stepIndex === 2 ? (
            <div className="space-y-4 rounded-xl bg-white/[0.02] p-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  List amount
                </p>
                <Input
                  name="listAmount"
                  type="number"
                  min={0}
                  max={Number.isFinite(maxListAmount) ? maxListAmount : undefined}
                  step={0.000001}
                  value={formik.values.listAmount}
                  onChange={formik.handleChange}
                  disabled={
                    (formik.values.listingMode === "ve_nft" && !selectedNft) ||
                    (formik.values.listingMode === "fraction" && !selectedFractionPosition) ||
                    isBroadcasting
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={Number.isFinite(maxListAmount) && maxListAmount > 0 ? maxListAmount : 1}
                  step={0.000001}
                  value={sliderValue}
                  disabled={
                    (formik.values.listingMode === "ve_nft" && !selectedNft) ||
                    (formik.values.listingMode === "fraction" && !selectedFractionPosition) ||
                    maxListAmount <= 0 ||
                    isBroadcasting
                  }
                  onChange={(event) =>
                    void formik.setFieldValue(
                      "listAmount",
                      normalizeInputAmount(Number.parseFloat(event.target.value)),
                    )
                  }
                  className="w-full accent-[#b58f5f]"
                />
                <p className="text-xs text-[var(--muted)]">
                  Max:{" "}
                  {formik.values.listingMode === "fraction"
                    ? (selectedFractionPosition?.balanceFormatted ?? "0")
                    : (selectedNft?.availableFractionCapacityFormatted ?? "0")}{" "}
                  fractions
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Unit price
                  </p>
                  <Input
                    name="unitPrice"
                    type="number"
                    min={0}
                    step={0.000001}
                    value={formik.values.unitPrice}
                    onChange={formik.handleChange}
                    disabled={isBroadcasting}
                  />
                  <p className="text-xs text-[var(--muted)]">
                    Price per fraction in selected payment token.
                  </p>
                </label>

                <label className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    Payment token
                  </p>
                  <select
                    name="paymentToken"
                    value={formik.values.paymentToken}
                    onChange={formik.handleChange}
                    disabled={
                      isLoadingPaymentTokens || paymentTokenOptions.length === 0 || isBroadcasting
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

              <div className="rounded-xl border border-[var(--line)] bg-white/[0.03] p-3 text-xs text-[var(--muted)]">
                Total value preview: {listingPreview.totalValueLabel}
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  Listing expiry
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
                    Timed listing
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
                          variant={selectedExpiryPreset === preset ? "default" : "secondary"}
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
                    This will pass <code>expiry = 0</code> to the marketplace, so the listing
                    remains active until filled or cancelled.
                  </p>
                )}
              </div>

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
                      disabled={isBroadcasting}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {stepIndex === 3 ? (
            <div className="space-y-4">
              <ListingReadinessPanel
                title="Listing prerequisites"
                isChecking={requirements.isChecking}
                error={requirements.error?.message ?? null}
                onRefresh={requirements.refresh}
                items={pendingReadinessItems}
                allDone={pendingReadinessItems.length === 0}
                emptyLabel="All listing prerequisites are satisfied."
              />

              <div className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3 text-xs text-[var(--muted)]">
                <p className="mb-1 flex items-center gap-1 font-semibold text-[var(--foreground)]">
                  <Info className="h-3.5 w-3.5" />
                  Marketplace behavior
                </p>
                <p>
                  Listings are non-custodial. Your fractions stay in your wallet and are transferred
                  only when a trade executes. Keep sufficient balance and approvals active for
                  successful fills.
                </p>
              </div>
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div className="space-y-4">
              <ListingReviewCard
                pairLabel={
                  formik.values.listingMode === "fraction"
                    ? `${selectedFractionPosition?.symbol ?? "Fraction"} • Tranche #${selectedFractionPosition?.trancheId.toString() ?? "?"}`
                    : `${selectedCollection?.symbol ?? formik.values.veAssetType} #${selectedNft?.tokenId.toString() ?? "?"}`
                }
                listedAmountLabel={listingPreview.listedFractionsLabel}
                listedPercentage={listingPreview.listedPercentage}
                remainingAmountLabel={listingPreview.remainingFractionsLabel}
                unitPriceLabel={`${formatTokenAmount(listingPreview.unitPriceValue)} ${selectedPaymentToken?.symbol ?? ""}`}
                totalValueLabel={listingPreview.totalValueLabel}
                feeLabel={listingPreview.feeAmountLabel}
                proceedsLabel={listingPreview.sellerProceedsLabel}
                expiryLabel={
                  formik.values.expiryMode === "none" ? "No expiry" : listingPreview.expiryLabel
                }
              />

              {transactionPlanItems.length > 0 ? (
                <ListingReadinessPanel
                  title="Transaction plan"
                  isChecking={requirements.isChecking}
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

          {!preparedVeListingInput && !preparedFractionListingInput && stepIndex === 4 ? (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="flex items-center gap-1">
                <CircleAlert className="h-4 w-4" />
                Listing input is incomplete or invalid. Review previous steps before publishing.
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
                steps={listingStepsWithPreflight}
                disabled={!canSubmit}
                onComplete={(results) => {
                  const txHash = [...results].reverse().find((result) => result.hash)?.hash;
                  if (txHash) {
                    if (preparedVeListingInput) {
                      onCreated?.(mapCreatedListingAsset(preparedVeListingInput, txHash));
                    } else if (preparedFractionListingInput) {
                      onCreated?.(
                        mapCreatedFractionListingAsset(preparedFractionListingInput, txHash),
                      );
                    }
                    setSuccessHash(txHash);
                  }
                  resetFormState();
                  refreshVeNfts();
                  refreshFractions();
                  requirements.refresh();
                  onListingCompleted?.();
                  setIsBroadcasting(false);
                }}
                onError={(message) => {
                  resetFormState();
                  formik.setStatus(message || "Failed to publish listing.");
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
