import type { ReactNode } from "react";
import { Callout } from "@/components/docs/callout";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { DocsTabs } from "@/components/docs/docs-tabs";

function Shot({
  src,
  alt,
  caption,
  wide,
}: {
  src: string;
  alt: string;
  caption: string;
  wide?: boolean;
}) {
  return (
    <figure className="my-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <div
        className={
          wide
            ? "relative bg-[#0a0e14] px-2 py-3"
            : "relative mx-auto max-w-md bg-[#0a0e14] px-2 py-3 sm:max-w-lg"
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static docs screenshots under /public */}
        <img src={src} alt={alt} className="mx-auto h-auto w-full rounded-xl" />
      </div>
      <figcaption className="border-t border-white/8 px-4 py-2.5 text-[12.5px] leading-relaxed text-white/50">
        {caption}
      </figcaption>
    </figure>
  );
}

function FlowTable({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
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
 * End-to-end Earn guide for users on aurove.xyz.
 */
export function EarnFlowsContent() {
  return (
    <>
      <h1>Earn flows guide</h1>
      <p>
        This guide walks the full <strong>Earn</strong> path in the Aurove app: create a liquid
        position (lock tokens or deposit a veNFT), read balances and rewards, then redeem when the
        weekly settlement window opens.
      </p>

      <Callout variant="info" title="Primary surface">
        Open{" "}
        <DocRouteLink href="/earn" code>
          /earn
        </DocRouteLink>
        . All deposit, claim, and redeem actions for managed products live on this page.
      </Callout>

      <h2>Page map</h2>
      <Shot
        src="/docs/earn-flows/01-earn-overview.png"
        alt="Earn page overview with hero, claimables, gauges, and Create Position"
        caption="Earn layout: hero metrics, Claimables, ID20 gauge rewards, Your Liquid Positions, and the Create Position card."
        wide
      />
      <FlowTable
        rows={[
          {
            label: "Hero",
            value: "Product pitch + available assets, your position count, estimated yield",
          },
          {
            label: "Claimables",
            value: "Tranche / RewardSink claimable amounts aggregated across products",
          },
          {
            label: "ID20 gauge rewards",
            value: "Per-product gauge claim + Claim all (may show Activation required)",
          },
          {
            label: "Your Liquid Positions",
            value: "avBTCm / avMEZOm cards: balances, annualised APR, redemption controls",
          },
          {
            label: "Create Position",
            value: "Deposit position (veNFT) or Lock tokens (BTC / MEZO ERC-20)",
          },
        ]}
      />

      <h2>Prerequisites</h2>
      <ol>
        <li>
          Connect a wallet and switch to the network shown in the app header (Mezo Testnet while the
          public app targets testnet).
        </li>
        <li>
          Hold <strong>BTC</strong> or <strong>MEZO</strong> to lock, or a <strong>veBTC / veMEZO</strong>{" "}
          NFT to deposit.
        </li>
        <li>
          For Academy personalization only, use <strong>Sign In</strong> (Earn deposits do not require
          it).
        </li>
      </ol>

      <h2>Flow 1 — Deposit an existing veNFT</h2>
      <p>
        Use this when you already hold a Mezo Earn lock as a veNFT and want liquid Aurove inventory
        without locking fresh ERC-20.
      </p>
      <Shot
        src="/docs/earn-flows/02-create-deposit-position.png"
        alt="Create Position card in Deposit position mode for BTC"
        caption="Create Position → Deposit position: pick BTC or MEZO, select an existing veNFT, then Deposit position."
      />
      <h3>Steps</h3>
      <ol>
        <li>
          Open <DocRouteLink href="/earn">Earn</DocRouteLink>.
        </li>
        <li>
          On <strong>Create Position</strong>, leave (or select) <strong>Deposit position</strong>.
        </li>
        <li>
          Choose <strong>BTC</strong> (veBTC → avBTCm) or <strong>MEZO</strong> (veMEZO → avMEZOm).
        </li>
        <li>
          Under <strong>Existing position</strong>, select <code>veBTC #…</code> /{" "}
          <code>veMEZO #…</code> (count shows how many are available).
        </li>
        <li>
          Confirm <strong>You will receive</strong>, then <strong>Deposit position</strong> → approve
          the NFT if prompted → confirm the deposit.
        </li>
        <li>
          Refresh <strong>Your Liquid Positions</strong> to see the new avBTCm / avMEZOm balance.
        </li>
      </ol>
      <FlowTable
        rows={[
          {
            label: "On-chain",
            value: (
              <>
                <code>Ledger.depositVeNft</code> after ERC-721 approve to the Ledger
              </>
            ),
          },
          {
            label: "You receive",
            value: "ERC-1155 tranche shares (and liquid product balance in the UI)",
          },
          {
            label: "veNFT",
            value: "Leaves your wallet into Aurove vault custody",
          },
        ]}
      />
      <p>
        Product details: <DocRouteLink href="/docs/earn/vebtc">veBTC</DocRouteLink> ·{" "}
        <DocRouteLink href="/docs/earn/vemezo">veMEZO</DocRouteLink>.
      </p>

      <h2>Flow 2 — Lock BTC tokens</h2>
      <p>
        Convert wallet BTC into a managed liquid position (avBTCm) at the managed epoch bucket (UI:
        4 epochs for BTC).
      </p>
      <Shot
        src="/docs/earn-flows/03-create-lock-tokens-btc.png"
        alt="Create Position Lock tokens mode with BTC amount"
        caption="Create Position → Lock tokens → BTC: enter amount (and optional % slider), review You will receive avBTCm, then Create a liquid position."
      />
      <h3>Steps</h3>
      <ol>
        <li>
          Create Position → <strong>Lock tokens</strong> → <strong>BTC</strong>.
        </li>
        <li>
          Enter an amount (or use the balance percent slider). Confirm balance is sufficient.
        </li>
        <li>
          Check <strong>You will receive</strong> (1 BTC locks to 1 avBTCm exposure in the managed
          product).
        </li>
        <li>
          <strong>Create a liquid position</strong> → approve BTC for the Ledger if needed → confirm
          deposit.
        </li>
      </ol>
      <FlowTable
        rows={[
          {
            label: "On-chain",
            value: (
              <>
                ERC-20 approve + <code>Ledger.depositErc20</code> (veBTC variant, managed epochs)
              </>
            ),
          },
          {
            label: "Managed product",
            value: "avBTCm (Aurove BTC — Managed)",
          },
        ]}
      />

      <h2>Flow 3 — Lock MEZO tokens</h2>
      <p>
        Same card path with <strong>MEZO</strong> selected. Managed max epochs for MEZO is longer
        (UI: 208 epochs). You receive <strong>avMEZOm</strong>.
      </p>
      <Shot
        src="/docs/earn-flows/04-create-lock-tokens-mezo.png"
        alt="Create Position Lock tokens mode for MEZO"
        caption="Lock tokens → MEZO: amount entry and Create a liquid position mint avMEZOm."
      />
      <Callout variant="info">
        Redemption inventory handling differs by variant (BTC can exact-split vault locks; MEZO uses
        discrete selected veNFTs). See{" "}
        <DocRouteLink href="/docs/earn/vemezo">veMEZO</DocRouteLink> and{" "}
        <DocRouteLink href="/docs/earn/tranches">Tranches</DocRouteLink>.
      </Callout>

      <h2>Flow 4 — Your liquid positions</h2>
      <p>
        After a successful deposit, positions appear under <strong>Your Liquid Positions</strong>{" "}
        with balances, reward and annualised APR fields, and redemption status.
      </p>
      <Shot
        src="/docs/earn-flows/05-earn-with-position.png"
        alt="Earn page showing liquid avBTCm and avMEZOm position cards"
        caption="Example liquid balances: avBTCm and avMEZOm cards with Available / Total balance and redemption status."
        wide
      />
      <ul>
        <li>
          <strong>Available balance</strong> — redeemable share of the product (respects redeem
          locks).
        </li>
        <li>
          <strong>Total balance</strong> — full liquid product exposure held.
        </li>
        <li>
          <strong>Annualised APR / Rewards deposited</strong> — latest weekly funding rate
          annualised without compounding
          when available.
        </li>
        <li>
          <strong>Redemption</strong> row — either waiting for the window or open for redeem.
        </li>
      </ul>

      <h2>Flow 5 — Claimables and ID20 gauges</h2>
      <Shot
        src="/docs/earn-flows/07-claimables-gauges.png"
        alt="Claimables and ID20 gauge rewards panels on Earn"
        caption="Claimables aggregates RewardSink balances; ID20 gauge rewards show per-wrapper claim state (including Activation required)."
        wide
      />
      <DocsTabs
        tabs={[
          {
            id: "claimables",
            label: "Claimables",
            content: (
              <ul className="list-disc space-y-1 pl-5 text-white/70">
                <li>Shows aggregated rewards across held liquid tranches.</li>
                <li>
                  Claim runs <code>claimRewards</code> on each product RewardSink that has a balance.
                </li>
                <li>Empty state: “No claimable rewards found across your fraction tranches.”</li>
              </ul>
            ),
          },
          {
            id: "gauges",
            label: "ID20 gauges",
            content: (
              <ul className="list-disc space-y-1 pl-5 text-white/70">
                <li>Per liquid ID20 (avBTCm / avMEZOm) gauge accounting.</li>
                <li>
                  <strong>Activation required</strong> means the gauge account is not active yet
                  (activation can also occur via LP-related flows).
                </li>
                <li>
                  <strong>Claim all</strong> batches claim steps for every active gauge with a
                  balance.
                </li>
              </ul>
            ),
          },
        ]}
      />
      <p>
        Background on yield routing:{" "}
        <DocRouteLink href="/docs/earn/managed-yield">Managed yield</DocRouteLink>.
      </p>

      <h2>Flow 6 — Redeem in the settlement window</h2>
      <p>
        Redemptions are only allowed during the weekly settlement window (opens{" "}
        <strong>10 hours</strong> into each epoch, lasts <strong>6 hours</strong>). When the window
        is open, position cards show <strong>Redemption window open</strong> and expand to redeem
        controls.
      </p>
      <Shot
        src="/docs/earn-flows/08-settlement-window-redeem-full.png"
        alt="Liquid positions showing Redemption window open"
        caption="During settlement: each product card shows Redemption window open. Expand with + to set amount / inventory and redeem."
        wide
      />
      <h3>Steps</h3>
      <ol>
        <li>Confirm the UI shows Redemption window open (not “Waiting for weekly settlement window”).</li>
        <li>
          Expand the product card redemption section.
        </li>
        <li>
          <strong>BTC (avBTCm)</strong> — enter a redeem amount (editable; vault may split locks).
        </li>
        <li>
          <strong>MEZO (avMEZOm)</strong> — select vault veNFTs to release; amount follows selected
          inventory.
        </li>
        <li>
          Submit redeem → confirm. Shares burn and underlying inventory returns per Ledger/Vault
          rules.
        </li>
      </ol>
      <FlowTable
        rows={[
          {
            label: "On-chain",
            value: (
              <>
                <code>Ledger.redeem</code> (only inside settlement window)
              </>
            ),
          },
          {
            label: "Window",
            value: "10h after epoch start → +6h (weekly)",
          },
          {
            label: "Redeem locks",
            value:
              "Units minted during a fee-change freeze may be locked from the next settlement window",
          },
        ]}
      />

      <h2>Flow 7 — Outside the window</h2>
      <p>
        Outside settlement, redemption is disabled. Cards show{" "}
        <strong>Waiting for weekly settlement window</strong> (or similar await labels). Deposits and
        claims still work.
      </p>
      <Shot
        src="/docs/earn-flows/09-await-redemption-window.png"
        alt="Liquid positions waiting for weekly settlement window"
        caption="Outside settlement: Redemption row shows Waiting for weekly settlement window; Create Position remains available."
        wide
      />

      <h2>Limitations</h2>
      <ul>
        <li>Cannot redeem outside the settlement window.</li>
        <li>Partial veNFT exit without depositing first is a Swap-side flow (tranche sell), not Earn redeem.</li>
        <li>Gauge activation may require separate actions before gauge rewards accrue.</li>
        <li>Annualised APR is based on the latest weekly funding and is not a guaranteed rate.</li>
      </ul>

      <h2>Related</h2>
      <ul>
        <li>
          <DocRouteLink href="/docs/earn/managed-yield">Managed yield</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/earn/vebtc">veBTC</DocRouteLink> ·{" "}
          <DocRouteLink href="/docs/earn/vemezo">veMEZO</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/earn/tranches">Tranches</DocRouteLink>
        </li>
        <li>
          <DocRouteLink href="/docs/swap/flows">Swap flows</DocRouteLink> (sell liquid inventory /
          partial exit)
        </li>
        <li>
          <DocRouteLink href="/docs/protocol/ledger">Ledger</DocRouteLink> ·{" "}
          <DocRouteLink href="/docs/protocol/vaults">Vaults</DocRouteLink>
        </li>
      </ul>
    </>
  );
}
