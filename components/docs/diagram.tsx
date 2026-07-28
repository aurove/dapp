import type { ReactNode } from "react";
import { cn } from "@ui";

export function Diagram({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "my-6 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]",
        className,
      )}
    >
      {title ? (
        <figcaption className="border-b border-white/8 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
          {title}
        </figcaption>
      ) : null}
      <div className="overflow-x-auto p-4 sm:p-5">{children}</div>
    </figure>
  );
}

function Node({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "muted";
}) {
  return (
    <div
      className={cn(
        "min-w-[7.5rem] rounded-xl border px-3 py-2 text-center text-[12px] font-medium leading-snug",
        tone === "default" && "border-white/12 bg-[#0d1219] text-white/85",
        tone === "accent" && "border-[#d2a45f]/40 bg-[#d2a45f]/12 text-[#f0e2c8]",
        tone === "muted" && "border-white/8 bg-white/[0.03] text-white/55",
      )}
    >
      {children}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-white/35">
      <span className="text-lg leading-none">→</span>
      {label ? <span className="mt-0.5 max-w-[5.5rem] text-center text-[10px] leading-tight">{label}</span> : null}
    </div>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-2">{children}</div>;
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-w-max flex-wrap items-center justify-center gap-2">{children}</div>;
}

export const DiagramParts = { Node, Arrow, Stack, Row };

/** High-level Aurove architecture */
export function ArchitectureDiagram() {
  return (
    <Diagram title="Aurove architecture">
      <div className="flex flex-col items-center gap-4">
        <Row>
          <Node tone="accent">User / Wallet</Node>
        </Row>
        <div className="text-white/30">↓</div>
        <Row>
          <Node>Earn</Node>
          <Node>Swap</Node>
          <Node>Liquidity</Node>
          <Node>Academy</Node>
        </Row>
        <div className="text-white/30">↓</div>
        <Row>
          <Node tone="accent">AuroveZapRouter</Node>
          <Node tone="accent">Ledger</Node>
        </Row>
        <div className="text-white/30">↓</div>
        <Row>
          <Stack>
            <Node>Vault</Node>
            <Node tone="muted">VeNftManager</Node>
            <Node tone="muted">RewardSink</Node>
          </Stack>
          <Arrow label="wrap" />
          <Stack>
            <Node>ID20 ERC20</Node>
            <Node tone="muted">Id20Gauge</Node>
          </Stack>
          <Arrow label="trade / LP" />
          <Stack>
            <Node>CL Pools</Node>
            <Node tone="muted">Position NFT</Node>
          </Stack>
        </Row>
        <div className="text-white/30">↓</div>
        <Row>
          <Node tone="muted">Mezo Earn · veBTC / veMEZO</Node>
        </Row>
      </div>
    </Diagram>
  );
}

/** veNFT → tranche → ID20 */
export function VeToId20FlowDiagram() {
  return (
    <Diagram title="veNFT → tranche → ID20">
      <Row>
        <Node>veBTC / veMEZO</Node>
        <Arrow label="deposit" />
        <Node tone="accent">Ledger ERC1155</Node>
        <Arrow label="wrap" />
        <Node tone="accent">avBTCm / avMEZOm</Node>
        <Arrow label="activate" />
        <Node>Id20Gauge</Node>
      </Row>
    </Diagram>
  );
}

export function VaultLifecycleDiagram() {
  return (
    <Diagram title="Vault lifecycle">
      <Row>
        <Node>Deposit</Node>
        <Arrow />
        <Node tone="accent">Vault custody</Node>
        <Arrow label="depositManaged" />
        <Node>Mezo managed ve</Node>
        <Arrow label="settlement window" />
        <Node tone="accent">Redeem</Node>
      </Row>
    </Diagram>
  );
}

export function LiquidityFlowDiagram() {
  return (
    <Diagram title="Liquidity flow">
      <Row>
        <Node>Funding sources</Node>
        <Arrow label="zap" />
        <Node tone="accent">ZapRouter</Node>
        <Arrow />
        <Node>CL mint</Node>
        <Arrow />
        <Node>Fees + points</Node>
      </Row>
      <p className="mt-3 text-center text-[11px] text-white/40">
        Sources: ERC-20 · veNFT · tranche · ID20 · MUSD
      </p>
    </Diagram>
  );
}

export function RewardFlowDiagram() {
  return (
    <Diagram title="Reward flow">
      <div className="flex flex-col items-center gap-3">
        <Row>
          <Node tone="muted">Mezo RewardsDistributor</Node>
          <Arrow label="claimRebases" />
          <Node>VeNftManager</Node>
          <Arrow />
          <Node tone="accent">RewardSink</Node>
        </Row>
        <div className="text-white/30">↓</div>
        <Row>
          <Node>Tranche claimables</Node>
          <Arrow label="claimRewards" />
          <Node tone="accent">AuroveId20</Node>
          <Arrow label="notify" />
          <Node>Id20Gauge</Node>
        </Row>
      </div>
    </Diagram>
  );
}
