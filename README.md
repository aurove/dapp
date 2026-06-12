# Fractals dApp

The Fractals dApp is the user-facing web app for creating, managing, and trading simple fungible Earn products from Mezo veNFT positions. It is built with Next.js, React, wagmi, RainbowKit, Tailwind CSS, and the local shared UI source in `components/ui/`.

## Overview

The app has three primary surfaces:

- **Marketing site:** explains how Fractals simplifies Mezo Earn.
- **Earn app:** create simple fungible Earn products from ERC20 deposits or existing veNFTs, inspect positions, claim rewards, and redeem during settlement windows.
- **Trade app:** browse fraction markets, create listings, place bids, buy listings, match orders, and cancel user orders.

![Earn View](../demo/earn-page.png)
_Earn View_

![Trade View](../demo/trade-page.png)
_Trade View_

![Market Order View](../demo/market-order.png)
_Market Order View_

## Routes

- `/` - landing page and product overview.
- `/app` - Earn dashboard for creating and managing Fractals positions.
- `/app/trade` - secondary market for ERC1155 fraction tranches.

## Project Structure

- `app/` - Next.js app router pages and layouts.
- `components/marketing/` - landing page sections.
- `components/app/` - authenticated app shell and navigation.
- `components/features/earn/` - Earn product data hooks and transaction flows.
- `components/features/trade/` - marketplace views, dialogs, hooks, and order helpers.
- `contracts/` - generated contract registry and typing used by transaction flows.
- `lib/tx-flow/` - reusable multi-step transaction execution utilities.
- `lib/providers/` - wagmi, RainbowKit, and query providers.
- `components/ui/` - local shared UI source used throughout the app via the `@ui` path alias.

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

Supported variables:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - required for wallet connections.
- `NEXT_PUBLIC_TXFLOW_NETWORK` - optional network selector for transaction flow config. Common values are `testnet` and `mainnet`.
- `NEXT_PUBLIC_APP_ENV` - local app environment selector used by the existing configuration.
- `SPECTRUM_MEZO_TESTNET_RPC_HTTP` - server-only Spectrum Nodes Mezo testnet RPC endpoint used by the internal RPC proxy.
- `SPECTRUM_RPC_SESSION_SECRET` - server secret for short-lived RPC session tokens (rotated every 10 minutes on the client).
- `SPECTRUM_RPC_RPS_LIMIT` - server-side RPC proxy throttle in requests per second per client IP bucket (defaults to `10`).

## Spectrum Nodes RPC

For the Mezo testnet demo, set `NEXT_PUBLIC_APP_ENV=testnet` and configure `SPECTRUM_MEZO_TESTNET_RPC_HTTP` with the HTTPS endpoint created in the Spectrum Nodes dashboard. The browser uses `/api/rpc/mezo-testnet` as the wagmi RPC URL, and the server proxies requests to Spectrum after validating a short-lived session cookie issued by `/api/rpc/session`.

See [docs/spectrum-rpc.md](docs/spectrum-rpc.md) for the architecture notes and hackathon submission details.

## Development

From the repository root:

```bash
pnpm dev
```

Or from this package:

```bash
pnpm --filter @fractals/dapp dev
```

Open [http://localhost:3000](http://localhost:3000).

## Trade MUSD Markets

`/app/trade` defaults to MUSD quote markets:

- `fveBTC-W1 / MUSD`
- `fveBTC-W4 / MUSD`
- `fveMEZO-W52 / MUSD`
- `fveMEZO-W208 / MUSD`

The UI reads live listings and bids from `Marketplace`, uses `PaymentRouter.MUSD` as the default quote token, and enables buy/sell actions through the existing marketplace and payment approval flows.

## Build

```bash
pnpm --filter @fractals/dapp build
```

## Lint

```bash
pnpm --filter @fractals/dapp lint
```
