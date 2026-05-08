# Spectrum Nodes RPC Architecture

Fractals uses Spectrum Nodes as the primary RPC provider for the Mezo testnet demo. The dApp is a Next.js + wagmi application, so all wallet reads, contract reads, and transaction broadcasts share the same wagmi transport.

## Configuration

Set the app to Mezo testnet and provide server-side Spectrum settings:

```bash
NEXT_PUBLIC_APP_ENV=testnet
SPECTRUM_MEZO_TESTNET_RPC_HTTP=https://<spectrum-endpoint>/<api-key>/mezo/testnet/
SPECTRUM_RPC_SESSION_SECRET=<at-least-32-char-secret>
SPECTRUM_RPC_RPS_LIMIT=10
```

`lib/config/chains.ts` points Mezo testnet RPC to `/api/rpc/mezo-testnet` by default. On app load, `lib/providers/web3-providers.tsx` calls `/api/rpc/session`, which issues an HTTP-only session cookie signed by `SPECTRUM_RPC_SESSION_SECRET` and expiring after 10 minutes. The RPC proxy route validates that session before forwarding JSON-RPC payloads to `SPECTRUM_MEZO_TESTNET_RPC_HTTP`.

The proxy also enforces server-side throttling based on `SPECTRUM_RPC_RPS_LIMIT` (token-bucket per client IP). Requests above the configured rate return HTTP `429` with a `retry-after` header.

This keeps Spectrum credentials private on the server while still allowing client-side wagmi reads and writes.

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
