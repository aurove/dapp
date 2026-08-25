import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatePositionPage } from "@/components/features/earn";
import {
  earnAssetDefinition,
  earnStakePath,
  resolveCreatePositionMode,
  resolveEarnAssetKey,
  type EarnAssetKey,
} from "@/components/features/earn/earn-asset";
import { createPageMetadata } from "@/lib/seo/site";

const ASSET_META = {
  BTC: {
    title: "Create an avBTCm position",
    description:
      "Deposit BTC or an existing veBTC position and receive liquid avBTCm that keeps earning.",
  },
  MEZO: {
    title: "Create an avMEZOm position",
    description:
      "Deposit MEZO or an existing veMEZO position and receive liquid avMEZOm that keeps earning.",
  },
} as const satisfies Record<EarnAssetKey, { title: string; description: string }>;

type AssetPageParams = { asset: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<AssetPageParams>;
}): Promise<Metadata> {
  const { asset } = await params;
  const assetKey = resolveEarnAssetKey(asset);

  if (!assetKey) {
    return createPageMetadata({
      title: "Earning asset not found",
      description: "The requested Aurove earning asset could not be found.",
      path: "/earn",
      noIndex: true,
    });
  }

  const meta = ASSET_META[assetKey];
  return createPageMetadata({
    title: meta.title,
    description: meta.description,
    path: earnStakePath(assetKey),
    keywords: [
      "Aurove Earn",
      earnAssetDefinition(assetKey).productSymbol,
      assetKey,
      "Mezo Earn",
      "liquid ve-yield",
    ],
  });
}

export default async function EarnStakePage({
  params,
  searchParams,
}: {
  params: Promise<AssetPageParams>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { asset } = await params;
  const { mode } = await searchParams;
  const assetKey = resolveEarnAssetKey(asset);
  if (!assetKey) notFound();
  return <CreatePositionPage assetKey={assetKey} createMode={resolveCreatePositionMode(mode)} />;
}
