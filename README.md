# Aurove dApp

The Aurove dApp is the user-facing web app for creating, managing, and trading simple fungible Earn products from Mezo veNFT positions. It is built with Next.js, React, wagmi, RainbowKit, Tailwind CSS, and the local shared UI source in `components/ui/`.

The app now also includes a production-grade wallet authentication flow backed by Supabase and a Drizzle-owned app database schema. Wallet connection is only the first step; the user must sign a server-issued challenge before the app creates a secure session.

## Overview

The app has three primary surfaces:

- **Marketing site:** explains how Aurove simplifies Mezo Earn.
- **Earn app:** create simple fungible Earn products from ERC20 deposits or existing veNFTs, inspect positions, view APY estimates, claim rewards, and redeem during settlement windows.
- **Trade app:** browse fraction markets, create listings, place bids, buy listings, match orders, and cancel user orders.
- **Wallet auth:** sign a nonce, create a Supabase-backed user record, and establish an HTTP-only app session.

![Earn View](../demo/earn-page.png)
_Earn View_

![Trade View](../demo/trade-page.png)
_Trade View_

![Market Order View](../demo/market-order.png)
_Market Order View_

## Routes

- `/` - landing page and product overview.
- `/earn` - Earn dashboard for creating and managing Aurove positions.
- `/trade` - secondary market for ERC1155 fraction tranches.

## Project Structure

- `app/` - Next.js app router pages and layouts.
- `components/marketing/` - landing page sections.
- `components/app/` - authenticated app shell and navigation.
- `components/features/earn/` - Earn product data hooks and transaction flows.
- `components/features/trade/` - marketplace views, dialogs, hooks, and order helpers.
- `contracts/` - generated contract registry and typing used by transaction flows.
- `lib/tx-flow/` - reusable multi-step transaction execution utilities.
- `lib/providers/` - wagmi, RainbowKit, and query providers.
- `lib/auth/` - wallet authentication state, message helpers, and API wrappers.
- `lib/db/` - typed Drizzle schema and Postgres client for app-owned tables.
- `lib/supabase/` - Supabase browser/server/admin client helpers and shared types.
- `components/ui/` - local shared UI source used throughout the app via the `@ui` path alias.
- `supabase/` - local Supabase CLI config and migrations.

## Environment

Create a local environment file:

```bash
cp .env.example .env.local
```

Supported variables:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` - required for WalletConnect-based mobile wallet flows, including Bitget Wallet mobile. Create one at https://cloud.walletconnect.com and configure it in Vercel Project Settings -> Environment Variables for deployment.
- `NEXT_PUBLIC_MEZO_TESTNET_RPC_HTTP` - direct Mezo testnet RPC endpoint used by the dApp. Defaults to `https://rpc.test.mezo.org`.
- `NEXT_PUBLIC_MEZO_MAINNET_RPC_HTTP` - direct Mezo mainnet RPC endpoint used by the dApp. Defaults to `https://rpc.mezo.org`.
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL. For local dev, use the URL printed by `supabase start` or `supabase status --output env`, then keep it in `.env.local`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - client-safe Supabase publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` - server-only Supabase service role key used for privileged writes.
- `DATABASE_URL` - direct Postgres connection string used by Drizzle ORM and Drizzle Kit. For local Supabase, this usually looks like `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- `NEXT_PUBLIC_TXFLOW_NETWORK` - optional network selector for transaction flow config. Common values are `testnet` and `mainnet`.
- `NEXT_PUBLIC_APP_ENV` - local app environment selector used by the existing configuration.
- `CRON_INTERNAL_SECRET` - server-only shared secret used to authenticate internal cron requests with an HMAC signature.
- `EVENTS_WEBHOOK_SECRET` - server-only shared secret used to authenticate internal event webhooks.
- `EVENTS_WEBHOOK_AUTH_HEADER` - optional custom secret header name for event webhooks. Defaults to `x-aurove-webhook-secret`.

## Internal Cron

The app exposes `POST /api/internal/cron` for private scheduler traffic only. The request body is ignored for routing purposes; the endpoint verifies an HMAC signature built from:

- the request timestamp header
- the HTTP method
- the pathname
- the raw request body

Required headers:

- `x-aurove-cron-timestamp`
- `x-aurove-cron-signature`

Set `CRON_INTERNAL_SECRET` to a long random secret in your server environment. The signature format is `v1=<hex-hmac-sha256>`.

