# Internal Events Webhooks

The dApp exposes `POST /api/internal/events` for trusted webhook senders that can deliver raw contract log envelopes.

This endpoint is provider-neutral. Goldsky, a custom indexer, a local relay, or any other service can POST the same raw log shape as long as it can authenticate with a shared secret.

## Authentication

Requests must send one of:

- `Authorization: Bearer <secret>`
- A configurable shared-secret header, such as `x-aurove-webhook-secret`

The dApp reads the shared secret from `EVENTS_WEBHOOK_SECRET` and compares it with constant-time secret checks.

Recommended environment variables:

- `EVENTS_WEBHOOK_SECRET` - server-only shared secret for webhook auth.
- `EVENTS_WEBHOOK_AUTH_HEADER` - optional custom secret header name. Defaults to `x-aurove-webhook-secret`.
- `EVENTS_WEBHOOK_MAX_BODY_BYTES` - optional request size limit. Defaults to `2097152` bytes.
- `CRON_INTERNAL_SECRET` - existing cron secret, kept separate for cron HMAC auth.

For Goldsky Turbo webhook sinks, create a Goldsky `httpauth` secret with the header/value pair you want the sink to send. Set `EVENTS_WEBHOOK_AUTH_HEADER` to that header name if you want the dApp to validate a custom header, or leave it unset and use the default `Authorization: Bearer <secret>` flow.

## Raw Payload

The internal contract accepts one raw log envelope per object:

```ts
type RawContractEventInput = {
  chainId: number
  contractAddress: string
  blockNumber: number
  blockHash: string
  blockTimestamp: number
  txHash: string
  logIndex: number
  transactionIndex?: number | null
  topics: string[]
  data: string
  removed?: boolean
  provider?: string
}
```

The endpoint also accepts batched payloads such as `RawContractEventInput[]` or wrapper objects with `events`, `logs`, `data`, `payload`, `records`, `items`, or `entries` arrays.

## Contract Resolution

The backend resolves contracts with the generated registry in `contracts/registry.ts`.

Lookup is always `chainId + contractAddress`, and decoding uses the ABI from the resolved registry entry. Unknown chain IDs or addresses are rejected safely.

## Handler Registry

Event routing is code-defined in `lib/events/handlers.ts`.

Handlers are registered against the decoded contract event, using the contract name plus event name convention:

- `Marketplace.OrdersMatched`
- `Marketplace.ListingCreated`
- `PaymentRouter.PaymentRouted`

The `Marketplace.OrdersMatched` handler records a price observation from matched trades only, using the settlement payment token and the gross trade value from the event payload. This gives the backend a canonical execution-price history without relying on listing-side quotes or bid/ask midpoints.

The backend does not trust relay-supplied handler names or decoded payloads. It decodes logs locally, then dispatches the result to the matching handler.
Static handlers are auto-registered from the generated contract registry, and runtime contracts can register their own handlers with the same helper.

## Goldsky Turbo Webhooks

Goldsky Turbo pipelines support webhook delivery for normalized raw log streams. The official workflow is:

1. Create a Turbo pipeline.
2. Add a webhook sink that posts to `/api/internal/events`.
3. Configure a Goldsky `httpauth` secret for the header and value your dApp should validate.

Suggested payload mapping:

- `chainId`: the numeric chain ID
- `contractAddress`: the emitting contract address
- `blockNumber`: the log block number
- `blockHash`: the block hash
- `blockTimestamp`: the block timestamp
- `txHash`: the transaction hash
- `logIndex`: the log index
- `transactionIndex`: the transaction index when available
- `topics`: the raw log topics
- `data`: the raw log data
- `removed`: `true` for reorged logs
- `provider`: optional provider/source label

## Goldsky Turbo Webhook Sinks

Goldsky webhook sinks send JSON over HTTP POST with at-least-once delivery. The dApp endpoint is retry-safe as long as your handler logic is retry-safe.

See the official Goldsky docs for current webhook sink behavior:

