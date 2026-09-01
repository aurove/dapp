"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Wallet } from "lucide-react";
import { useChainId } from "wagmi";
import { Button, Card, CardContent, Skeleton, cn } from "@ui";
import { FeatureStatusPanel } from "@/components/features/shared/page-shell";
import { getEarnProtocolConfig } from "@/contracts/earn";
import { EarnPositionCard } from "./earn-position-card";
import { EarnRewards } from "./earn-rewards";
import { useAprBasis, useEarnSnapshot } from "./use-earn-data";

function ProductSkeleton() {
  return (
    <div className="flex w-full min-w-0 max-w-full gap-4 overflow-hidden py-1 pr-1">
      {[0, 1].map((item) => (
        <div key={item} className="w-[min(100%,22rem)] flex-none sm:w-96 lg:w-[28rem]">
          <Card className="rounded-xl">
            <CardContent className="space-y-4 p-6">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-40" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

function EmptyPositions() {
  const scrollToAssets = () =>
    document
      .getElementById("available-assets")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Card className="border-dashed border-white/15 bg-white/[0.025]">
      <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/5">
          <Wallet className="h-6 w-6 text-white/55" />
        </span>
        <h3 className="mt-4 text-lg font-semibold text-white">No liquid positions</h3>
        <p className="mt-1 max-w-sm text-sm text-white/55">
          Deposit BTC, MEZO, or an existing Mezo Earn position to start earning with a liquid Aurove
          asset.
        </p>
        <Button className="mt-5" onClick={scrollToAssets}>
          Create position
        </Button>
      </CardContent>
    </Card>
  );
}

export function EarnPositions() {
  const { products, userPositions, positionsLoading, positionsFetching, error, refresh } =
    useEarnSnapshot();
  const chainId = useChainId();
  const ledgerAbi = getEarnProtocolConfig(chainId).ledger?.abi;
  const aprQuery = useAprBasis({
    enabled: true,
    products,
    chainId,
    ledgerAbi,
  });
  const aprBasisMap = useMemo(() => aprQuery.data ?? {}, [aprQuery.data]);
  const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    refresh();
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
  };

  const positionCountLabel = `${userPositions.length} position${userPositions.length === 1 ? "" : "s"}`;

  return (
    <section className="space-y-4" aria-labelledby="earn-positions-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="earn-positions-title" className="text-2xl font-semibold text-white">
            Your liquid positions
          </h2>
          <p className="mt-1 text-sm text-white/55">{positionCountLabel}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={positionsFetching}>
          <RefreshCw className={cn("h-4 w-4", positionsFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {successMessage ? (
        <FeatureStatusPanel tone="success" title="Transaction complete" message={successMessage} />
      ) : null}
      {errorMessage ? (
        <FeatureStatusPanel tone="error" title="Transaction failed" message={errorMessage} />
      ) : null}
      {error ? (
        <FeatureStatusPanel tone="error" title="Read error" message={error.message} />
      ) : null}

      <EarnRewards />

      {positionsLoading ? (
        <ProductSkeleton />
      ) : userPositions.length === 0 ? (
        <EmptyPositions />
      ) : (
        <div
          className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-1 pr-1"
          aria-label="Liquid position cards"
        >
          {userPositions.map((position) => (
            <div
              key={position.id}
              className="w-[min(100%,22rem)] flex-none snap-start sm:w-96 lg:w-[28rem]"
            >
              <EarnPositionCard
                product={position}
                aprBasisMap={aprBasisMap}
                withdrawAmount={withdrawAmounts[position.id] ?? ""}
                setWithdrawAmount={(value) =>
                  setWithdrawAmounts((prev) => ({ ...prev, [position.id]: value }))
                }
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
