import type { ReactNode } from "react";
import {
  ArchitectureDiagram,
  Diagram,
  LiquidityFlowDiagram,
  RewardFlowDiagram,
  VaultLifecycleDiagram,
  VeToId20FlowDiagram,
} from "@/components/docs/diagram";
import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { DocsCard, DocsCardGrid } from "@/components/docs/docs-card";
import { DocsTabs } from "@/components/docs/docs-tabs";
import {
  explorerAddressUrl,
  MEZO_TESTNET_CHAIN_ID,
  TESTNET_CONTRACTS,
} from "@/lib/docs/contracts-reference";
import { getDocSectionTitle } from "@/lib/docs/navigation";
import type { DocFrontmatter, DocSearchDocument } from "@/lib/docs/types";
import { AUROVE_FAQ_ITEMS } from "@/lib/seo/json-ld";
import { EarnFlowsContent } from "@/content/docs/earn-flows-page";
import { SwapFlowsContent } from "@/content/docs/swap-flows-page";

export type DocPageDefinition = DocFrontmatter & {
  Content: () => ReactNode;
};

function StatusTable() {
  return (
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Meaning</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Live on Testnet</strong>
          </td>
          <td>
            Shipped in the dapp and deployed on Mezo Testnet (chain id {MEZO_TESTNET_CHAIN_ID}).
          </td>
        </tr>
        <tr>
          <td>
            <strong>In Development</strong>
          </td>
          <td>Partially implemented or environment-gated; not presented as production-complete.</td>
        </tr>
        <tr>
          <td>
            <strong>Planned</strong>
          </td>
          <td>Not available in the current interface or deployments.</td>
        </tr>
      </tbody>
    </table>
  );
}

