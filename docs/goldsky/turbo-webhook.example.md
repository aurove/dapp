# Goldsky Turbo Webhook Example

Goldsky Turbo webhook sinks send JSON over HTTP POST. Point the sink at the dApp endpoint and configure a Goldsky `httpauth` secret whose header/value pair matches the dApp auth settings.

Use a Turbo pipeline that exposes raw log rows, then attach a webhook sink that posts to `https://<your-dapp-host>/api/internal/events`.

If you want the dApp to validate a custom header, set:

```bash
EVENTS_WEBHOOK_AUTH_HEADER=Authorization
```

Suggested raw log mapping:

- `chainId`: the numeric chain ID
- `contractAddress`: emitting contract address
- `blockNumber`: the block number
- `blockHash`: the block hash
- `blockTimestamp`: the block timestamp
- `txHash`: the transaction hash
- `logIndex`: the log index
- `transactionIndex`: the transaction index when available
- `topics`: the raw log topics
- `data`: the raw log data
- `removed`: `true` for reorged logs
- `provider`: optional provider/source label

Example raw payload:

```json
{
  "chainId": 31337,
  "contractAddress": "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
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
  "provider": "goldsky-turbo"
}
```
