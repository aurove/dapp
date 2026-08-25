"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Badge } from "@ui";
import { FeatureHeroSection } from "@/components/features/shared/page-shell";
import { CreatePositionCard } from "./create-position-card";
import {
  earnAssetDefinition,
  earnVariantFromAsset,
  type CreatePositionMode,
  type EarnAssetKey,
} from "./earn-asset";

export function CreatePositionPage({
  assetKey,
  createMode,
}: {
  assetKey: EarnAssetKey;
  createMode: CreatePositionMode;
}) {
  const asset = earnAssetDefinition(assetKey);
  const variant = earnVariantFromAsset(assetKey);

  return (
    <div className="space-y-6">
      <Link
        href="/earn#available-assets"
        className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to earning assets
      </Link>
      <FeatureHeroSection>
        <div className="space-y-4">
          <Badge className="w-fit border-amber-300/25 bg-amber-300/10 text-amber-100">
            <LockKeyhole className="mr-1 h-3.5 w-3.5" /> CREATE LIQUID POSITION
          </Badge>
          <div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Create an {asset.productSymbol} position
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-white/68">
              {asset.description} You receive liquid {asset.productSymbol} that keeps earning from
              the underlying Mezo Earn position.
            </p>
          </div>
        </div>
      </FeatureHeroSection>
      <div className="mx-auto max-w-4xl">
        <CreatePositionCard variant={variant} createMode={createMode} />
      </div>
    </div>
  );
}