const pages: DocPageDefinition[] = [
  {
    slug: "introduction/what-is-aurove",
    title: "What is Aurove",
    description:
      "Aurove is the liquid ve-yield layer for Mezo — turn locked veBTC and veMEZO into liquid, composable yield assets.",
    tags: ["introduction", "overview", "vebtc", "vemezo", "mezo"],
    status: "live",
    searchText:
      "Aurove liquid ve-yield Mezo Earn veBTC veMEZO avBTCm avMEZOm managed locked assets tokenized yield fractions liquidity swap incentives academy",
    Content: () => (
      <>
        <h1>What is Aurove</h1>
        <p>
          <strong>Aurove</strong> is the liquid ve-yield layer for <strong>Mezo Earn</strong>. It
          lets users transform locked <strong>veBTC</strong> and <strong>veMEZO</strong> positions
          into liquid, fungible assets that continue to participate in managed yield while remaining
          usable across swap and liquidity flows.
        </p>
        <Callout variant="info" title="Live scope">
          The public dapp currently targets <strong>Mezo Testnet</strong>. Product surfaces in the
          app today: <strong>Earn</strong>, <strong>Swap</strong>, <strong>Liquidity</strong>, and{" "}
          <strong>Academy</strong>.
        </Callout>
        <h2>What you can do</h2>
        <ul>
          <li>
            <strong>Managed locked assets</strong> — deposit BTC/MEZO or existing Mezo Earn veNFTs
            into managed tranches.
          </li>
          <li>
            <strong>Tokenized yield</strong> — hold ERC1155 tranche fractions and ERC20 ID20
            wrappers (e.g. <code>avBTCm</code>, <code>avMEZOm</code>).
          </li>
          <li>
            <strong>Fractions</strong> — liquid share accounting against managed ve inventory.
          </li>
          <li>
            <strong>Liquidity</strong> — supply concentrated liquidity on Aurove CL pools.
          </li>
          <li>
            <strong>Swap</strong> — swap liquid assets and veNFTs through Mezo CL routes powered by
            Aurove.
          </li>
          <li>
            <strong>Incentives</strong> — claim tranche/gauge rewards and earn Academy points.
          </li>
        </ul>
        <h2>Product surfaces</h2>
        <DocsCardGrid>
          <DocsCard
            title="Swap"
            description="Swap supported assets and veNFTs via Aurove concentrated-liquidity routes."
            href="/docs/swap/overview"
            status="live"
          />
          <DocsCard
            title="Earn"
            description="Create liquid positions, claim rewards, redeem in settlement windows."
            href="/docs/earn/flows"
            status="live"
          />
          <DocsCard
            title="Liquidity"
            description="Provide CL liquidity, collect fees, manage position NFTs."
            href="/docs/liquidity/providing-liquidity"
            status="live"
          />
          <DocsCard
            title="Academy"
            description="Points, tasks, leaderboard, and referrals after wallet sign-in."
            href="/docs/academy/points"
            status="live"
          />
        </DocsCardGrid>
        <h2>Status legend</h2>
        <StatusTable />
      </>
    ),
  },
  {
    slug: "introduction/why-aurove",
    title: "Why Aurove",
    description:
      "Keep Mezo Earn working while unlocking liquid, tradable exposure to locked veBTC and veMEZO yield.",
    tags: ["introduction", "why", "liquidity", "yield"],
    status: "live",
    searchText:
      "why aurove liquid yield locked bitcoin mezo composability capital efficiency swap LP without unwinding locks",
    Content: () => (
      <>
        <h1>Why Aurove</h1>
        <p>
          Mezo Earn locks create productive voting-escrow positions — but locks are illiquid by
          design. Aurove keeps those positions earning under managed custody while issuing liquid
          claims you can hold, swap, or LP.
        </p>
        <h2>Problems Aurove addresses</h2>
        <table>
          <thead>
            <tr>
              <th>Need</th>
              <th>Interface solution</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Stay earning on locked BTC / MEZO</td>
              <td>
                <DocRouteLink href="/earn">Earn</DocRouteLink> managed liquid products
              </td>
            </tr>
            <tr>
              <td>Liquidity without self-unwinding locks</td>
              <td>
                <DocRouteLink href="/#swap-interface">Swap</DocRouteLink> liquid assets and
                deposit-then-swap routes
              </td>
            </tr>
            <tr>
              <td>Additional fee income</td>
              <td>
                <DocRouteLink href="/liquidity">Liquidity</DocRouteLink> CL positions
              </td>
            </tr>
            <tr>
              <td>Learn and stay active</td>
              <td>
                <DocRouteLink href="/academy">Academy</DocRouteLink> points, tasks, referrals
              </td>
            </tr>
          </tbody>
        </table>
        <h2>Design principles</h2>
        <ul>
          <li>
            <strong>Backing first</strong> — tranche supply is tied to vault-custodied inventory;
            ID20 enforces <code>totalSupply ≤ backingBalance</code>.
          </li>
          <li>
            <strong>Composable claims</strong> — ERC1155 fractions plus ERC20 ID20 for DEX / LP
            tooling.
          </li>
          <li>
            <strong>Fair rewards</strong> — retroactive credit accounting reduces reward sniping on
            late deposits.
          </li>
          <li>
            <strong>Predictable exits</strong> — redemptions only during the weekly settlement
            window.
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "introduction/architecture-overview",
    title: "Architecture overview",
    description:
      "How Ledger, Vault, ID20, gauges, zap router, and CL pools fit together in Aurove.",
    tags: ["architecture", "protocol", "ledger", "id20", "vault"],
    status: "live",
    searchText:
      "architecture overview ledger vault id20 gauge zap router concentrated liquidity reward sink veNFT manager",
    Content: () => (
      <>
        <h1>Architecture overview</h1>
        <p>
          Aurove is split into a <strong>core</strong> tranche/custody layer and an{" "}
          <strong>ID20</strong> composability layer, with a periphery zap router for deposits,
          swaps, and LP entry.
        </p>
        <ArchitectureDiagram />
        <h2>Core layer</h2>
        <ul>
          <li>
            <strong>Ledger</strong> — ERC1155 tranche accounting; deposits, redemptions, rebase
            claims.
          </li>
          <li>
            <strong>Vault</strong> — custodies veNFT inventory and deploys managers/sinks.
          </li>
          <li>
            <strong>VeNftManager</strong> — owns one empty MANAGED ve position per variant.
          </li>
          <li>
            <strong>RewardSink</strong> — distributes rebases via retroactive credit accounting.
          </li>
        </ul>
        <h2>ID20 layer</h2>
        <ul>
          <li>
            <strong>AuroveId20</strong> — ERC20 wrapper per managed tranche.
          </li>
          <li>
            <strong>Id20Gauge</strong> — continuous reward gauge with activation and credit
            mechanics.
          </li>
          <li>
            <strong>AuroveZapRouter</strong> — multi-source deposit, wrap, swap, and LP helpers.
          </li>
        </ul>
        <h2>Key flows</h2>
        <VeToId20FlowDiagram />
        <VaultLifecycleDiagram />
        <LiquidityFlowDiagram />
        <RewardFlowDiagram />
        <Callout variant="important">
          For contract addresses and function-level detail, see{" "}
          <DocRouteLink href="/docs/developers/contracts">Developer contracts</DocRouteLink>.
        </Callout>
      </>
    ),
  },
  {
    slug: "getting-started/connect-wallet",
    title: "Connect wallet",
    description:
      "Connect a wallet with RainbowKit, switch to Mezo Testnet, and sign in for Academy.",
    tags: ["wallet", "connect", "network", "sign-in", "rainbowkit"],
    status: "live",
    searchText:
      "connect wallet rainbowkit wrong network mezo testnet sign in session academy walletconnect",
    Content: () => (
      <>
        <h1>Connect wallet</h1>
        <p>
          Aurove uses <strong>RainbowKit</strong> + <strong>wagmi</strong>. On-chain actions need a
          connected wallet on the expected chain. Academy personalization additionally needs{" "}
          <strong>Sign In</strong> (SIWE-style session).
        </p>
        <h2>Steps</h2>
        <ol>
          <li>
            Open the app and click <strong>Connect Wallet</strong> (header).
          </li>
          <li>Choose an installed wallet or WalletConnect QR for mobile.</li>
          <li>Approve the connection in your wallet.</li>
          <li>
            Confirm the network badge shows <strong>Network Mezo Testnet</strong> (or the
            deployment’s expected chain). If not, click <strong>Wrong Network</strong> and approve
            the switch.
          </li>
          <li>
            For Academy, click <strong>Sign In</strong> and sign the auth message.
          </li>
        </ol>
        <h2>UI states</h2>
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>What you see</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Disconnected</td>
              <td>
                <strong>Connect Wallet</strong>
              </td>
            </tr>
            <tr>
              <td>Wrong chain</td>
              <td>
                <strong>Wrong Network</strong> + red badge
              </td>
            </tr>
            <tr>
              <td>Connected</td>
              <td>Shortened address</td>
            </tr>
            <tr>
              <td>Connected, not signed in</td>
              <td>
                <strong>Sign In</strong> next to address
              </td>
            </tr>
          </tbody>
        </table>
        <Callout variant="info">
          The public app targets <strong>Mezo Testnet</strong> today. Mezo Mainnet is used when the
          deployment is configured for it. Native gas token on Mezo is <strong>BTC</strong>.
        </Callout>
      </>
    ),
  },
  {
    slug: "getting-started/faucet",
    title: "Faucet & test tokens",
    description:
      "How to obtain Mezo Testnet gas and assets for Earn, Swap, and Liquidity testing via the Mezo faucet.",
    tags: ["faucet", "testnet", "tokens", "btc", "musd", "mezo"],
    status: "live",
    searchText:
      "faucet test tokens mezo testnet gas btc musd mezo tokens balances faucet.test.mezo.org",
    Content: () => (
      <>
        <h1>Faucet & test tokens</h1>
        <Callout variant="info" title="Mezo Testnet faucet">
          Users can get Mezo Testnet tokens at{" "}
          <a href="https://faucet.test.mezo.org/" target="_blank" rel="noreferrer">
            https://faucet.test.mezo.org/
          </a>
          .
        </Callout>
        <Callout variant="important" title="No in-app faucet">
          The Aurove dapp does <strong>not</strong> ship an embedded token faucet. Use the official
          Mezo Testnet faucet above for public testing.
        </Callout>
        <h2>What you need on Mezo Testnet</h2>
        <ul>
          <li>
            <strong>Native BTC</strong> for gas.
          </li>
          <li>
            <strong>BTC</strong> and/or <strong>MEZO</strong> ERC-20 balances to lock on Earn.
          </li>
          <li>
            Optional existing <strong>veBTC / veMEZO</strong> NFTs to deposit.
          </li>
          <li>
            <strong>MUSD</strong> (and liquid Aurove assets) for swap and LP flows.
          </li>
        </ul>
        <h2>Practical steps</h2>
        <ol>
          <li>Connect wallet and switch to Mezo Testnet.</li>
          <li>
            Open the Mezo Testnet faucet at{" "}
            <a href="https://faucet.test.mezo.org/" target="_blank" rel="noreferrer">
              https://faucet.test.mezo.org/
            </a>{" "}
            and request test tokens for your address.
          </li>
          <li>
            Confirm balances in wallet and in-app (Earn amount fields, Swap asset selector,
            Liquidity funding sources).
          </li>
        </ol>
        <Callout variant="coming-soon" title="In development">
          A one-click testnet faucet UX inside Aurove is not present in the current interface.
        </Callout>
      </>
    ),
  },
  {
    slug: "getting-started/first-transaction",
    title: "First transaction",
    description:
      "Start with a swap: exchange liquid assets, or swap an entire veNFT for MUSD / ID20 in one flow.",
    tags: ["onboarding", "transaction", "swap", "venft"],
    status: "live",
    searchText:
      "first transaction swap venft entire veBTC veMEZO review swap approve musd avbtcm zap",
    Content: () => (
      <>
        <h1>First transaction</h1>
        <p>
          The simplest first on-chain action on Aurove is a <strong>swap</strong> on the homepage.
          Write actions use a multi-step <strong>TransactionFlowButton</strong>: connect → approve
          (if needed) → main call. Progress appears on the button and in the notification toaster.
        </p>
        <Callout variant="info" title="Recommended first swaps">
          Start with either a liquid-asset swap (e.g. MUSD → avBTCm) or swapping an entire veNFT
          position for a buy token. Both run through the same Swap card.
        </Callout>
        <DocsTabs
          tabs={[
            {
              id: "liquid",
              label: "Swap assets",
              content: (
                <>
                  <p className="mb-2 font-medium text-white">Swap liquid tokens</p>
                  <ol className="list-decimal space-y-1 pl-5 text-white/70">
                    <li>Connect wallet and switch to Mezo Testnet.</li>
                    <li>
                      Open the homepage Swap card (
                      <DocRouteLink href="/#swap-interface" code>
                        /#swap-interface
                      </DocRouteLink>
                      ).
                    </li>
                    <li>
                      Choose <strong>Sell</strong> and <strong>Buy</strong> assets (for example MUSD
                      → avBTCm).
                    </li>
                    <li>Enter an amount, review the quote, approve if prompted.</li>
                    <li>
                      <strong>Review swap</strong> → confirm → <strong>Swap</strong>.
                    </li>
                  </ol>
                  <p className="mt-3 text-white/70">
                    Full matrix of sell forms:{" "}
                    <DocRouteLink href="/docs/swap/flows">Swap flows guide</DocRouteLink>.
                  </p>
                </>
              ),
            },
            {
              id: "venft",
              label: "Swap veNFT",
              content: (
                <>
                  <p className="mb-2 font-medium text-white">Swap an entire veBTC / veMEZO</p>
                  <ol className="list-decimal space-y-1 pl-5 text-white/70">
                    <li>Hold a veBTC or veMEZO NFT in the connected wallet.</li>
                    <li>
                      Open Swap → Sell → group <strong>veNFT positions</strong> → select{" "}
                      <code>veBTC #…</code> or <code>veMEZO #…</code>.
                    </li>
                    <li>
                      Amount is fixed to the lock size. Pick a buy token with a live route (e.g.
                      MUSD).
                    </li>
                    <li>
                      Approve the NFT for the zap router → <strong>Review swap</strong> →{" "}
                      <strong>Swap</strong>.
                    </li>
                  </ol>
                  <p className="mt-3 text-white/70">
                    Partial exit (sell only part of locked power) is not a single swap: deposit on{" "}
                    <DocRouteLink href="/earn">Earn</DocRouteLink> first, then sell tranche
                    fractions — see{" "}
                    <DocRouteLink href="/docs/swap/flows">Flow 5 in Swap flows</DocRouteLink>.
                  </p>
                </>
              ),
            },
            {
              id: "developer",
              label: "Developer",
              content: (
                <>
                  <p className="mb-2 text-white/70">Primary swap entrypoints:</p>
                  <ul className="list-disc space-y-1 pl-5 text-white/70">
                    <li>
                      <code>directClSwap</code> via <code>CLSwapRouter</code> (ERC-20 / ID20)
                    </li>
                    <li>
                      <code>auroveVeNftThenSwap</code> via{" "}
                      <code>AuroveZapRouter.zapVeNftExactInput</code>
                    </li>
                    <li>
                      Other zaps: deposit-wrap, tranche-wrap — see{" "}
                      <DocRouteLink href="/docs/swap/flows">Swap flows guide</DocRouteLink>
                    </li>
                  </ul>
                </>
              ),
            },
          ]}
        />
        <h2>Where to go next</h2>
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>Route</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Swap (homepage)</td>
              <td>
                <DocRouteLink href="/#swap-interface" code>
                  /#swap-interface
                </DocRouteLink>
              </td>
            </tr>
            <tr>
              <td>Swap overview & flows</td>
              <td>
                <DocRouteLink href="/docs/swap/overview" code>
                  /docs/swap/overview
                </DocRouteLink>
                ,{" "}
                <DocRouteLink href="/docs/swap/flows" code>
                  /docs/swap/flows
                </DocRouteLink>
              </td>
            </tr>
            <tr>
              <td>Create liquid position (Earn)</td>
              <td>
                <DocRouteLink href="/earn" code>
                  /earn
                </DocRouteLink>
                ,{" "}
                <DocRouteLink href="/earn/stake/btc" code>
                  /earn/stake/btc
                </DocRouteLink>
              </td>
            </tr>
            <tr>
              <td>Provide liquidity</td>
              <td>
                <DocRouteLink href="/liquidity" code>
                  /liquidity
                </DocRouteLink>
              </td>
            </tr>
          </tbody>
        </table>
      </>
    ),
  },
  {
    slug: "earn/flows",
    title: "Earn flows guide",
    description:
      "End-to-end Earn: deposit veNFT or lock tokens, claim rewards, and redeem in the settlement window — with screenshots.",
    tags: ["earn", "flows", "deposit", "redeem", "settlement", "screenshots"],
    status: "live",
    searchText:
      "earn flows guide create position lock tokens deposit venft claimables id20 gauge redeem settlement window await",
    Content: EarnFlowsContent,
  },
  {
    slug: "earn/vebtc",
    title: "veBTC",
    description: "Deposit BTC or veBTC into Aurove to mint liquid managed BTC exposure (avBTCm).",
    tags: ["earn", "vebtc", "avbtcm", "btc"],
    status: "live",
    searchText:
      "veBTC earn avBTCm lock BTC deposit position 4 epochs managed product redeem settlement",
    Content: () => (
      <>
        <h1>veBTC</h1>
        <Callout variant="info">
          Step-by-step UI walkthrough with screenshots:{" "}
          <DocRouteLink href="/docs/earn/flows">Earn flows guide</DocRouteLink>.
        </Callout>
        <p>
          The BTC path converts locked Bitcoin voting power into liquid Aurove inventory. In the UI,
          open the <strong>avBTCm</strong> card on Earn or go to{" "}
          <DocRouteLink href="/earn/stake/btc" code>
            /earn/stake/btc
          </DocRouteLink>
          .
        </p>
        <h2>What you receive</h2>
        <ul>
          <li>
            Managed product symbol: <strong>avBTCm</strong> (Aurove BTC — Managed).
          </li>
          <li>
            UI max lock bucket for BTC: <strong>4 epochs</strong> (managed tranche).
          </li>
          <li>1 unit of deposited lock value mints 1 unit of liquid product exposure.</li>
        </ul>
        <h2>Deposit modes</h2>
        <DocsTabs
          tabs={[
            {
              id: "lock",
              label: "Lock tokens",
              content: (
                <p>
                  Approve BTC for the Ledger, then <code>depositErc20</code> with the managed epoch
                  count. CTA: <strong>Create a liquid position</strong>.
                </p>
              ),
            },
            {
              id: "venft",
              label: "Deposit position",
              content: (
                <p>
                  Approve the veBTC NFT for the Ledger, then <code>depositVeNft</code>. Select from
                  wallet veNFTs listed as <code>veBTC #id</code>.
                </p>
              ),
            },
          ]}
        />
        <h2>Redeem notes (BTC)</h2>
        <p>
          During the settlement window, BTC redemption allows an <strong>editable amount</strong>{" "}
          with inventory selection — vault may split veNFTs for exact amounts.
        </p>
        <Callout variant="warning">
          Redemptions only during the weekly settlement window (opens 10 hours into each epoch,
          lasts 6 hours). Outside the window the button shows{" "}
          <strong>Await redemption window</strong>.
        </Callout>
      </>
    ),
  },
  {
    slug: "earn/vemezo",
    title: "veMEZO",
    description:
      "Deposit MEZO or veMEZO into Aurove to mint liquid managed MEZO exposure (avMEZOm).",
    tags: ["earn", "vemezo", "avmezom", "mezo"],
    status: "live",
    searchText:
      "veMEZO earn avMEZOm lock MEZO deposit 208 epochs managed product redeem discrete tokens",
    Content: () => (
      <>
        <h1>veMEZO</h1>
        <Callout variant="info">
          Full Earn UI path: <DocRouteLink href="/docs/earn/flows">Earn flows guide</DocRouteLink>.
        </Callout>
        <p>
          The MEZO path mirrors BTC Earn with longer managed lock parameters. Open the{" "}
          <strong>avMEZOm</strong> card on Earn or go to{" "}
          <DocRouteLink href="/earn/stake/mezo" code>
            /earn/stake/mezo
          </DocRouteLink>
          .
        </p>
        <h2>What you receive</h2>
        <ul>
          <li>
            Managed product: <strong>avMEZOm</strong>.
          </li>
          <li>
            UI max epochs for MEZO: <strong>208</strong>.
          </li>
        </ul>
        <h2>Redemption difference</h2>
        <p>
          MEZO redemption amount is driven by the selected vault veNFTs (input disabled; auto-sum of
          selected locks). Discrete token inventory is released rather than BTC-style exact splits.
        </p>
        <CodeBlock
          language="solidity"
          filename="ILedger.sol"
          code={`function depositErc20(uint8 variant, uint256 epochs, uint256 amount, address to) external returns (uint256 trancheId, uint256 minted);
function depositVeNft(uint8 variant, uint256 epochs, uint256 tokenId, address to) external returns (uint256 trancheId, uint256 minted);`}
        />
      </>
    ),
  },
  {
    slug: "earn/managed-yield",
    title: "Managed yield",
    description:
      "How Aurove managed positions earn, claim tranche rewards, and surface ID20 gauge rewards.",
    tags: ["earn", "yield", "rewards", "claim", "gauge"],
    status: "live",
    searchText:
      "managed yield claimables reward sink id20 gauge claim all annualised APR create position",
    Content: () => (
      <>
        <h1>Managed yield</h1>
        <Callout variant="info">
          See claimables, gauges, and redeem screenshots in the{" "}
          <DocRouteLink href="/docs/earn/flows">Earn flows guide</DocRouteLink>.
        </Callout>
        <p>
          Deposits are normalized into a <strong>managed tranche</strong> backed by a Vault-held
          MANAGED ve position. Underlying continues to earn Mezo rebases; Aurove distributes those
          rewards to share holders.
        </p>
        <RewardFlowDiagram />
        <h2>In the Earn UI</h2>
        <ul>
          <li>
            <strong>Rewards → Claimables</strong> — fraction reward balances via each product’s
            RewardSink <code>claimRewards</code>.
          </li>
          <li>
            <strong>Rewards → ID20 gauge rewards</strong> — per-gauge claim +{" "}
            <strong>Claim all</strong>. Inactive gauges show <strong>Activation required</strong>{" "}
            (activation can be included in LP flows).
          </li>
          <li>
            <strong>Annualised APR</strong> — shown on each earning-asset card and on position
            cards; latest weekly funding rate annualised without compounding (UI estimates, not
            guarantees).
          </li>
        </ul>
        <Callout variant="info">
          Anyone may permissionlessly call <code>Ledger.claimRebases</code> to pull Mezo rebases
          into sinks; holders then claim their share.
        </Callout>
      </>
    ),
  },
  {
    slug: "earn/tranches",
    title: "Tranches",
    description:
      "ERC1155 tranche shares, managed epoch buckets, redeem locks, and settlement windows.",
    tags: ["tranche", "erc1155", "epochs", "settlement"],
    status: "live",
    searchText:
      "tranche id erc1155 managed epochs redeem lock settlement window freeze fee proposal",
    Content: () => (
      <>
        <h1>Tranches</h1>
        <Callout variant="info">
          Settlement window open vs closed UI:{" "}
          <DocRouteLink href="/docs/earn/flows">Earn flows guide</DocRouteLink> (Flows 6–7).
        </Callout>
        <p>
          A <strong>tranche</strong> is an ERC1155 token id representing a slice of a managed ve
          position for a variant and epoch bucket. Managed products use the max epoch bucket for
          each variant.
        </p>
        <h2>Encoding</h2>
        <p>
          Tranche ids are canonically encoded via <code>TrancheIdLib</code> (variant + epochs). The
          same id is used by Ledger, Vault inventory sets, RewardSinks, and ID20 wrappers.
        </p>
        <h2>Redeem locks</h2>
        <p>
          When fee changes are proposed near epoch end, a freeze window can lock newly minted units
          so they cannot redeem in the immediately following settlement window. Locks travel with
          transfers.
        </p>
        <h2>Settlement window</h2>
        <ul>
          <li>Opens 10 hours into each weekly epoch</li>
          <li>Lasts 6 hours</li>
          <li>
            Outside the window: redemptions revert / UI shows{" "}
            <strong>Await redemption window</strong>
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "swap/fractions",
    title: "Fractions",
    description:
      "Ledger ERC1155 fraction balances and how they appear as sellable inventory in Swap.",
    tags: ["fractions", "erc1155", "tranche", "swap"],
    status: "live",
    searchText: "fractions ledger tranche sell swap asset selector liquid balances",
    Content: () => (
      <>
        <h1>Fractions</h1>
        <p>
          <strong>Fractions</strong> are ERC1155 tranche balances minted by the Ledger when you
          deposit. They represent pro-rata ownership of managed vault inventory and reward streams.
        </p>
        <h2>Where fractions appear</h2>
        <ul>
          <li>
            <strong>Earn → Your liquid positions</strong> — product balances and redemption.
          </li>
          <li>
            <strong>Swap sell side</strong> — asset selector groups <em>Ledger tranches</em> as
            sellable inventory.
          </li>
          <li>
            <strong>Liquidity funding sources</strong> — tranche / liquid kinds can fund LP via the
            zap router.
          </li>
        </ul>
        <h2>Wrapping to ID20</h2>
        <p>
          Transferring tranche shares into the matching <code>AuroveId20</code> mints fungible ERC20
          (wrap-on-receive). Unwrap burns ERC20 and returns ERC1155. See{" "}
          <DocRouteLink href="/docs/protocol/id20">ID20</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "swap/overview",
    title: "Swap overview",
    description:
      "Use the Aurove swap card: quotes, slippage, routes, approvals, and review confirmation.",
    tags: ["swap", "slippage", "route", "quote", "venft"],
    status: "live",
    searchText:
      "swap exact input output slippage deadline price impact review swap approve musd id20 route venft",
    Content: () => (
      <>
        <h1>Swap overview</h1>
        <Callout variant="info">
          For step-by-step guides of every verified sell form (ID20, ERC-20, underlying, tranche,
          entire veNFT, and partial ve exit via Earn), see the{" "}
          <DocRouteLink href="/docs/swap/flows">Swap flows guide</DocRouteLink>.
        </Callout>
        <p>
          Primary location: homepage{" "}
          <DocRouteLink href="/#swap-interface" code>
            /#swap-interface
          </DocRouteLink>
          . Nav <strong>Swap</strong> links there;{" "}
          <DocRouteLink href="/swap" code>
            /swap
          </DocRouteLink>{" "}
          redirects to the same surface.
        </p>
        <h2>Settings</h2>
        <ul>
          <li>Default slippage: 0.5% (0.01%–50%)</li>
          <li>Default deadline: 20 minutes (1–180)</li>
        </ul>
        <h2>Flow</h2>
        <ol>
          <li>Select Sell and Buy assets (search by symbol, name, id, or address).</li>
          <li>Enter amount (Max on sell when not veNFT-fixed).</li>
          <li>Review quote: price, route, min received, impact, network fee estimate.</li>
          <li>
            Approve if needed, then <strong>Review swap</strong> → confirm → <strong>Swap</strong>.
          </li>
        </ol>
        <Callout variant="warning">
          Price impact ≥ 5% shows an amber high-impact warning. Always verify the review dialog
          before signing.
        </Callout>
        <h2>Special sell types</h2>
        <ul>
          <li>
            <strong>veNFT</strong> — amount fixed by position (entire NFT only). Ideal first swap if
            you already hold veBTC / veMEZO.
          </li>
          <li>
            <strong>Tranche / wrap plans</strong> — quote may note deposits and wraps into ID20
            before swapping.
          </li>
        </ul>
        <p>
          Full flow matrix with prerequisites and outputs:{" "}
          <DocRouteLink href="/docs/swap/flows">Swap flows guide</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "swap/flows",
    title: "Swap flows guide",
    description:
      "End-to-end swap paths: ID20, ERC-20, underlying deposit-zap, tranche wrap, entire veNFT, and partial exit via Earn.",
    tags: ["swap", "flows", "venft", "tranche", "id20", "zap", "exact-input", "approvals"],
    status: "live",
    searchText:
      "swap flows guide entire venft tranche id20 partial deposit wrap zap ERC20 MUSD avBTCm approvals exact input ledger fractions earn deposit then swap",
    Content: SwapFlowsContent,
  },
  {
    slug: "liquidity/providing-liquidity",
    title: "Providing liquidity",
    description:
      "Select a pool, fund with mixed sources, mint a CL position, collect fees, increase or remove liquidity.",
    tags: ["liquidity", "pools", "fees", "lp"],
    status: "live",
    searchText:
      "providing liquidity musd avbtcm avmezom add liquidity collect fees remove increase burn nft stake unstake gauge adjust",
    Content: () => (
      <>
        <h1>Providing liquidity</h1>
        <p>
          Routes:{" "}
          <DocRouteLink href="/liquidity" code>
            /liquidity
          </DocRouteLink>
          ,{" "}
          <DocRouteLink href="/liquidity/add/btc" code>
            /liquidity/add/btc
          </DocRouteLink>
          ,{" "}
          <DocRouteLink href="/liquidity/add/mezo" code>
            /liquidity/add/mezo
          </DocRouteLink>
          .
        </p>
        <h2>Available pools (configured)</h2>
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th>Add route</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MUSD / avBTCm</td>
              <td>
                <DocRouteLink href="/liquidity/add/btc" code>
                  /liquidity/add/btc
                </DocRouteLink>
              </td>
            </tr>
            <tr>
              <td>avBTCm / avMEZOm</td>
              <td>
                <DocRouteLink href="/liquidity/add/mezo" code>
                  /liquidity/add/mezo
                </DocRouteLink>
              </td>
            </tr>
          </tbody>
        </table>
        <LiquidityFlowDiagram />
        <h2>Funding sources</h2>
        <p>Source selector kinds in the UI:</p>
        <ul>
          <li>
            <strong>ERC20</strong> — plain balances
          </li>
          <li>
            <strong>WRAPPED</strong> — wrapped representation
          </li>
          <li>
            <strong>LOCKED</strong> — veNFT (deposited/converted as needed)
          </li>
          <li>
            <strong>LIQUID</strong> — liquid tranche-related balances
          </li>
        </ul>
        <h2>Managing positions</h2>
        <ul>
          <li>Collect fees (per position or Collect all) for unstaked NFTs</li>
          <li>
            <strong>Adjust</strong> — increase or remove liquidity with slippage controls; burn
            empty NFTs
          </li>
          <li>
            <strong>Stake</strong> — deposit the position NFT into the pool CL gauge for emissions
          </li>
          <li>
            <strong>Unstake</strong> — withdraw from the gauge (optionally claim emissions) before
            adjusting
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "liquidity/concentrated-liquidity",
    title: "Concentrated liquidity",
    description:
      "Slipstream-style ranges, presets, ticks, and in-range fee earning on Aurove pools.",
    tags: ["concentrated-liquidity", "ticks", "range", "slipstream"],
    status: "live",
    searchText:
      "concentrated liquidity focused balanced full range custom tick spacing in range out of range",
    Content: () => (
      <>
        <h1>Concentrated liquidity</h1>
        <p>
          Aurove LP uses Mezo <strong>Slipstream-style</strong> concentrated liquidity. You choose a
          price range; fees accrue only while the pool price is in range.
        </p>
        <h2>Range presets</h2>
        <ul>
          <li>
            <strong>Focused</strong>
          </li>
          <li>
            <strong>Balanced</strong> (default)
          </li>
          <li>
            <strong>Full range</strong>
          </li>
          <li>
            <strong>Custom</strong> — graph drag or manual low/high prices (snaps to tick spacing)
          </li>
        </ul>
        <h2>Position status badges</h2>
        <ul>
          <li>
            <strong>In range</strong> — earning swap fees
          </li>
          <li>
            <strong>Out of range</strong> — not currently earning swap fees
          </li>
          <li>
            <strong>Closed</strong> — no active liquidity
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "liquidity/gauges",
    title: "Gauges",
    description:
      "ID20 gauges for liquid assets: activation, claims, and how they relate to LP incentives.",
    tags: ["gauge", "id20", "rewards", "activation"],
    status: "live",
    searchText:
      "id20 gauge activate claim credit debt weight lending liquidity incentives voting rewards",
    Content: () => (
      <>
        <h1>Gauges</h1>
        <p>
          Each managed ID20 has an <strong>Id20Gauge</strong> that streams rewards to activated
          holders with high-precision virtual accounting and transfer-time credit/debt mechanics.
        </p>
        <h2>User actions in the app</h2>
        <ul>
          <li>
            <strong>Earn → Rewards → ID20 gauge rewards</strong> — view claimable, claim one or
            claim all.
          </li>
          <li>
            <strong>Activation required</strong> — inactive accounts do not earn; LP flows can
            prepend activation steps and keep the form intact.
          </li>
        </ul>
        <h2>Mechanics (protocol)</h2>
        <ul>
          <li>
            <code>activate()</code> starts participation.
          </li>
          <li>
            Transfers between active/inactive accounts adjust weight, debt, credit, and loans so
            reward weight is not lost or unfairly diluted.
          </li>
          <li>
            <code>claim(receiver)</code> pays accrued rewards.
          </li>
        </ul>
        <Callout variant="info">
          Protocol-level Mezo gauge voting from VeNftManagers is an operational/maintainer surface —
          not a retail voting UI in the current dapp.
        </Callout>
      </>
    ),
  },
  {
    slug: "academy/points",
    title: "Points",
    description:
      "How Academy points accrue from swaps and fee collection, ranks, seasons, and leaderboards.",
    tags: ["academy", "points", "leaderboard", "season"],
    status: "live",
    searchText:
      "academy points rank season leaderboard epoch activity dialog 3.6 points musd swap points",
    Content: () => (
      <>
        <h1>Points</h1>
        <p>
          Academy tracks season points from qualifying on-chain activity. There is no separate
          “claim points” button — points accrue when you complete rewarded actions.
        </p>
        <h2>Prerequisites</h2>
        <ul>
          <li>Wallet connected on the correct network</li>
          <li>
            <strong>Sign In</strong> for personalized points, rank, and referral link
          </li>
        </ul>
        <h2>How points are earned (current tasks)</h2>
        <ul>
          <li>
            <strong>Collect LP fees</strong> on supported Aurove pools — task shows{" "}
            <strong>3.6 points per MUSD</strong> of collected fee value (90% allocation weighting in
            UI copy).
          </li>
          <li>
            <strong>Swap</strong> through supported Aurove pools — points ={" "}
            <strong>0.12% of input token MUSD value</strong> (10% allocation in UI copy).
          </li>
        </ul>
        <h2>Leaderboard</h2>
        <p>
          Global season ranking and weekly epoch views with pagination. Click a row for activity
          detail (task rewards and referral reward types).
        </p>
      </>
    ),
  },
  {
    slug: "academy/quests",
    title: "Quests & tasks",
    description:
      "Academy task carousel: liquidity fee collection, swapping, and season workflow guidance.",
    tags: ["academy", "quests", "tasks"],
    status: "live",
    searchText: "quests tasks carousel liquidity provider task swapper task academy workflow",
    Content: () => (
      <>
        <h1>Quests & tasks</h1>
        <p>
          The Academy tasks carousel describes live qualifying actions. It auto-advances every 10s
          (pauses on hover/focus; respects reduced motion).
        </p>
        <h2>Current slides</h2>
        <ol>
          <li>
            <strong>Liquidity provider task</strong> — collect actual fees from supported CL pools →
            CTA to{" "}
            <DocRouteLink href="/liquidity" code>
              /liquidity
            </DocRouteLink>
            .
          </li>
          <li>
            <strong>Swapper task</strong> — swap involving supported pools → CTA to{" "}
            <DocRouteLink href="/#swap-interface" code>
              /#swap-interface
            </DocRouteLink>
            .
          </li>
          <li>
            <strong>Keep the season moving</strong> — workflow note that more tasks may go live over
            time.
          </li>
        </ol>
        <Callout variant="coming-soon">
          Additional quest types are not documented beyond what the carousel currently exposes.
        </Callout>
      </>
    ),
  },
  {
    slug: "academy/referrals",
    title: "Referrals",
    description:
      "How Academy direct and grand referrals work: link binding, two-hop chains, and 90% / 3% / 7% point splits.",
    tags: ["academy", "referrals", "direct", "grand", "points"],
    status: "live",
    searchText:
      "referrals direct grand referral link copy authenticate academy network 90 3 7 percent task award two hop chain cookie bind self referral",
    Content: () => (
      <>
        <h1>Referrals</h1>
        <p>
          Academy referrals attribute a wallet to a referrer on a given chain, then share a fixed
          slice of that wallet’s task points with a two-hop chain: <strong>direct</strong> (the
          person you invited) and <strong>grand</strong> (people your directs invite).
        </p>
        <Callout variant="info" title="Live on Testnet">
          Referral links, counts, and reward splits are live in the Academy UI after wallet{" "}
          <strong>Sign In</strong>. Binding is stored per chain and cannot be reassigned once set.
        </Callout>

        <h2>UI states</h2>
        <ul>
          <li>
            <strong>Not authenticated</strong> — prompt to authenticate to unlock your referral link
          </li>
          <li>
            <strong>Profile not ready</strong> — link appears once the Academy profile / code is
            ready
          </li>
          <li>
            <strong>Ready</strong> — copyable link plus <strong>Direct referrals</strong> and{" "}
            <strong>Grand referrals</strong> counts
          </li>
        </ul>

        <h2>Your referral link</h2>
        <p>
          After Sign In, Academy ensures an 8-character referral code for your wallet on the active
          chain and builds a link of the form:
        </p>
        <CodeBlock language="text" code={`https://www.aurove.xyz/academy?ref=<8-char-code>`} />
        <ul>
          <li>
            Query param: <code>ref</code>
          </li>
          <li>
            Code charset: alphanumeric plus <code>_</code> / <code>-</code>, length{" "}
            <strong>8</strong>
          </li>
          <li>
            One code per <strong>user + chain</strong>; codes are unique globally
          </li>
        </ul>

        <h2>How someone becomes your referral</h2>
        <ol>
          <li>
            They open your link (or any URL carrying your <code>ref</code> code).
          </li>
          <li>
            If they are not signed in yet, the app can store the code in a short-lived pending
            cookie (<code>academy_referral</code>, ~7 days) until they authenticate.
          </li>
          <li>
            On bind (authenticated <code>POST /api/academy/referral</code>), the system records a
            relationship: <em>referred user → referrer</em> for that chain.
          </li>
        </ol>
        <h3>Binding rules</h3>
        <ul>
          <li>
            <strong>One referrer per wallet per chain</strong> — once bound, a different code is
            rejected as already bound.
          </li>
          <li>
            <strong>No self-referral</strong> — you cannot use your own code.
          </li>
          <li>
            <strong>Chain must match</strong> — the code’s chain must match the authenticated
            session chain.
          </li>
          <li>
            Re-binding the <em>same</em> referrer is idempotent (returns the existing relationship).
          </li>
        </ul>

        <h2>Direct vs grand referrals</h2>
        <p>The network is a two-hop tree built only from direct relationships:</p>
        <Diagram title="Direct and grand referral chain">
          <div className="flex flex-col items-center gap-3 text-sm">
            <div className="rounded-xl border border-[#d2a45f]/40 bg-[#d2a45f]/12 px-4 py-2 text-[#f0e2c8]">
              You (grand to C)
            </div>
            <div className="text-white/35">↓ invites</div>
            <div className="rounded-xl border border-white/12 bg-[#0d1219] px-4 py-2 text-white/85">
              Alice — your <strong className="text-[#ecd09b]">direct</strong> referral
            </div>
            <div className="text-white/35">↓ Alice invites</div>
            <div className="rounded-xl border border-white/12 bg-[#0d1219] px-4 py-2 text-white/85">
              Carol — your <strong className="text-[#ecd09b]">grand</strong> referral
            </div>
          </div>
        </Diagram>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Meaning</th>
              <th>How it is counted</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Direct referrals</strong>
              </td>
              <td>Wallets that bound your referral code</td>
              <td>
                Count of relationships where you are the <code>referrer_user_id</code> on this chain
              </td>
            </tr>
            <tr>
              <td>
                <strong>Grand referrals</strong>
              </td>
              <td>Wallets referred by your directs</td>
              <td>
                Count of relationships one hop below your directs (your direct is their referrer)
              </td>
            </tr>
          </tbody>
        </table>
        <Callout variant="important">
          There is no deeper than two hops for rewards. If Carol later invites Dave, Dave is{" "}
          <em>Alice’s grand</em> and <em>Carol’s direct</em> — not attributed further up to you.
        </Callout>

        <h2>How referral points are earned</h2>
        <p>
          Referrals do not pay a one-time signup bonus in the current system. Instead, when a
          referred user earns <strong>task points</strong> (for example from a qualifying swap or
          fee collection), the base award is split across the action user and their referral chain:
        </p>
        <table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Share of base task points</th>
              <th>When paid</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Action user (the person who completed the task)</td>
              <td>
                <strong>90%</strong>
              </td>
              <td>Always, for the task award</td>
            </tr>
            <tr>
              <td>
                <strong>Direct referrer</strong> of that user
              </td>
              <td>
                <strong>3%</strong>
              </td>
              <td>Only if a direct referrer is bound</td>
            </tr>
            <tr>
              <td>
                <strong>Grand referrer</strong> (referrer of the direct referrer)
              </td>
              <td>
                <strong>7%</strong>
              </td>
              <td>Only if a grand referrer exists on the chain</td>
            </tr>
          </tbody>
        </table>
        <p>
          Example: Alice is bound to you, and Carol is bound to Alice. When Carol earns{" "}
          <strong>100</strong> base task points:
        </p>
        <ul>
          <li>
            Carol receives <strong>90</strong> (user share)
          </li>
          <li>
            Alice receives <strong>3</strong> (direct referral reward)
          </li>
          <li>
            You receive <strong>7</strong> (grand referral reward)
          </li>
        </ul>
        <p>
          If Carol has no grand referrer (Alice was not referred by anyone), Alice still gets 3% and
          Carol 90%; the 7% grand slice is simply not minted to anyone.
        </p>
        <Callout variant="info">
          Splits use fixed-point Academy units (18 decimals) with rounded integer division so ledger
          amounts stay precise.
        </Callout>

        <h2>Where rewards show up</h2>
        <ul>
          <li>
            <strong>Points total / rank</strong> — include user and referral award entries for the
            season
          </li>
          <li>
            <strong>Activity dialog</strong> (leaderboard row) — badges such as{" "}
            <strong>Task reward</strong>, <strong>Direct referral reward</strong>, and{" "}
            <strong>Grand referral reward</strong>
          </li>
        </ul>
        <p>
          Ledger source types used internally: <code>task_award_user</code>,{" "}
          <code>task_award_referral_direct</code>, <code>task_award_referral_grand</code>.
        </p>

        <h2>Qualified referrals (epoch context)</h2>
        <p>
          For some epoch / leaderboard helpers, a direct referral may be treated as{" "}
          <em>qualified</em> only when the referred user also has points activity inside that epoch
          window. The Academy referral card counts (<strong>Direct</strong> / <strong>Grand</strong>
          ) are total relationship counts for the chain, not limited to the current epoch.
        </p>

        <h2>Quick reference</h2>
        <DocsTabs
          tabs={[
            {
              id: "user",
              label: "User",
              content: (
                <ol className="list-decimal space-y-1.5 pl-5 text-white/70">
                  <li>Connect wallet, switch network, Sign In on Academy.</li>
                  <li>Copy your referral link and share it.</li>
                  <li>
                    When friends sign in via your link, your <strong>Direct</strong> count
                    increases.
                  </li>
                  <li>
                    When they refer others, your <strong>Grand</strong> count increases.
                  </li>
                  <li>
                    You earn ongoing points when they complete Academy tasks (3% direct / 7% grand
                    of their base task points).
                  </li>
                </ol>
              ),
            },
            {
              id: "developer",
              label: "Developer",
              content: (
                <ul className="list-disc space-y-1.5 pl-5 text-white/70">
                  <li>
                    Constants: <code>ACADEMY_TASK_USER_PERCENT = 90</code>,{" "}
                    <code>ACADEMY_REFERRAL_DIRECT_PERCENT = 3</code>,{" "}
                    <code>ACADEMY_REFERRAL_GRAND_PERCENT = 7</code>
                  </li>
                  <li>
                    Bind: <code>bindAcademyReferral</code> · summary:{" "}
                    <code>resolveAcademyReferralSummary</code>
                  </li>
                  <li>
                    Chain resolution: direct join + left-join grand on{" "}
                    <code>academy_referral_relationships</code>
                  </li>
                  <li>
                    Awards: <code>buildAcademyTaskAwardRecipients</code> /{" "}
                    <code>splitAcademyReferralPointUnits</code>
                  </li>
                  <li>
                    API: <code>POST /api/academy/referral</code> with{" "}
                    <code>{`{ "refId": "..." }`}</code>
                  </li>
                </ul>
              ),
            },
          ]}
        />
      </>
    ),
  },
  {
    slug: "protocol/id20",
    title: "ID20",
    description:
      "ERC20 wrappers for Aurove tranches: wrapping, unwrapping, backing model, and surplus backing.",
    tags: ["id20", "erc20", "wrap", "unwrap", "backing"],
    status: "live",
    searchText:
      "id20 auroveid20 wrap unwrap backingBalance surplusBacking isFullyBacked underbacked gauge",
    Content: () => (
      <>
        <h1>ID20</h1>
        <p>
          <strong>ID20</strong> tokens are ERC20 wrappers around a single Ledger ERC1155 tranche id.
          They enable DEX and LP composability while preserving 1:1 backing semantics.
        </p>
        <VeToId20FlowDiagram />
        <h2>Purpose</h2>
        <ul>
          <li>Fungible ERC20 interface for tranche ownership</li>
          <li>Attach Id20Gauge reward streaming</li>
          <li>Integrate with CL pools (avBTCm, avMEZOm)</li>
        </ul>
        <h2>Wrapping</h2>
        <p>
          ERC1155 <code>safeTransferFrom</code> into the ID20 contract mints ERC20 to the recipient
          (optional 32-byte recipient data). Emits <code>WrappedFromReceived</code>.
        </p>
        <h2>Unwrapping</h2>
        <CodeBlock
          language="solidity"
          code={`function unwrap(uint256 amount, address to) external returns (uint256 burned);`}
        />
        <p>
          Burns ERC20 and transfers underlying ERC1155 to <code>to</code>. Emits{" "}
          <code>Unwrapped</code>.
        </p>
        <h2>Backing model</h2>
        <ul>
          <li>
            Invariant: <code>totalSupply() ≤ backingBalance()</code>
          </li>
          <li>
            <code>surplusBacking()</code> — excess ERC1155 held beyond totalSupply
          </li>
          <li>
            <code>isFullyBacked()</code> — view helper
          </li>
          <li>
            Reverts with <code>Underbacked</code> if the invariant would break
          </li>
        </ul>
        <h2>Live testnet tokens</h2>
        <ul>
          <li>
            avBTCmId20 — <code>0x185E70EbFB606Ea8F3365A2952AD3aA677210366</code>
          </li>
          <li>
            avMEZOmId20 — <code>0x99DBba550D4bFD8c83fFaE9711b243B5ef6Ef082</code>
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "protocol/ledger",
    title: "Ledger",
    description:
      "ERC1155 architecture for deposits, redemptions, managed epochs, and fee configuration.",
    tags: ["ledger", "erc1155", "deposits", "redeem"],
    status: "live",
    searchText: "ledger depositErc20 depositVeNft redeem claimRebases fee config managed inventory",
    Content: () => (
      <>
        <h1>Ledger</h1>
        <p>
          The <strong>Ledger</strong> is the protocol entry point: ERC1155 accounting, deposits,
          redemptions, rebase claims, and fee governance. Custody is delegated to the Vault.
        </p>
        <h2>Important functions</h2>
        <ul>
          <li>
            <code>depositErc20(variant, epochs, amount, to)</code>
          </li>
          <li>
            <code>depositVeNft(variant, epochs, tokenId, to)</code>
          </li>
          <li>
            <code>redeem(trancheId, amount, receiver, tokenIds)</code>
          </li>
          <li>
            <code>claimRebases(trancheIds)</code>
          </li>
        </ul>
        <h2>Managed epochs</h2>
        <p>
          UI products use managed max-epoch buckets per variant (BTC: 4, MEZO: 208 in the current
          Earn UI). Deposits mint the corresponding tranche id.
        </p>
        <h2>Events</h2>
        <ul>
          <li>
            <code>VeNftDeposited</code>
          </li>
          <li>
            <code>VeNftWithdrawn</code>
          </li>
          <li>
            <code>RebaseClaimed</code>
          </li>
        </ul>
        <p>
          Testnet:{" "}
          <a
            href={explorerAddressUrl("0xE276fB7B0376aBbb1a11B14f31E3773C331aE7D7")}
            target="_blank"
            rel="noreferrer"
          >
            0xE276…E7D7
          </a>
        </p>
      </>
    ),
  },
  {
    slug: "protocol/vaults",
    title: "Vaults",
    description:
      "Vault custody, managed veNFT inventory, redemption releases, and manager/sink deployment.",
    tags: ["vault", "custody", "inventory", "manager"],
    status: "live",
    searchText: "vault custody depositManaged releaseVeBtc releaseVeMezo manager sink beacon",
    Content: () => (
      <>
        <h1>Vaults</h1>
        <VaultLifecycleDiagram />
        <h2>Custody</h2>
        <p>
          When the Ledger deposits a veNFT, the Vault receives it and immediately calls Mezo{" "}
          <code>depositManaged</code> into the variant’s managed position. Inventory token ids are
          tracked per tranche.
        </p>
        <h2>Accounting</h2>
        <ul>
          <li>Per-tranche enumerable inventory of custodied token ids</li>
          <li>One VeNftManager + RewardSink pair per variant (e.g. avBTCm, avMEZOm)</li>
        </ul>
        <h2>Settlement / release</h2>
        <ul>
          <li>
            <strong>BTC</strong> — may split veNFTs to satisfy exact redeem amounts
          </li>
          <li>
            <strong>MEZO</strong> — releases discrete selected token ids
          </li>
        </ul>
        <Callout variant="important">
          Users interact with the Vault indirectly through the Ledger (and zap router). Direct vault
          admin paths are not retail UI features.
        </Callout>
      </>
    ),
  },
  {
    slug: "protocol/rewards",
    title: "Rewards",
    description: "Retroactive credit rewards, sinks, ID20 harvest, and fee-on-rebase mechanics.",
    tags: ["rewards", "rebases", "sink", "retroactive-credit"],
    status: "live",
    searchText:
      "rewards retroactive credit reward sink claimRewards claimRebases protocol fee gauge notify",
    Content: () => (
      <>
        <h1>Rewards</h1>
        <RewardFlowDiagram />
        <h2>Problem</h2>
        <p>
          Mezo rebases arrive asynchronously. Naïve pro-rata distribution would let late depositors
          snipe rewards funded before they entered.
        </p>
        <h2>Retroactive credit model</h2>
        <ul>
          <li>Virtual credit accrues over time for existing units</li>
          <li>Real reward tokens only distribute over credit that existed before notification</li>
          <li>
            New units pay via <code>rewardDebtPerUnitIntegral</code> so they do not earn past
            rewards
          </li>
        </ul>
        <h2>User claim surfaces</h2>
        <ol>
          <li>
            Tranche claimables → RewardSink <code>claimRewards</code>
          </li>
          <li>
            AuroveId20 <code>claimRewards</code> harvests sink → notifies gauge
          </li>
          <li>
            Id20Gauge <code>claim</code> for activated holders
          </li>
        </ol>
        <h2>Protocol fee</h2>
        <p>
          Configurable BPS fee on gross rebase funding, with propose → next-epoch execute flow and
          freeze-window rules.
        </p>
      </>
    ),
  },
  {
    slug: "protocol/security-model",
    title: "Security model",
    description:
      "Backing invariants, settlement windows, access control, and operational security assumptions.",
    tags: ["security", "invariants", "permissions"],
    status: "live",
    searchText:
      "security model underbacked reentrancy access control settlement window maintainers nonReentrant audit",
    Content: () => (
      <>
        <h1>Security model</h1>
        <h2>Core invariants</h2>
        <ul>
          <li>Tranche supply backed by vault-managed locked value (construction + redeem paths)</li>
          <li>
            ID20 <code>totalSupply ≤ backingBalance</code>
          </li>
          <li>No reward sniping via retroactive credit accounting</li>
          <li>Redemptions constrained to settlement windows + redeem locks</li>
        </ul>
        <h2>Access control</h2>
        <ul>
          <li>Ledger owner: fee + vault configuration</li>
          <li>VeNftManager maintainers: operational Mezo votes / claims</li>
          <li>Gauge transfer hooks only callable from the linked ID20</li>
          <li>Reentrancy guards on state-changing paths</li>
        </ul>
        <h2>User responsibilities</h2>
        <ul>
          <li>Verify destination contracts before signing</li>
          <li>Use the expected chain for the deployment</li>
          <li>Review slippage and price impact on swaps / LP</li>
        </ul>
        <Callout variant="warning">
          Mezo Testnet deployments are for evaluation. Treat addresses and parameters as subject to
          redeploy; always confirm against the live dapp registry.
        </Callout>
      </>
    ),
  },
  {
    slug: "developers/contracts",
    title: "Contracts",
    description:
      "Deployed Aurove contract reference for Mezo Testnet: addresses, functions, events, and roles.",
    tags: ["developers", "contracts", "addresses", "abi"],
    status: "live",
    searchText:
      "contract reference ledger vault id20 zap router addresses mezo testnet 31611 functions events",
    Content: () => (
      <>
        <h1>Contracts</h1>
        <p>
          Network: <strong>Mezo Testnet</strong> (chain id {MEZO_TESTNET_CHAIN_ID}). Addresses below
          match package deployment artifacts consumed by the dapp registry.
        </p>
        <Callout variant="info">
          The dapp registry is autogenerated — do not hand-edit <code>contracts/registry.ts</code>.
        </Callout>
        {TESTNET_CONTRACTS.map((contract) => (
          <section key={contract.name} className="mt-8 rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="!mt-0 text-lg">{contract.name}</h2>
              <span className="text-[11px] uppercase tracking-[0.12em] text-white/40">
                {contract.package} · {contract.status}
              </span>
            </div>
            <p className="text-sm text-white/65">{contract.purpose}</p>
            {contract.address ? (
              <p className="mt-2 font-mono text-xs text-[#ecd09b]">
                <a href={explorerAddressUrl(contract.address)} target="_blank" rel="noreferrer">
                  {contract.address}
                </a>
              </p>
            ) : (
              <p className="mt-2 text-xs text-white/40">
                No singleton address (factory implementation).
              </p>
            )}
            {contract.interfaces?.length ? (
              <p className="mt-2 text-xs text-white/45">
                Interfaces:{" "}
                {contract.interfaces.map((iface, idx) => (
                  <span key={iface}>
                    {idx > 0 ? ", " : null}
                    <code>{iface}</code>
                  </span>
                ))}
              </p>
            ) : null}
            {contract.functions.length ? (
              <>
                <h3 className="!text-sm">Functions</h3>
                <ul>
                  {contract.functions.map((fn) => (
                    <li key={fn.name}>
                      <code>{fn.name}</code> — {fn.description}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {contract.events.length ? (
              <>
                <h3 className="!text-sm">Events</h3>
                <ul>
                  {contract.events.map((ev) => (
                    <li key={ev.name}>
                      <code>{ev.name}</code> — {ev.description}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {contract.permissions?.length ? (
              <>
                <h3 className="!text-sm">Permissions</h3>
                <ul>
                  {contract.permissions.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ))}
      </>
    ),
  },
  {
    slug: "developers/integrations",
    title: "Integrations",
    description:
      "Integrate with Aurove as a protocol: ID20 as ERC20, deposit flows, zap router, and gauge activation.",
    tags: ["developers", "integrations", "sdk"],
    status: "live",
    searchText:
      "integrations id20 erc20 activate gauge zap router deposit redeem read ledger balance",
    Content: () => (
      <>
        <h1>Integrations</h1>
        <DocsTabs
          tabs={[
            {
              id: "holder",
              label: "User protocol",
              content: (
                <ul className="list-disc space-y-1 pl-5 text-white/70">
                  <li>Deposit via Ledger or ZapRouter</li>
                  <li>Hold ID20; call gauge activate once</li>
                  <li>Claim via sink / gauge as appropriate</li>
                  <li>Redeem only in settlement windows</li>
                </ul>
              ),
            },
            {
              id: "dev",
              label: "Developer",
              content: (
                <ul className="list-disc space-y-1 pl-5 text-white/70">
                  <li>Treat avBTCm / avMEZOm as standard 18-decimal ERC20</li>
                  <li>
                    Read <code>backingBalance</code> / <code>surplusBacking</code> for solvency
                    views
                  </li>
                  <li>
                    Use <code>accountState</code> on gauges for off-chain previews when available
                  </li>
                  <li>Prefer ZapRouter ordered liquidity methods for multi-asset entry</li>
                </ul>
              ),
            },
          ]}
        />
        <h2>TypeScript (dapp helpers)</h2>
        <CodeBlock
          language="typescript"
          filename="contracts/earn.ts"
          code={`import { getEarnProtocolAddresses, getLedgerAbi } from "@/contracts/earn";

const { ledgerAddress, auroveId20Address } = getEarnProtocolAddresses(31611);
const ledgerAbi = getLedgerAbi(31611);`}
        />
        <h2>Shell — explorer</h2>
        <CodeBlock
          language="shell"
          code={`# Mezo Testnet explorer
open https://explorer.test.mezo.org/address/0xE276fB7B0376aBbb1a11B14f31E3773C331aE7D7`}
        />
      </>
    ),
  },
  {
    slug: "developers/events",
    title: "Events",
    description:
      "Protocol and application event surfaces used by the dapp indexing and portfolio layer.",
    tags: ["developers", "events", "indexing"],
    status: "live",
    searchText:
      "events VeNftDeposited LiquidityAdded internal events api portfolio indexing handlers",
    Content: () => (
      <>
        <h1>Events</h1>
        <h2>On-chain (selected)</h2>
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Event</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ledger</td>
              <td>
                <code>VeNftDeposited</code>
              </td>
              <td>Deposit indexing</td>
            </tr>
            <tr>
              <td>Ledger</td>
              <td>
                <code>VeNftWithdrawn</code>
              </td>
              <td>Redemption indexing</td>
            </tr>
            <tr>
              <td>Ledger</td>
              <td>
                <code>RebaseClaimed</code>
              </td>
              <td>Reward funding</td>
            </tr>
            <tr>
              <td>ID20</td>
              <td>
                <code>WrappedFromReceived</code> / <code>Unwrapped</code>
              </td>
              <td>Wrap inventory</td>
            </tr>
            <tr>
              <td>ZapRouter</td>
              <td>
                <code>LiquidityAdded</code> / <code>LiquidityIncreased</code>
              </td>
              <td>LP positions</td>
            </tr>
          </tbody>
        </table>
        <h2>Application ingestion</h2>
        <p>
          The dapp exposes an internal events pipeline under <code>/api/internal/events</code> for
          authenticated ingestion used by Academy points and related indexing. Contract handler
          types live under <code>lib/events/</code>.
        </p>
        <Callout variant="warning">
          Internal routes require service authentication — they are not public integration APIs.
        </Callout>
      </>
    ),
  },
  {
    slug: "developers/api",
    title: "API",
    description: "HTTP APIs available in the Aurove dapp: Academy, auth, and internal services.",
    tags: ["developers", "api", "academy", "auth"],
    status: "live",
    searchText:
      "api academy summary leaderboard referral activity auth nonce verify session cron events",
    Content: () => (
      <>
        <h1>API</h1>
        <p>
          Public product APIs are intentionally thin. Most protocol reads are on-chain via the
          browser; Academy and wallet auth use Next.js route handlers.
        </p>
        <h2>Academy (user-facing)</h2>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /api/academy/summary</code>
              </td>
              <td>Season points, rank, referral summary for session user</td>
            </tr>
            <tr>
              <td>
                <code>GET /api/academy/leaderboard</code>
              </td>
              <td>Global / epoch leaderboard pages</td>
            </tr>
            <tr>
              <td>
                <code>GET /api/academy/activity</code>
              </td>
              <td>Paginated activity for a wallet</td>
            </tr>
            <tr>
              <td>
                <code>GET/POST /api/academy/referral</code>
              </td>
              <td>Referral link and attachment flows</td>
            </tr>
          </tbody>
        </table>
        <h2>Auth</h2>
        <ul>
          <li>
            <code>GET /api/auth/nonce</code>
          </li>
          <li>
            <code>POST /api/auth/verify</code>
          </li>
          <li>
            <code>GET /api/auth/session</code>
          </li>
        </ul>
        <h2>Docs analytics</h2>
        <ul>
          <li>
            <code>POST /api/docs/analytics</code> — page views, searches, empty searches
          </li>
        </ul>
        <h2>Internal (not public)</h2>
        <ul>
          <li>
            <code>/api/internal/cron</code>
          </li>
          <li>
            <code>/api/internal/events</code>
          </li>
        </ul>
        <CodeBlock
          language="json"
          filename="example academy summary shape"
          code={`{
  "points": "0",
  "rank": null,
  "season": { "name": "..." },
  "referral": { "link": "https://www.aurove.xyz/..." }
}`}
        />
      </>
    ),
  },
  {
    slug: "faq",
    title: "FAQ",
    description:
      "Common issues from the live Aurove interface: network, earn, swap, liquidity, and academy.",
    tags: ["faq", "troubleshooting", "errors"],
    status: "live",
    searchText:
      "faq wrong network sign in no liquid positions redemption window insufficient balance no route academy",
    Content: () => (
      <>
        <h1>FAQ</h1>
        <p>
          Short answers to the issues users hit most often in the live Aurove interface. For deeper
          product guides, start with{" "}
          <DocRouteLink href="/docs/getting-started/connect-wallet">Getting started</DocRouteLink>{" "}
          or the <DocRouteLink href="/docs/swap/flows">Swap flows guide</DocRouteLink>.
        </p>
        <h2>Wallet & network</h2>
        <h3>Why do I only see Connect Wallet?</h3>
        <p>{AUROVE_FAQ_ITEMS[0].answer}</p>
        <h3>What does Wrong Network mean?</h3>
        <p>{AUROVE_FAQ_ITEMS[1].answer}</p>
        <h3>What is Sign In for?</h3>
        <p>{AUROVE_FAQ_ITEMS[2].answer}</p>
        <h2>Earn</h2>
        <h3>No liquid positions yet</h3>
        <p>{AUROVE_FAQ_ITEMS[3].answer}</p>
        <h3>Await redemption window</h3>
        <p>{AUROVE_FAQ_ITEMS[4].answer}</p>
        <h2>Swap</h2>
        <h3>No route available / Insufficient liquidity</h3>
        <p>{AUROVE_FAQ_ITEMS[5].answer}</p>
        <h2>Liquidity</h2>
        <h3>Unsupported source combo</h3>
        <p>{AUROVE_FAQ_ITEMS[6].answer}</p>
        <h2>Academy</h2>
        <h3>Points show “Visible after wallet authentication”</h3>
        <p>{AUROVE_FAQ_ITEMS[7].answer}</p>
      </>
    ),
  },
];

export const DOC_PAGES = pages;

export function getDocPage(slug: string): DocPageDefinition | undefined {
  return pages.find((page) => page.slug === slug);
}

export function getAllDocSlugs(): string[] {
  return pages.map((page) => page.slug);
}

export function getDocSearchDocuments(): DocSearchDocument[] {
  return pages.map((page) => ({
    id: page.slug,
    slug: page.slug,
    title: page.title,
    description: page.description,
    tags: page.tags ?? [],
    body: [page.searchText, page.description, ...(page.tags ?? []), ...(page.keywords ?? [])]
      .filter(Boolean)
      .join(" "),
    section: getDocSectionTitle(page.slug),
  }));
}
