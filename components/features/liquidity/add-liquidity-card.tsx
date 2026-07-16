"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@ui";
import { getContractConfig } from "@/contracts/shared";
import { useChainId } from "wagmi";

type LiquidityPoolKey = "BTC" | "MEZO";

type LiquidityPoolOption = {
  key: LiquidityPoolKey;
  label: string;
  contractName: "avBTCmId20" | "avMEZOmId20";
  available: boolean;
};

function poolButtonTone(selected: boolean) {
  return selected
    ? "border-[var(--accent)]/60 bg-[linear-gradient(180deg,rgba(196,160,106,0.16),rgba(196,160,106,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "border-transparent bg-transparent text-white/68 hover:border-white/10 hover:bg-white/[0.03]";
}

function TokenMarkStack({ symbol }: { symbol: LiquidityPoolKey }) {
  const tokenImage = symbol === "BTC" ? "/tokens/BTC.png" : "/tokens/MEZO.png";

  return (
    <div className="relative h-12 w-12 shrink-0 sm:h-14 sm:w-14">
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--accent)]/35 bg-[rgba(196,160,106,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-14 sm:w-14">
        <Image
          src={tokenImage}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-[#0c1117] shadow-[0_8px_18px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7">
        <Image src="/tokens/Aurove.png" alt="" width={28} height={28} className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
      </div>
    </div>
  );
}

export function AddLiquidityCard() {
  const chainId = useChainId();
  const [selectedPool, setSelectedPool] = useState<LiquidityPoolKey>("BTC");

  const poolOptions = useMemo<LiquidityPoolOption[]>(
    () => [
      {
        key: "BTC",
        label: "BTC pool",
        contractName: "avBTCmId20",
        available: Boolean(getContractConfig(chainId, "avBTCmId20")?.address),
      },
      {
        key: "MEZO",
        label: "MEZO pool",
        contractName: "avMEZOmId20",
        available: Boolean(getContractConfig(chainId, "avMEZOmId20")?.address),
      },
    ],
    [chainId],
  );

  const availablePools = poolOptions.filter((pool) => pool.available);
  useEffect(() => {
    if (availablePools.length === 0) return;
    if (!availablePools.some((pool) => pool.key === selectedPool)) {
      setSelectedPool(availablePools[0].key);
    }
  }, [availablePools, selectedPool]);

  return (
    <Card className="relative overflow-hidden border border-white/12 bg-[linear-gradient(160deg,rgba(19,24,33,0.98),rgba(10,13,18,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(196,160,106,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(96,128,194,0.12),transparent_32%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(234,209,165,0.36),transparent)]"
      />

      <CardHeader className="relative space-y-4 border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/35 bg-[linear-gradient(160deg,rgba(196,160,106,0.16),rgba(196,160,106,0.05))] text-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl sm:text-[1.35rem]">Add Liquidity</CardTitle>
            </div>
          </div>

          <button
            type="button"
            title="Choose the pool you want to add liquidity to."
            aria-label="Choose the pool you want to add liquidity to."
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.03] text-white/55 transition hover:border-[var(--accent)]/40 hover:bg-white/[0.06] hover:text-white"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <CardDescription>Select one pool to continue.</CardDescription>
      </CardHeader>

      <CardContent className="relative space-y-5 p-5 sm:p-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <label className="font-medium text-white">Pool</label>
            <span className="text-white/45">
              {availablePools.length === 0
                ? "No pools available"
                : `${availablePools.length} available`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.025] p-1.5">
            {poolOptions.map((pool) => {
              const selected = selectedPool === pool.key;

              return (
                <button
                  key={pool.key}
                  type="button"
                  onClick={() => setSelectedPool(pool.key)}
                  aria-pressed={selected}
                  disabled={!pool.available}
                  className={cn(
                    "flex min-h-16 items-center justify-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition sm:min-h-18 sm:justify-start",
                    poolButtonTone(selected),
                    !pool.available && "cursor-not-allowed opacity-40 hover:border-white/10 hover:bg-transparent",
                  )}
                >
                  <TokenMarkStack symbol={pool.key} />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-base font-semibold text-white">{pool.key}</p>
                    <p className="text-xs text-white/45">
                      {pool.contractName === "avBTCmId20" ? "Locked BTC pool" : "Locked MEZO pool"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
