# Fractals dApp

The Fractals dApp is the user-facing web app for creating, managing, and trading fractionalized Mezo veNFT positions. It is built with Next.js, React, wagmi, RainbowKit, Tailwind CSS, and the local `@fractals/ui` component package.

## Overview

The app has three primary surfaces:

- **Marketing site:** explains the structured liquidity layer for locked veBTC and veMEZO positions.
- **Earn app:** create liquid lock claims from ERC20 deposits or existing veNFTs, inspect positions, claim rewards, and redeem during settlement windows.
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
- `lib/ui/` - local shared UI package exported as `@fractals/ui`.

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

Supported variables:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - required for wallet connections.
- `NEXT_PUBLIC_TXFLOW_NETWORK` - optional network selector for transaction flow config. Common values are `testnet` and `mainnet`.
- `NEXT_PUBLIC_APP_ENV` - local app environment selector used by the existing configuration.

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

`/app/trade` defaults to MUSD quote markets. After the canonical marketplace seed task runs, it shows:

- `fveBTC-W1 / MUSD`
- `fveBTC-W4 / MUSD`
- `fveMEZO-W52 / MUSD`
- `fveMEZO-W208 / MUSD`

To seed live ask and bid depth, run `NETWORK=<network> pnpm deploy:seed:musd` from the repo root or use the marketplace `marketplace:seed-orders --canonical-musd-markets` task documented in `packages/marketplace/README.md`.

The UI reads live listings and bids from `Marketplace`, uses `PaymentRouter.MUSD` as the default quote token, and enables buy/sell actions through the existing marketplace and payment approval flows.

## Local Contract Flow

For a seeded local app state, run the root deployment helper in one terminal:

```bash
pnpm deploy:localhost
```

Then run the app in another terminal:

```bash
pnpm dev
```

The deployment scripts sync generated contract data into `contracts/registry.ts`, which is consumed by the dApp transaction helpers.

## Build

```bash
pnpm --filter @fractals/dapp build
```

## Lint

```bash
pnpm --filter @fractals/dapp lint
```
