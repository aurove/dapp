import type { ReactNode } from "react";
import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { Diagram, DiagramParts } from "@/components/docs/diagram";
import { DocsTabs } from "@/components/docs/docs-tabs";

const { Node, Arrow, Row } = DiagramParts;

function Shot({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div className="relative mx-auto max-w-md bg-[#0a0e14] px-2 py-3 sm:max-w-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- static docs screenshots under /public */}
        <img src={src} alt={alt} className="mx-auto h-auto w-full rounded-xl" />
      </div>
      <figcaption className="border-t border-white/8 px-4 py-2.5 text-[12.5px] leading-relaxed text-white/50">
        {caption}
      </figcaption>
    </figure>
  );
}

function FlowTable({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th className="w-[38%]">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Comprehensive swap-flows guide for users on aurove.xyz.
 */
export function SwapFlowsContent() {
  return (
    <>
      <h1>Swap flows guide</h1>
      <p>
        This guide documents every swap path the Aurove app can plan and execute today. Content is
        limited to behaviour implemented in the Swap UI (
        <DocRouteLink href="/#swap-interface" code>
          /#swap-interface
        </DocRouteLink>
        ) and the routers it calls.
      </p>

      <Callout variant="info" title="Status labels in this guide">
        <ul>
          <li>
            <strong>Supported</strong> — available in the live Swap UI and expected to execute when
            a route and balances allow
          </li>
          <li>
            <strong>Limited</strong> — incomplete, blocked, or not offered as a single-button flow
          </li>
        </ul>
      </Callout>

      <h2>Where to swap</h2>
      <p>
        All swaps run through the homepage Swap card (
        <DocRouteLink href="/#swap-interface">Open swap</DocRouteLink>
        ). App nav <strong>Swap</strong> and legacy{" "}
        <DocRouteLink href="/swap" code>
          /swap
        </DocRouteLink>{" "}
        redirect to the same surface.
      </p>

      <Shot
        src="/docs/swap-flows/01-swap-card-crop.png"
        alt="Aurove swap card"
        caption="Homepage Swap card: Sell and Buy assets, reverse direction, slippage settings, and the primary action (Connect / Approve / Review swap)."
      />

      <h2>Supported asset forms</h2>
      <table>
        <thead>
          <tr>
            <th>Form</th>
            <th>Sell side</th>
            <th>Buy side</th>
            <th>UI group</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>erc20</code> (e.g. MUSD)
            </td>
            <td>Yes</td>
            <td>Yes</td>
            <td>ERC-20 / Other ERC-20</td>
          </tr>
          <tr>
            <td>
              <code>id20</code> (e.g. avBTCm, avMEZOm)
            </td>
            <td>Yes</td>
            <td>Yes (preferred)</td>
            <td>ID20 tokens</td>
          </tr>
          <tr>
            <td>
              <code>underlying</code> (BTC / MEZO deposit-into-managed)
            </td>
            <td>Yes</td>
            <td>No</td>
            <td>ERC-20 tokens (special deposit label)</td>
          </tr>
          <tr>
            <td>
              <code>tranche</code> (Ledger ERC-1155)
            </td>
            <td>Yes</td>
            <td>No</td>
            <td>Ledger tranches</td>
          </tr>
          <tr>
            <td>
              <code>venft</code> (veBTC / veMEZO position)
            </td>
            <td>Yes (entire lock only)</td>
            <td>No</td>
            <td>veNFT positions</td>
          </tr>
        </tbody>
      </table>

      <Callout variant="warning">
        Buy side accepts only <code>id20</code> and <code>erc20</code>. You cannot buy a veNFT or a
        raw tranche through Swap.
      </Callout>

      <h2>Plan types (what the router does)</h2>
      <Diagram title="Sell form → execution plan">
        <div className="flex flex-col gap-3">
          <Row>
            <Node>ERC-20 / ID20</Node>
            <Arrow label="directClSwap" />
            <Node tone="accent">CLSwapRouter</Node>
          </Row>
          <Row>
            <Node>Underlying BTC/MEZO</Node>
            <Arrow label="zapErc20*" />
            <Node tone="accent">Zap: deposit → wrap → CL</Node>
          </Row>
          <Row>
            <Node>Tranche ERC-1155</Node>
            <Arrow label="zapTranche*" />
            <Node tone="accent">Zap: wrap → CL</Node>
          </Row>
          <Row>
            <Node>veNFT</Node>
            <Arrow label="zapVeNftExactInput" />
            <Node tone="accent">Zap: deposit → wrap → CL</Node>
          </Row>
        </div>
      </Diagram>

      <h2>Flow 1 — Swap ID20 tokens (direct CL)</h2>
      <p>
        <strong>Status:</strong> Supported
      </p>
      <p>
        Sell a liquid ID20 (for example <code>avBTCm</code>) for another pool token (for example{" "}
        <code>MUSD</code>) through the concentrated-liquidity router with no Aurove deposit step.
      </p>
      <FlowTable
        rows={[
          {
            label: "Plan type",
            value: (
              <>
                <code>directClSwap</code> → <code>exactInputSingle</code> / <code>exactInput</code>{" "}
                (or exact-output variants)
              </>
            ),
          },
          {
            label: "Router",
            value: (
              <>
                <code>CLSwapRouter</code>
              </>
            ),
          },
          {
            label: "Approval",
            value: (
              <>
                ERC-20 <code>approve</code> of the ID20 to <code>CLSwapRouter</code>
              </>
            ),
          },
          {
            label: "You send",
            value: "ID20 amount (or max-in for exact-output)",
          },
          {
            label: "You receive",
            value: "Buy-side ERC-20 or ID20 in your wallet",
          },
        ]}
      />
      <h3>Steps</h3>
      <ol>
        <li>
          Open <DocRouteLink href="/#swap-interface">Swap</DocRouteLink> and connect a wallet on the
          active network.
        </li>
        <li>
          <strong>Sell</strong> → open the asset picker → under <strong>ERC-20 tokens</strong> /
          liquid assets choose an ID20 marked <em>Liquid ID20</em> (e.g. avBTCm).
        </li>
        <li>
          <strong>Buy</strong> → choose MUSD or another routable ERC-20 / ID20 with a CL path.
        </li>
        <li>Enter amount (or Max). Confirm quote details (route, min received, impact).</li>
        <li>
          <strong>Approve</strong> the ID20 if prompted, then <strong>Review swap</strong> →{" "}
          <strong>Swap</strong>.
        </li>
      </ol>
      <h3>Edge cases</h3>
      <ul>
        <li>
          No CL route → button shows <strong>No route available</strong>.
        </li>
        <li>High impact (≥ 5%) shows an amber warning under the quote.</li>
        <li>Exact-output is allowed for ID20 sells (edit the Buy amount).</li>
      </ul>

      <h2>Flow 2 — Swap plain ERC-20 (e.g. MUSD)</h2>
      <p>
        <strong>Status:</strong> Supported
      </p>
      <p>
        Same <code>directClSwap</code> path as ID20 when both sides are fungible ERC-20s (or ID20)
        already listed on a registered pool route.
      </p>
      <FlowTable
        rows={[
          {
            label: "Example",
            value: "MUSD → avBTCm on the MUSD/avBTCm pool",
          },
          {
            label: "Approval",
            value: "ERC-20 approve of sell token to CLSwapRouter",
          },
          {
            label: "Output",
            value: "Buy token balance increases; sell token decreases",
          },
        ]}
      />
      <h3>Steps</h3>
      <ol>
        <li>Sell → select MUSD (or other ERC-20 with a route).</li>
        <li>Buy → select avBTCm / avMEZOm / another ERC-20.</li>
        <li>Amount → Approve → Review → Swap.</li>
      </ol>

      <h2>Flow 3 — Swap underlying BTC / MEZO (deposit then swap)</h2>
      <p>
        <strong>Status:</strong> Supported
      </p>
      <p>
        Selling <strong>underlying</strong> BTC or MEZO does not swap the raw token on the pool. The
        zap router deposits into the managed tranche, wraps to ID20, then swaps that ID20 along the
        CL path in one transaction.
      </p>
      <FlowTable
        rows={[
          {
            label: "Plan type",
            value: (
              <>
                <code>auroveDepositWrapThenSwap</code>
              </>
            ),
          },
          {
            label: "Router",
            value: (
              <>
                <code>AuroveZapRouter.zapErc20ExactInput</code> (or <code>zapErc20ExactOutput</code>
                )
              </>
            ),
          },
          {
            label: "Approval",
            value: "ERC-20 approve of BTC/MEZO to AuroveZapRouter",
          },
          {
            label: "You send",
            value: "Underlying BTC or MEZO",
          },
          {
            label: "You receive",
            value:
              "Buy-side token only (intermediate ID20 is not left in your wallet from this zap)",
          },
          {
            label: "Side effects",
            value: "Managed vault inventory increases; tranche/ID20 supply accounting updates",
          },
        ]}
      />
      <h3>Steps</h3>
      <ol>
        <li>
          Sell → pick the underlying entry (UI name includes “deposit into …” for managed avBTCm /
          avMEZOm).
        </li>
        <li>Buy → MUSD or another token reachable from the managed ID20 pool path.</li>
        <li>Enter amount → Approve underlying → Review → Swap.</li>
        <li>
          Quote details show{" "}
          <strong>Before swap: Deposits and wraps into ID20 before swapping</strong>.
        </li>
      </ol>
      <h3>Edge cases</h3>
      <ul>
        <li>Requires managed ID20 + pool liquidity for the path after wrap.</li>
        <li>Exact-output is supported for this plan type in code when quoting allows it.</li>
      </ul>

      <h2>Flow 4 — Swap Ledger tranches (wrap then swap)</h2>
      <p>
        <strong>Status:</strong> Supported
      </p>
      <p>
        Sell ERC-1155 tranche shares you already hold. The zap router wraps them to the matching
        ID20, then swaps on CL.
      </p>
      <FlowTable
        rows={[
          {
            label: "Plan type",
            value: (
              <>
                <code>auroveWrapThenSwap</code>
              </>
            ),
          },
          {
            label: "Router",
            value: (
              <>
                <code>AuroveZapRouter.zapTrancheExactInput</code> /{" "}
                <code>zapTrancheExactOutput</code>
              </>
            ),
          },
          {
            label: "Approval",
            value: (
              <>
                ERC-1155 <code>setApprovalForAll</code> of Ledger → AuroveZapRouter
              </>
            ),
          },
          {
            label: "You send",
            value: "Partial or full tranche balance (any amount ≤ balance)",
          },
          {
            label: "You receive",
            value: "Buy-side ERC-20 / ID20",
          },
        ]}
      />
      <h3>Steps</h3>
      <ol>
        <li>
          Hold tranche inventory (from Earn deposit). Confirm under Earn →{" "}
          <strong>Your Liquid Positions</strong> or Swap sell balances.
        </li>
        <li>
          Swap → Sell → group <strong>Ledger tranches</strong> → select managed product tranche.
        </li>
        <li>Enter a partial amount to sell only a fraction of the position.</li>
        <li>Approve Ledger operator if prompted → Review → Swap.</li>
      </ol>
      <Callout variant="info">
        This is the path for <strong>partial</strong> exit of a deposited position: deposit once on
        Earn, then sell any fraction via Swap without redeeming the whole inventory.
      </Callout>

      <h2>Flow 5 — Partial veNFT exit (Earn deposit + tranche swap)</h2>
      <p>
        <strong>Status:</strong> Supported as two composed steps (Earn deposit + Flow 4) · Not a
        single Swap button that sells “part of a veNFT” directly
      </p>
      <p>
        The Swap UI only sells an <em>entire</em> veNFT in one zap (Flow 6). To sell a{" "}
        <strong>fraction</strong> of locked power you must first deposit the veNFT (or lock tokens)
        into Aurove, then sell tranche shares.
      </p>

      <Shot
        src="/docs/swap-flows/02-earn-create-crop.png"
        alt="Earn Create Position card"
        caption="Earn → select avBTCm or avMEZOm → Create Position: Deposit position (veNFT) or Lock tokens. Deposits mint liquid tranche inventory you can later swap."
      />

      <h3>Steps</h3>
      <ol>
        <li>
          Open <DocRouteLink href="/earn">Earn</DocRouteLink> and choose <strong>avBTCm</strong> or{" "}
          <strong>avMEZOm</strong>.
        </li>
        <li>
          <strong>Deposit position</strong> — select your veBTC/veMEZO NFT, approve the NFT for the
          Ledger, deposit; <strong>or Lock tokens</strong> — deposit BTC/MEZO ERC-20 into the
          managed product.
        </li>
        <li>
          Confirm balances under <strong>Your liquid positions</strong> (tranche / liquid product
          inventory).
        </li>
        <li>
          Open Swap → Sell → <strong>Ledger tranches</strong> (or liquid ID20 if you already
          wrapped).
        </li>
        <li>Enter the fraction to sell → Approve → Review → Swap (Flow 4 or Flow 1).</li>
      </ol>
      <FlowTable
        rows={[
          {
            label: "After Earn deposit",
            value: "You hold ERC-1155 tranche shares (and may wrap to ID20)",
          },
          {
            label: "After partial swap",
            value: "Tranche/ID20 balance decreases by the sold amount; buy token increases",
          },
          {
            label: "Remaining position",
            value: "Unsold tranche remains and continues to participate in managed yield",
          },
        ]}
      />

      <h2>Flow 6 — Swap an entire veNFT</h2>
      <p>
        <strong>Status:</strong> Supported · exact-input only
      </p>
      <p>
        Sell a full veBTC or veMEZO NFT in one transaction: deposit into the managed tranche, wrap,
        and swap to the buy token via the zap router.
      </p>
      <FlowTable
        rows={[
          {
            label: "Plan type",
            value: (
              <>
                <code>auroveVeNftThenSwap</code>
              </>
            ),
          },
          {
            label: "Router",
            value: (
              <>
                <code>AuroveZapRouter.zapVeNftExactInput</code>
              </>
            ),
          },
          {
            label: "Approval",
            value: (
              <>
                ERC-721 approve of the veNFT to <code>AuroveZapRouter</code>
              </>
            ),
          },
          {
            label: "Sell amount",
            value: "Fixed to the NFT lock amount (inputs are read-only)",
          },
          {
            label: "Swap type",
            value: "exactInput only — exact-output is rejected in the planner",
          },
          {
            label: "You receive",
            value: "Buy-side ERC-20 / ID20; the veNFT leaves your wallet",
          },
        ]}
      />
      <h3>Steps</h3>
      <ol>
        <li>Hold a veBTC or veMEZO in the connected wallet on the active chain.</li>
        <li>
          Swap → Sell → group <strong>veNFT positions</strong> → select <code>veBTC #…</code> /{" "}
          <code>veMEZO #…</code>.
        </li>
        <li>
          Amount fills automatically from lock size; Buy amount is also read-only for this flow.
        </li>
        <li>Select buy token with a valid route from the managed ID20.</li>
        <li>Approve the NFT → Review → Swap.</li>
      </ol>
      <h3>Edge cases</h3>
      <ul>
        <li>Empty veNFT list if the wallet has no positions or portfolio read fails.</li>
        <li>Cannot reverse a veNFT sell into “buy veNFT” — buy side is fungible only.</li>
        <li>Cannot sell “half” of a veNFT in one swap; use Flow 5 for partial exit.</li>
      </ul>

      <h2>Approvals cheat sheet</h2>
      <table>
        <thead>
          <tr>
            <th>Sell form</th>
            <th>Token</th>
            <th>Spender / operator</th>
            <th>Kind</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>erc20 / id20</td>
            <td>Sell ERC-20</td>
            <td>CLSwapRouter</td>
            <td>ERC-20 allowance</td>
          </tr>
          <tr>
            <td>underlying</td>
            <td>BTC / MEZO</td>
            <td>AuroveZapRouter</td>
            <td>ERC-20 allowance</td>
          </tr>
          <tr>
            <td>tranche</td>
            <td>Ledger</td>
            <td>AuroveZapRouter</td>
            <td>ERC-1155 setApprovalForAll</td>
          </tr>
          <tr>
            <td>venft</td>
            <td>veBTC / veMEZO</td>
            <td>AuroveZapRouter</td>
            <td>ERC-721 approve (tokenId)</td>
          </tr>
        </tbody>
      </table>

      <h2>Common UI states</h2>
      <table>
        <thead>
          <tr>
            <th>Button / panel</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Connect Wallet</td>
            <td>No wallet connected</td>
          </tr>
          <tr>
            <td>Loading markets… / Unable to load markets</td>
            <td>Registry fetch</td>
          </tr>
          <tr>
            <td>No route available / Insufficient liquidity</td>
            <td>No CL path or empty pool path</td>
          </tr>
          <tr>
            <td>Approve …</td>
            <td>Missing allowance / operator approval</td>
          </tr>
          <tr>
            <td>Review swap</td>
            <td>Ready to open confirmation dialog</td>
          </tr>
          <tr>
            <td>Quote details → Before swap</td>
            <td>Zap plan will deposit/wrap before the CL swap</td>
          </tr>
        </tbody>
      </table>

      <h2>Pools powering routes (configured)</h2>
      <ul>
        <li>
          <strong>MUSD / avBTCm</strong> — primary stable ↔ liquid BTC path
        </li>
        <li>
          <strong>avBTCm / avMEZOm</strong> — liquid BTC ↔ liquid MEZO path
        </li>
      </ul>
      <p>
        Multi-hop routes up to the configured max hops (default 3) when a direct pool is missing.
        See also{" "}
        <DocRouteLink href="/docs/liquidity/providing-liquidity">Providing liquidity</DocRouteLink>.
      </p>

      <h2>Limitations (do not assume)</h2>
      <ul>
        <li>Swaps use concentrated-liquidity AMM routes only (not limit orders).</li>
        <li>No buy-side veNFT or tranche purchases in Swap.</li>
        <li>
          Partial veNFT amount is <strong>not</strong> a native swap control; use Earn deposit +
          tranche sell.
        </li>
        <li>veNFT sells are exact-input only (planner rejects exact-output).</li>
        <li>
          Academy points may accrue for qualifying swaps through supported pools; that is separate
          from swap execution (see <DocRouteLink href="/docs/academy/points">Points</DocRouteLink>
          ).
        </li>
      </ul>

      <h2>Related</h2>
      <ul>
        <li>
          <DocRouteLink href="/docs/swap/overview">Swap overview</DocRouteLink> — UI controls
          reference
        </li>
        <li>
          <DocRouteLink href="/docs/swap/fractions">Fractions</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/earn/managed-yield">Managed yield</DocRouteLink> /{" "}
          <DocRouteLink href="/docs/earn/tranches">Tranches</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/protocol/id20">ID20</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/developers/contracts">Contracts</DocRouteLink>
        </li>
      </ul>

      <DocsTabs
        tabs={[
          {
            id: "user",
            label: "User checklist",
            content: (
              <ol className="list-decimal space-y-1.5 pl-5 text-white/70">
                <li>Connect wallet on the correct chain.</li>
                <li>Pick Sell form (ID20, ERC-20, underlying, tranche, or entire veNFT).</li>
                <li>Pick Buy ID20/ERC-20 with a live quote.</li>
                <li>Approve the correct token kind, then Review → Swap.</li>
                <li>For partial ve exit: Earn deposit first, then sell tranche amount.</li>
              </ol>
            ),
          },
          {
            id: "dev",
            label: "Developer",
            content: (
              <>
                <p className="mb-2 text-white/70">Planner entry:</p>
                <CodeBlock
                  language="typescript"
                  filename="features/swap/routing/plan-swap.ts"
                  code={`// Sell forms → plan types
// erc20 | id20     → directClSwap        (CLSwapRouter)
// underlying       → auroveDepositWrapThenSwap (zapErc20*)
// tranche          → auroveWrapThenSwap        (zapTranche*)
// venft            → auroveVeNftThenSwap       (zapVeNftExactInput only)`}
                />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
