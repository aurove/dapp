import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";
import { ArchitectureDiagram } from "@/components/docs/diagram";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import {
  LEDGER_COLLECTION,
  MEZO_CHAIN_ID,
  MEZO_EXPLORER,
  MEZO_RPC_HTTP,
  TRANCHE_PRODUCTS,
} from "@/lib/docs/contracts-reference";
import type { DocPageDefinition } from "@/lib/docs/types";
import { AddressTable, FullDeploymentTables, ProductionStatus } from "./shared";

const READ_SUPPLY_EXAMPLE = `import { createPublicClient, http } from "viem";
import { getId20FactoryAbi, getLedgerAbi } from "@/contracts/earn";
import { mezoMainnetChain } from "@/lib/config/chains";
import { MEZO_CHAIN_ID, TRANCHE_PRODUCTS } from "@/lib/docs/contracts-reference";
import { docsExampleAddresses } from "@/lib/docs/examples";

const client = createPublicClient({
  chain: mezoMainnetChain,
  transport: http(mezoMainnetChain.rpcUrls.default.http[0]),
});
const { ledger, id20Factory } = docsExampleAddresses();
const avBtcTrancheId = BigInt(TRANCHE_PRODUCTS[0].trancheId);

const supply = await client.readContract({
  address: ledger,
  abi: getLedgerAbi(MEZO_CHAIN_ID)!,
  functionName: "totalSupply",
  args: [avBtcTrancheId],
});

const wrapper = await client.readContract({
  address: id20Factory,
  abi: getId20FactoryAbi(MEZO_CHAIN_ID)!,
  functionName: "getId20",
  args: [avBtcTrancheId],
});`;

const DEPOSIT_EXAMPLE = `import { getAddress, type Address } from "viem";
import { depositErc20CalldataArgs } from "@/lib/docs/examples";

// Ledger.depositErc20(uint8 variant, uint256 epochs, uint256 amount, address to)
// variant 1 = BTC, 2 = MEZO. epochs must be the managed sentinel (4 or 208);
// the Ledger ignores the value and mints the managed tranche.
const args = depositErc20CalldataArgs({
  variant: 1,
  amount: 10n ** 16n, // 0.01 BTC, 18 decimals
  receiver: getAddress("0x0000000000000000000000000000000000000001") as Address,
});
// Approve BTC for the Ledger before sending depositErc20(...args).`;

const WRAP_EXAMPLE = `import { wrapTrancheTransferData } from "@/lib/docs/examples";

// No wrap() method exists. Transfer ERC-1155 tranche units to the ID20 address.
// data = 0x mints to the ERC-1155 sender.
// data = abi.encode(recipient) mints to that recipient.
const dataToSelf = wrapTrancheTransferData();
const dataToRecipient = wrapTrancheTransferData(
  "0x0000000000000000000000000000000000000001",
);`;

