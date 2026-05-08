# Spectrum Nodes RPC Architecture

Fractals uses Spectrum Nodes as the primary RPC provider for the Mezo testnet demo. The dApp is a Next.js + wagmi application, so all wallet reads, contract reads, block watches, and transaction broadcasts share the same wagmi transport.

## Configuration

Set the app to Mezo testnet and provide the Spectrum Nodes dashboard endpoint:

```bash
NEXT_PUBLIC_APP_ENV=testnet
NEXT_PUBLIC_SPECTRUM_MEZO_TESTNET_RPC_HTTP=https://<spectrum-endpoint>/<api-key>/mezo/testnet/
```

`NEXT_PUBLIC_SPECTRUM_MEZO_TESTNET_RPC_HTTP` is read in `lib/config/chains.ts` and becomes the first HTTP RPC URL for chain `31611`. `lib/config/wagmi.ts` then passes that URL into the explicit wagmi `http(...)` transport used by RainbowKit, wagmi hooks, server rendering, and transaction execution.

If the Spectrum URL is missing, local development falls back to the legacy Mezo public RPC so developers can still boot the app. The deployed testnet demo should always set the Spectrum URL.

## RPC Usage In The App

Spectrum RPC powers these core dApp paths:

- Real-time position queries in `components/features/earn/use-earn-data.ts`, including AssetLedger fraction counts, fraction metadata, user ERC1155 balances, claimable rewards, and ERC20 allowances.
- Yield and settlement tracking in the Earn dashboard via `claimableRewards`, `rewardReserve`, `settledUnderlying`, `targetEpochEnd`, and rollover state reads.
- Marketplace on-chain data reads in `components/features/trade/hooks/use-markets.ts`, including block timestamps, active listings, bids, supported payment tokens, tranche metadata, and user balances.
- Transaction broadcasting through `lib/tx-flow/TransactionFlowButton.tsx`, which uses the same wagmi config for ERC20 approvals, veNFT approvals, AssetLedger deposits, reward claims, redemptions, listings, bids, buys, matches, and cancellations.

## Spectrum Docs

Spectrum documents RPC endpoint creation through the dashboard and blockchain API usage here:

- https://spectrumnodes.gitbook.io/docs/user-guides/create-your-first-endpoint
- https://spectrumnodes.gitbook.io/docs/developer-guides/apis
- https://spectrumnodes.gitbook.io/docs/developer-guides/apis/general-blockchain-api

The General Blockchain API docs describe supported query patterns such as `getBlockHeights`, `getBlockByNumber`, `getTransactionByHash`, and `getAddressBalance`. Fractals uses the EVM JSON-RPC endpoint directly through wagmi because its app flows require contract ABI reads and transaction submission on Mezo testnet.