- [Mirror vs. Turbo pipelines](https://docs.goldsky.com/mirror-vs-turbo)
- [Turbo webhook sink](https://docs.goldsky.com/turbo-pipelines/sinks/webhook)

### Turbo trade example

Use a Turbo pipeline that exposes raw log rows for a trade-related contract, normalize those rows into the raw contract log envelope, and then send them to the dApp.

See `docs/goldsky/turbo-trade-webhook.example.yaml`.

### Turbo example

Use a dataset or EVM source that already includes raw log fields, normalize it with a transform, then send the result through a webhook sink.

See `docs/goldsky/turbo-mezo-webhook.example.yaml`.

## Example Request

```bash
curl -X POST http://localhost:3000/api/internal/events \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <secret>' \
  --data '{
    "chainId": 31337,
    "contractAddress": "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
    "blockNumber": 12345,
    "blockHash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "blockTimestamp": 1718700000,
    "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "logIndex": 0,
    "transactionIndex": 1,
    "topics": [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x0000000000000000000000002222222222222222222222222222222222222222"
    ],
    "data": "0x",
    "provider": "hardhat-local-relay"
  }'
```

## Local Development

- Run the dApp locally with the existing Next.js dev server.
- Start the local contract stack with `pnpm deploy:local` or `pnpm --filter @aurove/core node` plus `pnpm --filter @aurove/core deploy:localhost`. This flow uses the forked Mezo snapshot configured by `FORK_RPC_URL` and `FORK_BLOCK_NUMBER`, and it reuses the veBTC and veMEZO contracts already deployed there.
- Point any local relay or webhook sender at `http://localhost:3000/api/internal/events`.
- Use the same raw log envelope whether the sender is Goldsky, a custom indexer, or a local Hardhat watcher.
- For public Mezo data, use the Goldsky Turbo examples above and swap the source / contract addresses for the network you want to index.

### Hardhat Relay

For local development without Goldsky, run the tiny relay script from the repo root:

```bash
pnpm events:relay:hardhat
```

The relay:

- watches a local Hardhat JSON-RPC endpoint
- auto-discovers non-veNFT deployment addresses from `packages/core/deployments/localhost` and `packages/marketplace/deployments/localhost`
- forwards raw contract log envelopes only
- posts them to `/api/internal/events` using the same shared-secret auth model

The root `pnpm deploy:localhost` flow starts this relay automatically after deployment when `EVENTS_WEBHOOK_SECRET` is present in `dapp/.env.local`. That deployment path assumes the forked Mezo contracts are already available in the configured snapshot; it does not stand up separate localhost mock veNFTs.

Useful environment variables:

- `EVENTS_WEBHOOK_SECRET` - required shared secret.
- `EVENTS_WEBHOOK_URL` - defaults to `http://localhost:3000/api/internal/events`.
- `EVENTS_WEBHOOK_AUTH_HEADER` - optional custom header name; when unset, the relay uses `Authorization: Bearer <secret>`.
- `EVENTS_WEBHOOK_MAX_BODY_BYTES` - optional request size limit for the API.
- `EVENTS_RELAY_RPC_URL` - defaults to `http://127.0.0.1:8545`.
- `EVENTS_RELAY_MAX_BLOCK_DISTANCE` - maximum number of blocks to scan per `eth_getLogs` call.
- `EVENTS_RELAY_START_BLOCK` - defaults to `0` for local replay.
- `EVENTS_RELAY_POLL_INTERVAL_MS` - polling interval in milliseconds.
- `EVENTS_RELAY_STATE_FILE` - optional checkpoint path; defaults to `.tmp/internal-events-relay-state.json` at the repo root.

Example raw payload emitted by the relay:

```json
{
  "chainId": 31337,
  "contractAddress": "0x0000000000000000000000000000000000000000",
  "blockNumber": 12345,
  "blockHash": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "blockTimestamp": 1718700000,
  "txHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "logIndex": 0,
  "transactionIndex": 1,
  "topics": [
    "0x1111111111111111111111111111111111111111111111111111111111111111"
  ],
  "data": "0x",
  "provider": "hardhat-local-relay"
}
```

The endpoint intentionally does not add database-backed ingestion tracking. Handlers should be retry-safe and implement any idempotency they require using the `chainId:txHash:logIndex` fingerprint.

For marketplace execution prices, the handler already enforces that idempotency key when inserting into `marketplace_price_observations`, so duplicate `OrdersMatched` deliveries will not create duplicate price rows.
