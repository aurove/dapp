const txExplorersByChainId: Record<number, string | null> = {
  31611: process.env.NEXT_PUBLIC_MEZO_TESTNET_EXPLORER ?? "https://explorer.test.mezo.org",
  31612: process.env.NEXT_PUBLIC_MEZO_MAINNET_EXPLORER ?? "https://explorer.mezo.org",
  31337: null,
};

export function getExplorerTxUrl(chainId: number | undefined, hash: string) {
  if (!chainId) {
    return null;
  }

  const explorerBaseUrl = txExplorersByChainId[chainId];
  if (!explorerBaseUrl) {
    return null;
  }

  return `${explorerBaseUrl}/tx/${hash}`;
}

export function shortHash(hash?: string, left = 6, right = 4) {
  if (!hash) {
    return "";
  }
  return `${hash.slice(0, left)}…${hash.slice(-right)}`;
}
