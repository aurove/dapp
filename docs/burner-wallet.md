# Burner Wallet (Scaffold-ETH-2 style)

In-browser wallet via [`burner-connector`](https://github.com/scaffold-eth/burner-connector). Private key lives in `localStorage` under `burnerWallet.pk`. Signing happens in-page — no MetaMask popup.

## Connect (local)

1. Run a local chain + dapp with `NEXT_PUBLIC_APP_ENV=local` (active chain id **31337**).
2. Open the app → **Connect Wallet**.
3. Under **Development**, choose **Burner Wallet**.
4. Fund the address from Hardhat account #0 / monorepo local seed scripts so you can send txs.

Default visibility is **local networks only** (`31337`). MetaMask and WalletConnect remain available.

## Config

| Env | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_BURNER_WALLET_MODE` | `localNetworksOnly` | `localNetworksOnly` \| `allNetworks` \| `disabled` |
| `NEXT_PUBLIC_ONLY_LOCAL_BURNER_WALLET` | `true` | Legacy toggle: `true` → local only, `false` → all networks |
| `NEXT_PUBLIC_BURNER_WALLET_ALLOW_MAINNET` | `false` | Required to show burner when chain is Mezo Mainnet |
| `NEXT_PUBLIC_BURNER_PRIVATE_KEY` | unset | Optional fixed key (writes to `localStorage` on load) |
| `NEXT_PUBLIC_E2E_BURNER_PK` | unset | Alias for the deterministic key (E2E) |

Restart `pnpm dev` after changing env vars.

### Examples

```bash
# Default: burner only on Hardhat
NEXT_PUBLIC_APP_ENV=local pnpm dev

# Show burner on Mezo Testnet too (still not mainnet)
NEXT_PUBLIC_BURNER_WALLET_MODE=allNetworks
NEXT_PUBLIC_APP_ENV=testnet

# Disable burner entirely
NEXT_PUBLIC_BURNER_WALLET_MODE=disabled

# Deterministic Hardhat #0 for E2E
NEXT_PUBLIC_BURNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# address → 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

**Never** set a funded mainnet private key in `NEXT_PUBLIC_*` variables.

## E2E note

Playwright can connect via RainbowKit **Burner Wallet** instead of MetaMask to avoid extension popups. Prefer the deterministic key above so the address matches Hardhat account #0. Full Synpress MetaMask flows remain supported for extension-specific tests.