export const DEVELOPER_PAGES: DocPageDefinition[] = [
  {
    slug: "developers/chain",
    title: "Chain configuration",
    description: "Mezo mainnet identifiers, RPC, explorer, and token decimals for integrators.",
    tags: ["developers", "chain", "31612"],
    searchText: "chain configuration mezo mainnet 31612 rpc explorer btc decimals wagmi viem",
    Content: () => (
      <>
        <h1>Chain configuration</h1>
        <p>
          Production Aurove is deployed on Mezo mainnet only. Do not use localhost or Mezo testnet
          addresses with this documentation.
        </p>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Chain id</td>
              <td>
                <code>{MEZO_CHAIN_ID}</code>
              </td>
            </tr>
            <tr>
              <td>Name</td>
              <td>Mezo Mainnet</td>
            </tr>
            <tr>
              <td>Native currency</td>
              <td>BTC, 18 decimals</td>
            </tr>
            <tr>
              <td>Public RPC</td>
              <td>
                <code>{MEZO_RPC_HTTP}</code>
              </td>
            </tr>
            <tr>
              <td>Explorer</td>
              <td>
                <a href={MEZO_EXPLORER} target="_blank" rel="noreferrer">
                  {MEZO_EXPLORER}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          The dApp registry key for these contracts is <code>31612</code>. Read ABIs from{" "}
          <code>getLedgerAbi(31612)</code> and related helpers rather than pasting stale JSON.
        </p>
        <p>
          Canonical addresses:{" "}
          <DocRouteLink href="/docs/developers/deployment">Deployment reference</DocRouteLink>
          . Events:{" "}
          <DocRouteLink href="/docs/developers/events">Events, errors, and indexing</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "developers/deployment",
    title: "Deployment reference",
    description:
      "Canonical Mezo mainnet addresses, contract types, explorer Contract tabs, and Blockscout versus Sourcify verification.",
    tags: ["developers", "addresses", "verification", "blockscout", "sourcify"],
    searchText:
      "deployment reference addresses verified blockscout sourcify proxy implementation beacon",
    Content: () => (
      <>
        <h1>Deployment reference</h1>
        <p>
          This is the only address table. Other pages link here instead of repeating literals.
          Explorer links open the Mezo Blockscout <strong>Contract</strong> tab for that exact
          address.
        </p>
        <Callout variant="info" title="How verification is labelled">
          <ul>
            <li>
              <strong>Verified on Blockscout</strong> — source is verified on{" "}
              <a href={MEZO_EXPLORER} target="_blank" rel="noreferrer">
                explorer.mezo.org
              </a>
              . If Sourcify also matches, a secondary Sourcify link is shown. The Verified tag still
              points at Blockscout.
            </li>
            <li>
              <strong>Verified on Sourcify</strong> — source is verified on Sourcify for chain{" "}
              {MEZO_CHAIN_ID} and this exact address, and is <em>not</em> verified on Blockscout.
            </li>
            <li>
              <strong>Not independently verified</strong> — neither service verifies that address.
              The two CL pool clones are in this category; their CLPool implementation is verified on
              Blockscout.
            </li>
          </ul>
        </Callout>
        <FullDeploymentTables />
        <h2>Proxy map</h2>
        <ul>
          <li>
            Ledger UUPS proxy → Ledger implementation. Vault UUPS proxy → Vault implementation.
          </li>
          <li>
            Both managers are beacon proxies of the VeNftManager beacon. Both sinks are beacon
            proxies of the RewardSink beacon. Beacons are owned by the Ledger.
          </li>
          <li>ID20 wrappers, gauges, factory, zap router, and adapters are not proxies.</li>
          <li>The two Aurove pools are CLFactory clones of the CLPool implementation.</li>
          <li>
            veBTC, veMEZO, pool Voter, and BoostVoter are Mezo transparent proxies. Their current
            implementations are listed in the tables above and are verified on Blockscout.
          </li>
        </ul>
        <h2>Discoverable instances</h2>
        <ul>
          <li>
            Managers / sinks: <code>Vault.managerOfTranche(id)</code>,{" "}
            <code>Vault.rewardSinkOfTranche(id)</code>.
          </li>
          <li>
            ID20: <code>Id20Factory.getId20(trancheId)</code>.
          </li>
          <li>
            Id20Gauge: <code>AuroveId20.rewardSink()</code>.
          </li>
          <li>
            Zap adapters: <code>AuroveZapRouter.swapAdapter()</code> /{" "}
            <code>liquidityAdapter()</code>.
          </li>
          <li>
            Pools: <code>CLFactory.getPool(tokenA, tokenB, 200)</code>.
          </li>
        </ul>
        <ProductionStatus />
      </>
    ),
  },
  {
    slug: "developers/architecture",
    title: "Architecture",
    description: "Contract dependency graph, token standards, and discovery paths.",
    tags: ["developers", "architecture"],
    searchText: "architecture dependency graph ledger vault factory zap cl pool",
    Content: () => (
      <>
        <h1>Architecture</h1>
        <ArchitectureDiagram />
        <h2>Call graph for a user deposit</h2>
        <ol>
          <li>User approves BTC/MEZO or the veNFT to the Ledger.</li>
          <li>
            Ledger pulls the asset, creates or accepts a veNFT, and <code>safeTransferFrom</code>s it
            to the Vault.
          </li>
          <li>
            Vault <code>onERC721Received</code> calls Mezo <code>depositManaged</code> into the
            variant manager.
          </li>
          <li>Ledger mints ERC-1155 units to the receiver and hooks the RewardSink.</li>
        </ol>
        <h2>Optional wrap</h2>
        <p>
          User or zap <code>safeTransferFrom</code>s ERC-1155 to the ID20. The wrapper mints ERC-20
          and keeps the ERC-1155 as backing. Unwrap reverses that. The Id20Gauge tracks eligibility
          without taking custody of the ERC-20 except when harvested rewards are minted to the gauge.
        </p>
        <h2>Swap and LP</h2>
        <p>
          AuroveZapRouter holds user funds for the transaction, delegatecalls SwapAdapter or
          LiquidityAdapter, talks to CLSwapRouter / NonfungiblePositionManager, and refunds leftovers.
        </p>
        <p>
          User-facing behaviour: <DocRouteLink href="/docs/guides/what-is-aurove">Guides</DocRouteLink>
          .
        </p>
      </>
    ),
  },
  {
    slug: "developers/earn",
    title: "Earn integration",
    description:
      "Deposit, wrap, unwrap, claim, and redeem against the deployed Ledger, sinks, and ID20 wrappers.",
    tags: ["developers", "earn", "deposit", "redeem", "wrap"],
    searchText:
      "earn integration depositErc20 depositVeNft redeem unwrap claimRebases activate claimRewards",
    Content: () => (
      <>
        <h1>Earn integration</h1>
        <ProductionStatus />
        <h2>Tranche ids</h2>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>variant</th>
              <th>epochs to pass</th>
              <th>id minted</th>
            </tr>
          </thead>
          <tbody>
            {TRANCHE_PRODUCTS.map((product) => (
              <tr key={product.product}>
                <td>{product.symbol}</td>
                <td>{product.variant}</td>
                <td>{product.epochs}</td>
                <td>
                  <code>{product.trancheId}</code> ({product.trancheIdHex})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Always pass the managed sentinel as <code>epochs</code>. The ABI still includes the
          argument; the implementation ignores it and mints the managed id. Collection metadata:{" "}
          {LEDGER_COLLECTION.name} / {LEDGER_COLLECTION.symbol}. Read the wrapper tranche with{" "}
          <code>AuroveId20.id()</code> (not <code>trancheId()</code>). The linked Id20Gauge is{" "}
          <code>rewardSink()</code> on the wrapper and <code>id20()</code> on the gauge.
        </p>
        <h2>Required approvals</h2>
        <ul>
          <li>
            ERC-20 deposit: approve BTC or MEZO for the Ledger, amount in 18-decimal wei.
          </li>
          <li>veNFT deposit: approve the specific token id, or setApprovalForAll, for the Ledger.</li>
          <li>
            Wrap: <code>setApprovalForAll(id20, true)</code> on the Ledger if the wrapper is not
            already an operator.
          </li>
        </ul>
        <h2>Mutative sequence</h2>
        <ol>
          <li>
            <code>depositErc20</code> or <code>depositVeNft</code> → ERC-1155 to <code>to</code>.
          </li>
          <li>
            Optional wrap: ERC-1155 <code>safeTransferFrom</code> to the ID20.
          </li>
          <li>
            Optional <code>Id20Gauge.activate()</code> (permanent).
          </li>
          <li>
            Harvest: <code>Ledger.claimRebases(trancheId, tokenIds)</code> then sink{" "}
            <code>claimRewards</code> and/or <code>AuroveId20.claimRewards()</code>, then{" "}
            <code>Id20Gauge.claim(receiver)</code>.
          </li>
          <li>
            Exit: <code>unwrap(amount, to)</code> then <code>redeem(trancheId, amount, receiver, tokenIds)</code>.
          </li>
        </ol>
        <h2>Read-only examples</h2>
        <CodeBlock language="ts" filename="read-tranche.ts" code={READ_SUPPLY_EXAMPLE} />
        <p>
          The same helpers live in <code>dapp/lib/docs/examples.ts</code> and are type-checked with
          the dApp.
        </p>
        <h2>Constructing a deposit</h2>
        <CodeBlock language="ts" filename="deposit-erc20.ts" code={DEPOSIT_EXAMPLE} />
        <h2>Wrapping</h2>
        <CodeBlock language="ts" filename="wrap-data.ts" code={WRAP_EXAMPLE} />
        <Callout variant="important" title="Do not call admin functions">
          <code>proposeFeeConfig</code>, beacon upgrades, maintainer setters, and{" "}
          <code>withdrawTokens</code> are restricted. Integrators should not expose them as user
          actions.
        </Callout>
        <AddressTable
          ids={[
            "ledger",
            "vault",
            "avbtcm-manager",
            "avmezom-manager",
            "avbtcm-sink",
            "avmezom-sink",
            "id20-factory",
            "avbtcm",
            "avmezom",
            "avbtcm-gauge",
            "avmezom-gauge",
          ]}
        />
        <p>
          Matching UI: <DocRouteLink href="/docs/guides/create-position">Create a liquid position</DocRouteLink>
          .
        </p>
      </>
    ),
  },
  {
    slug: "developers/liquidity",
    title: "Swap and liquidity integration",
    description:
      "Zap router swap and concentrated-liquidity entrypoints, pool discovery, and Mezo CL dependencies.",
    tags: ["developers", "zap", "swap", "cl"],
    searchText:
      "zapErc20ExactInput addLiquidityErc20Erc20 increaseLiquidity CLSwapRouter position manager",
    Content: () => (
      <>
        <h1>Swap and liquidity integration</h1>
        <p>
          The production dApp routes swaps and new LP through <strong>AuroveZapRouter</strong> when
          the input is BTC, MEZO, a veNFT, or tranche units. Plain ID20 / MUSD swaps can go directly
          through CLSwapRouter.
        </p>
        <h2>Swap functions</h2>
        <ul>
          <li>
            <code>zapErc20ExactInput</code> / <code>zapErc20ExactOutput</code>
          </li>
          <li>
            <code>zapVeNftExactInput</code> / <code>zapVeNftExactOutput</code>
          </li>
          <li>
            <code>zapTrancheExactInput</code> / <code>zapTrancheExactOutput</code>
          </li>
        </ul>
        <p>
          Routes are validated against CLFactory. Exact-output leftovers return as ID20. Deadline
          expiry reverts with <code>DeadlineExpired</code>.
        </p>
        <h2>Liquidity functions</h2>
        <p>
          <code>addLiquidity*</code> and <code>increaseLiquidity*</code> exist for ERC-20 × ERC-20,
          ERC-20 × veNFT, veNFT × veNFT, ERC-20 × tranche, veNFT × tranche, and tranche × tranche
          (both orders). ERC-20 with <code>epochs == 0</code> stays plain; nonzero epochs must match
          the Ledger-returned managed id.
        </p>
        <p>
          New positions use the first factory-listed tick spacing that has a live pool (production
          Aurove pools use 200). Increase requires a caller-owned <code>positionTokenId</code> for
          the same pair.
        </p>
        <h2>Collect, decrease, burn</h2>
        <p>
          Those run on NonfungiblePositionManager, not the zap router: <code>collect</code>,{" "}
          <code>decreaseLiquidity</code>, <code>burn</code>.
        </p>
        <h2>Mezo CL gauges</h2>
        <p>
          There is no Aurove helper that creates a Mezo pool gauge. <code>Voter.createPoolGauge</code>{" "}
          is a Mezo function and currently has nothing to return for these pools. Do not publish
          gauge or bribe addresses that are not on-chain.
        </p>
        <AddressTable
          ids={[
            "zap-router",
            "swap-adapter",
            "liquidity-adapter",
            "cl-swap-router",
            "npm",
            "cl-factory",
            "pool-musd-avbtcm",
            "pool-avbtcm-avmezom",
            "voter",
          ]}
        />
        <p>
          UI: <DocRouteLink href="/docs/guides/swap">Swap</DocRouteLink> and{" "}
          <DocRouteLink href="/docs/guides/liquidity">Provide liquidity</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "developers/events",
    title: "Events, errors, and indexing",
    description:
      "Events to index, important revert conditions, and cache considerations for Aurove integrators.",
    tags: ["developers", "events", "errors", "indexing"],
    searchText:
      "VeNftDeposited VeNftWithdrawn RebaseClaimed WrappedFromReceived Unwrapped LiquidityAdded errors",
    Content: () => (
      <>
        <h1>Events, errors, and indexing</h1>
        <h2>Events worth indexing</h2>
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Event</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ledger</td>
              <td>
                <code>VeNftDeposited</code>
              </td>
              <td>New liquid position minted.</td>
            </tr>
            <tr>
              <td>Ledger</td>
              <td>
                <code>ExpiredVeNftRelocked</code>
              </td>
              <td>Expired lock was withdrawn and replaced before custody.</td>
            </tr>
            <tr>
              <td>Ledger</td>
              <td>
                <code>VeNftWithdrawn</code>
              </td>
              <td>Redemption released inventory. BTC split may emit a new id.</td>
            </tr>
            <tr>
              <td>Ledger</td>
              <td>
                <code>RebaseClaimed</code>
              </td>
              <td>Inventory growth minted to the sink.</td>
            </tr>
            <tr>
              <td>AuroveId20</td>
              <td>
                <code>WrappedFromReceived</code> / <code>Unwrapped</code>
              </td>
              <td>ERC-20 supply changes.</td>
            </tr>
            <tr>
              <td>AuroveId20</td>
              <td>
                <code>RewardsHarvested</code>
              </td>
              <td>Upstream units moved into the Id20Gauge.</td>
            </tr>
            <tr>
              <td>Zap router</td>
              <td>
                <code>LiquidityAdded</code> / <code>LiquidityIncreased</code>
              </td>
              <td>CL position minted or increased through the zap.</td>
            </tr>
          </tbody>
        </table>
        <p>
          Also index ERC-1155 <code>TransferSingle</code> on the Ledger and ERC-20{" "}
          <code>Transfer</code> on each ID20. Reward eligibility is not fully described by transfers;
          read gauge <code>accountState</code> for activation, credit, and claimable amounts.
        </p>
        <h2>Important revert conditions</h2>
        <ul>
          <li>
            <code>ZeroAmount</code> / <code>ZeroAddress</code> / <code>ZeroReceiver</code>
          </li>
          <li>
            <code>GrantBackedVeNft</code> — vesting still active
          </li>
          <li>
            <code>UnsupportedVeNft</code> / <code>UnsupportedAsset</code> / <code>UnsupportedId</code>
          </li>
          <li>
            <code>InsufficientRedeemInventory</code> / Mezo managed-withdraw reverts
          </li>
          <li>
            <code>UnsettledCredit</code> — unwrap/burn of credit-classified ID20
          </li>
          <li>
            <code>NotInitialized</code> — gauge claim before activate
          </li>
          <li>
            <code>NoRewards</code> / <code>NoRewardsClaimed</code> / <code>RewardAmountMismatch</code>
          </li>
          <li>
            Zap: <code>DeadlineExpired</code>, <code>InvalidRoute</code>,{" "}
            <code>UnsupportedPool</code>, <code>InsufficientOutput</code>
          </li>
        </ul>
        <h2>Cache and indexing notes</h2>
        <ul>
          <li>
            Do not cache <code>mTokenId</code>, fee config, or pool gauges as constants. Read them.
          </li>
          <li>
            Wrapper sink addresses are immutable after <code>createId20</code>. Factory{" "}
            <code>getId20</code> is the discovery path.
          </li>
          <li>
            Never treat <code>claimRebases(uint256[])</code> as a working harvest. It is a no-op.
          </li>
          <li>
            There is no public Aurove REST API for protocol state. Academy HTTP routes require a
            signed session and are not a settlement interface.
          </li>
        </ul>
      </>
    ),
  },
];