The endpoint checks every registered handler on each invocation, runs only the handlers that are due, and skips the rest. Each handler keeps its own interval in code, so an external scheduler can safely call the endpoint every second without knowing individual handler timings.

Example Cloudflare Worker caller:

```ts
export default {
  async fetch(request: Request, env: Env) {
    const body = "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const pathname = "/api/internal/cron";
    const payload = `${timestamp}.POST.${pathname}.${body}`;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.CRON_INTERNAL_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const signatureHex = [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return fetch(`${env.APP_BASE_URL}${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "x-aurove-cron-timestamp": timestamp,
        "x-aurove-cron-signature": `v1=${signatureHex}`,
      },
      body,
    });
  },
};
```

If you need strict one-second invocation timing from Cloudflare itself, run that `fetch()` from a Durable Object alarm or another scheduler that can wake up once per second. The app-side cron logic still decides which registered handlers are due.

## Internal Events

The app exposes `POST /api/internal/events` for authenticated webhook traffic from Goldsky, a custom indexer, or any other sender that can include a shared secret.

The endpoint accepts raw contract log envelopes with:

- `chainId`
- `contractAddress`
- `blockNumber`
- `blockHash`
- `blockTimestamp`
- `txHash`
- `logIndex`
- `transactionIndex`
- `topics`
- `data`
- `removed`
- `provider`

Authentication supports either:

- `Authorization: Bearer <secret>`
- A configurable secret header, such as `x-aurove-webhook-secret`
- `EVENTS_WEBHOOK_MAX_BODY_BYTES` limits request payload size and defaults to 2 MiB

The event router resolves contracts from the generated registry in `contracts/registry.ts`, decodes the raw log with the contract ABI, and dispatches the decoded event to the handler registry in `lib/events/handlers.ts`.

See [docs/internal-events.md](docs/internal-events.md) for the payload contract, Goldsky examples, and local development notes.

For the fork-backed local Hardhat relay flow, run:

```bash
pnpm events:relay:hardhat
```

The relay reads local deployment ABIs, decodes matching logs, and forwards known contract events into the internal events endpoint.
It emits only the raw log envelope and leaves ABI resolution, decoding, and handler dispatch to the backend.

## Wallet Authentication

The wallet login flow is documented in [docs/wallet-auth-architecture.md](docs/wallet-auth-architecture.md). The short version:

1. The wallet connects with RainbowKit/wagmi.
2. The app requests a signed nonce from the server.
3. The wallet signs the message.
4. The server verifies the signature, upserts the user in Supabase, and issues an HTTP-only session cookie.
5. The frontend rehydrates the authenticated user from the session endpoint and keeps it in context.

This keeps the browser free of service-role credentials while still allowing secure session revocation and renewal.

## Supabase Local Development

The workspace root owns the local Supabase runtime and CLI commands. See [../docs/supabase.md](../docs/supabase.md) for `pnpm supabase:start`, `pnpm supabase:reset`, `pnpm supabase:stop`, and `pnpm supabase:status`.

Drizzle ORM now owns the app tables, indexes, constraints, and foreign keys in `lib/db/schema.ts`, while Supabase-specific SQL stays in `supabase/migrations/`. The checked-in Supabase type file only covers the Supabase client surface now; it no longer claims ownership of the app tables.

For local development, the dapp Supabase values are populated into `dapp/.env.local` by `pnpm supabase:status` from the workspace root, and the app reads that file directly through Next.js env loading. `DATABASE_URL` can be set in the same file for Drizzle and Drizzle Kit.

## Development

From the repository root:

```bash
pnpm dev
```

Or from this package:

```bash
pnpm --filter @aurove/dapp dev
```

Open [http://localhost:3000](http://localhost:3000).

## Trade MUSD Markets

`/trade` defaults to MUSD quote markets:

- `fveBTC-W1 / MUSD`
- `fveBTC-W4 / MUSD`
- `fveMEZO-W52 / MUSD`
- `fveMEZO-W208 / MUSD`

The UI reads live listings and bids from `Marketplace`, uses `PaymentRouter.MUSD` as the default quote token, and enables buy/sell actions through the existing marketplace and payment approval flows.

## Build

```bash
pnpm --filter @aurove/dapp build
```

## Lint

```bash
pnpm --filter @aurove/dapp lint
```

## Database

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```
