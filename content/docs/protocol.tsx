import { Callout } from "@/components/docs/callout";
import {
  ArchitectureDiagram,
  LiquidityFlowDiagram,
  RewardFlowDiagram,
  VaultLifecycleDiagram,
  VeToId20FlowDiagram,
} from "@/components/docs/diagram";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { LEDGER_COLLECTION, TRANCHE_PRODUCTS } from "@/lib/docs/contracts-reference";
import type { DocPageDefinition } from "@/lib/docs/types";
import { AddressTable, ProductionStatus } from "./shared";

export const PROTOCOL_PAGES: DocPageDefinition[] = [
  {
    slug: "protocol/overview",
    title: "How Aurove works",
    description:
      "Aurove custodies Mezo Earn veNFTs, issues liquid tranche claims, and optional ERC-20 wrappers for trading.",
    tags: ["protocol", "overview", "mezo earn", "tigris"],
    searchText:
      "how aurove works ledger vault id20 zap mezo earn tigris managed tranche purpose scope",
    Content: () => (
      <>
        <h1>How Aurove works</h1>
        <p>
          Aurove is a liquid claim layer on <strong>Mezo Earn</strong>. Users deposit BTC, MEZO, or
          an existing veNFT. Aurove locks that value in a Mezo <em>managed</em> position owned by an
          Aurove manager, then mints fungible units the user can hold, wrap, swap, or redeem.
        </p>
        <p>
          The protocol does not replace Mezo. Voting-escrow accounting, managed deposit and
          withdraw, distributors, voters, and concentrated-liquidity pools are Mezo / Tigris
          contracts. Aurove owns the Ledger, Vault, managers, sinks, ID20 wrappers, gauges, factory,
          and zap router.
        </p>
        <ArchitectureDiagram />
        <h2>Scope of the production deployment</h2>
        <ul>
          <li>Two products only: managed BTC (avBTCm) and managed MEZO (avMEZOm).</li>
          <li>
            <code>Ledger.depositErc20</code> and <code>Ledger.depositVeNft</code> still take an{" "}
            <code>epochs</code> argument, but the implementation ignores it and always mints the
            managed sentinel tranche. The dApp and zap still pass <code>4</code> (BTC) or{" "}
            <code>208</code> (MEZO). On the zap router, <code>epochs == 0</code> means “leave this
            ERC-20 as a plain token,” which is a different flag from Ledger deposit.
          </li>
          <li>No duration-bucket products, no Aurove settlement window, no streaming reward contract.</li>
          <li>ID20 wrappers and Id20Gauges exist for those two tranches.</li>
          <li>Two CL pools exist: MUSD / avBTCm and avBTCm / avMEZOm.</li>
        </ul>
        <ProductionStatus />
        <h2>Layers</h2>
        <ul>
          <li>
            <strong>Core</strong> — Ledger (ERC-1155), Vault (custody), VeNftManager, RewardSink.
            Upgradeable.
          </li>
          <li>
            <strong>ID20</strong> — factory, ERC-20 wrappers, Id20Gauges, zap router and adapters.
            Immutable.
          </li>
          <li>
            <strong>External</strong> — veBTC, veMEZO, BTC, MEZO, MUSD, CL factory/router/position
            manager, pool Voter.
          </li>
        </ul>
        <VeToId20FlowDiagram />
        <p>
          Addresses:{" "}
          <DocRouteLink href="/docs/developers/deployment">Deployment reference</DocRouteLink>.
          Roles:{" "}
          <DocRouteLink href="/docs/protocol/roles">Upgradeability and roles</DocRouteLink>.
          Integrators:{" "}
          <DocRouteLink href="/docs/developers/architecture">Architecture</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "protocol/assets",
    title: "Assets and representations",
    description:
      "Supported tokens, tranche ids, ERC-1155 units, and ID20 ERC-20 wrappers in the production deployment.",
    tags: ["protocol", "assets", "tranche", "id20"],
    searchText:
      "assets representations tranche id 65540 131280 avBTCm avMEZOm id20 wrapping backing surplus",
    Content: () => (
      <>
        <h1>Assets and representations</h1>
        <h2>Underlying and Mezo Earn NFTs</h2>
        <AddressTable ids={["btc", "mezo", "musd", "vebtc", "vemezo"]} />
        <p>All of the above use 18 decimals except the veNFTs, which are ERC-721 positions.</p>
        <h2>Production tranches</h2>
        <p>
          Tranche ids are packed as <code>(variant &lt;&lt; 16) | epochs</code>. BTC variant is{" "}
          <code>1</code>, MEZO variant is <code>2</code>. The managed sentinel is the maximum epoch
          for that variant: BTC <code>4</code>, MEZO <code>208</code>.
        </p>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th>Epochs</th>
              <th>Tranche id</th>
              <th>Hex</th>
              <th>Name / symbol</th>
            </tr>
          </thead>
          <tbody>
            {TRANCHE_PRODUCTS.map((product) => (
              <tr key={product.product}>
                <td>{product.product}</td>
                <td>{product.variant}</td>
                <td>{product.epochs}</td>
                <td>
                  <code>{product.trancheId}</code>
                </td>
                <td>
                  <code>{product.trancheIdHex}</code>
                </td>
                <td>
                  {product.erc1155Name} / {product.symbol}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The Ledger collection is <strong>{LEDGER_COLLECTION.name}</strong> (
          <code>{LEDGER_COLLECTION.symbol}</code>), 18 decimals, with token URI{" "}
          <code>{LEDGER_COLLECTION.uri}</code>.
        </p>
        <h2>ERC-1155 versus ID20</h2>
        <ul>
          <li>
            <strong>ERC-1155 tranche units</strong> are the canonical claim. Redemption burns these
            units.
          </li>
          <li>
            <strong>ID20 / ERC-20 wrappers</strong> are optional. They mint 1:1 when the wrapper
            receives the matching ERC-1155 id, and unwrap burns ERC-20 to return the same ERC-1155
            amount.
          </li>
        </ul>
        <p>
          Solvency on a wrapper is <code>totalSupply() &lt;= backingBalance()</code>. Surplus
          ERC-1155 sitting on the wrapper is not used to mint and has no recovery function.
        </p>
        <h2>What is not deployed as a user product</h2>
        <ul>
          <li>
            Non-managed tranche ids remain encodable but deposits never mint them. The normal vault
            is unset, so redeem or ID20 creation for those ids reverts.
          </li>
          <li>No additional wrappers beyond avBTCm and avMEZOm.</li>
        </ul>
        <AddressTable ids={["avbtcm", "avmezom", "avbtcm-gauge", "avmezom-gauge"]} />
      </>
    ),
  },
  {
    slug: "protocol/custody",
    title: "Custody and redemption",
    description:
      "How Aurove takes veNFT custody, what backing means, and how redeem releases inventory.",
    tags: ["protocol", "custody", "vault", "ledger", "redeem"],
    searchText:
      "custody vault manager mTokenId depositManaged redeem releaseVeBtc releaseVeMezo canSplit",
    Content: () => (
      <>
        <h1>Custody and redemption</h1>
        <VaultLifecycleDiagram />
        <h2>Deposit</h2>
        <p>
          <code>Ledger.depositErc20(variant, epochs, amount, to)</code> pulls BTC or MEZO, opens a
          four-week Mezo lock to the Ledger, then transfers that veNFT into the Vault.{" "}
          <code>Ledger.depositVeNft(variant, epochs, tokenId, to)</code> resets votes if needed,
          optionally relocks an expired NFT, then sends the NFT to the Vault.
        </p>
        <p>
          The Vault receiver deposits the NFT into the manager&apos;s managed Mezo position with{" "}
          <code>depositManaged</code>. Shares minted equal the locked underlying amount as{" "}
          <code>uint128</code>, 18 decimals.
        </p>
        <p>
          Each manager records its managed token id only in <code>onERC721Received</code>. The
          production managers currently report <code>mTokenId = 0</code>, so this path cannot
          complete until Mezo governance creates empty managed NFTs and <code>safeTransferFrom</code>
          s them to the managers. Raw <code>transferFrom</code> would not set the id. The Ledger{" "}
          <code>lockedVault</code> is already the Vault proxy. <code>normalVault</code> is unset.
        </p>
        <h2>Backing</h2>
        <p>
          ERC-1155 supply is meant to track vault-custodied inventory for that tranche.{" "}
          <code>trancheAssets</code> counts vault-held ids only. A third party that{" "}
          <code>depositManaged</code>s into the same manager NFT (for example another protocol) does
          not mint Aurove shares. A later valuation decrease updates the checkpoint and does not burn
          supply.
        </p>
        <h2>Redeem</h2>
        <p>
          <code>Ledger.redeem(trancheId, amount, receiver, tokenIds)</code>:
        </p>
        <ol>
          <li>
            Claims rebases for the listed ids.
          </li>
          <li>Burns <code>amount</code> ERC-1155 units.</li>
          <li>
            BTC: <code>Vault.releaseVeBtc</code>, which may split the last NFT if Mezo{" "}
            <code>canSplit(Vault)</code> is true.
          </li>
          <li>
            MEZO: <code>Vault.releaseVeMezo</code> withdraws each listed id in full.
          </li>
          <li>
            Requires <code>assetsOut == amount</code>.
          </li>
        </ol>
        <p>
          Receiver gets veNFTs. Aurove adds no settlement window and no per-account redeem lock. Mezo
          still enforces epoch windows and one managed operation per child per epoch.
        </p>
        <p>
          Live check: <code>veBTC.canSplit(Vault)</code> is false, so exact BTC redeem that needs a
          split currently fails.
        </p>
        <AddressTable
          ids={["ledger", "vault", "avbtcm-manager", "avmezom-manager", "manager-beacon", "manager-impl"]}
        />
        <p>
          User steps: <DocRouteLink href="/docs/guides/redeem">Redeem</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "protocol/rewards",
    title: "Rewards and epochs",
    description:
      "Instant reward accounting, weekly activation, rebase claims, ID20 gauges, and what is not paid to holders.",
    tags: ["protocol", "rewards", "epochs", "instant rewards"],
    searchText:
      "instant rewards epoch 1 weeks active inactive claimRebases rewardSink id20 gauge notifyReward fee bps",
    Content: () => (
      <>
        <h1>Rewards and epochs</h1>
        <p>
          Core uses <strong>InstantRewards</strong>. ID20 gauges use the same model via{" "}
          <strong>RewardsBook</strong>. There is no streaming reward contract in this deployment.
        </p>
        <h2>Epochs</h2>
        <p>
          An epoch is <code>block.timestamp / 1 weeks</code>. Units minted in epoch <code>E</code>{" "}
          stay inactive through <code>E</code> and become eligible at the boundary into{" "}
          <code>E+1</code>. Time passing does not drip rewards. A notification immediately increases
          a Q128 index over <em>currently active</em> units.
        </p>
        <h2>Mezo Earn inventory growth</h2>
        <p>
          Anyone may call <code>Ledger.claimRebases(trancheId, tokenIds)</code>. The deprecated{" "}
          <code>claimRebases(uint256[] trancheIds)</code> is a no-op.
        </p>
        <ol>
          <li>
            The manager claims the Mezo RewardsDistributor if claimable. The distributor address is
            pinned on first claim.
          </li>
          <li>
            The Vault measures inventory growth on listed custodied ids (locked amount, or weights
            plus LockedManagedReward earned for managed children). Only positive deltas mint.
          </li>
          <li>The Ledger mints that growth as ERC-1155 units to the tranche RewardSink.</li>
          <li>
            The sink <code>syncRewardFunding</code> takes the protocol fee, then notifies the net
            amount.
          </li>
        </ol>
        <p>
          Holders claim with <code>RewardSink.claimRewards</code>. ID20 wrappers harvest with{" "}
          <code>claimRewardsAndCall(abi.encode(gauge))</code>.
        </p>
        <p>
          The live fee config is <code>feeConfig() → (feeBps, feeRecipient)</code>. On the deployed
          Ledger this currently returns <code>0</code> bps and the zero address. Do not assume a 10%
          fee unless that function later reads a non-zero value. Fee proposals are owner-only, frozen
          in the last 48 hours of an epoch, and executable next epoch.
        </p>
        <RewardFlowDiagram />
        <h2>ID20 gauge</h2>
        <p>
          <code>AuroveId20.rewardSink()</code> returns the Id20Gauge, not the core RewardSink.{" "}
          <code>auroveRewardSink()</code> is the upstream core sink. Permissionless{" "}
          <code>AuroveId20.claimRewards()</code> harvests upstream units into the gauge.
        </p>
        <p>
          <code>Id20Gauge.activate()</code> is a permanent opt-in. Existing untracked balance becomes
          settled for the <em>next</em> epoch. Activated holders claim with{" "}
          <code>claim(receiver)</code>, paid in the same ID20. Transfers involving non-activated
          accounts use credit/debt; credit-classified balance cannot be unwrapped until{" "}
          <code>settleCredit</code>.
        </p>
        <h2>Four different payouts</h2>
        <table>
          <thead>
            <tr>
              <th>Payout</th>
              <th>Who receives it</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Mezo Earn inventory growth</td>
              <td>Tranche / ID20 holders after claim</td>
              <td>Deployed</td>
            </tr>
            <tr>
              <td>Swap fees</td>
              <td>CL position owners via Collect fees</td>
              <td>Deployed for unstaked positions</td>
            </tr>
            <tr>
              <td>Mezo CL gauge emissions</td>
              <td>Staked CL positions</td>
              <td>Not configured — no pool gauges</td>
            </tr>
            <tr>
              <td>Voting incentives / bribes</td>
              <td>Gauge bribe contracts</td>
              <td>Not configured — tokens not whitelisted, no gauges</td>
            </tr>
          </tbody>
        </table>
        <p>
          Free managed rewards claimed with <code>Vault.claimFreeManagedRewards</code> split 1% to
          the caller and 99% to the VeNftManager. They are not distributed to fraction holders.
          Maintainer <code>claimBribes</code> / <code>claimFees</code> also land on the manager.
        </p>
        <AddressTable ids={["avbtcm-sink", "avmezom-sink", "sink-beacon", "sink-impl", "avbtcm-gauge", "avmezom-gauge"]} />
      </>
    ),
  },
  {
    slug: "protocol/liquidity",
    title: "Concentrated liquidity",
    description:
      "Aurove CL pools, the zap router, swap fees, and why Mezo pool gauges are not yet available.",
    tags: ["protocol", "liquidity", "cl", "gauges", "zap"],
    searchText:
      "concentrated liquidity MUSD avBTCm pool tick spacing 200 zap router incentivise gauge voter",
    Content: () => (
      <>
        <h1>Concentrated liquidity</h1>
        <LiquidityFlowDiagram />
        <p>
          Aurove created two Mezo CL pools (tick spacing 200). The zap router can deposit, wrap to
          ID20, swap along factory-validated paths, and mint or increase a position NFT.
        </p>
        <AddressTable
          ids={[
            "pool-musd-avbtcm",
            "pool-avbtcm-avmezom",
            "cl-factory",
            "cl-pool-impl",
            "cl-swap-router",
            "npm",
            "zap-router",
            "swap-adapter",
            "liquidity-adapter",
          ]}
        />
        <Callout variant="warning" title="Pool clones are not independently verified">
          The two pool addresses are CLFactory clones. Neither Blockscout nor Sourcify verifies those
          clone addresses. The CLPool implementation they delegate to is verified on Blockscout. See{" "}
          <DocRouteLink href="/docs/developers/deployment">Deployment reference</DocRouteLink>.
        </Callout>
        <h2>Pool token order</h2>
        <ul>
          <li>
            MUSD / avBTCm: token0 MUSD, token1 avBTCm.
          </li>
          <li>
            avBTCm / avMEZOm: token0 avMEZOm, token1 avBTCm.
          </li>
        </ul>
        <h2>Zap behaviour</h2>
        <ul>
          <li>
            Swap entrypoints: <code>zapErc20ExactInput/Output</code>, <code>zapVeNft*</code>,{" "}
            <code>zapTranche*</code>.
          </li>
          <li>
            Liquidity entrypoints cover ERC-20, veNFT, and tranche combinations for add and increase.
          </li>
          <li>One side of a new position may be zero; both cannot.</li>
          <li>Exact-output leftovers are refunded as ID20.</li>
          <li>Direct ERC-1155 transfers to the router revert unless they are mint or router-operated.</li>
        </ul>
        <h2>Mezo pool gauges</h2>
        <p>
          <code>pool.gauge()</code> and <code>Voter.gauges(pool)</code> are zero for both pools.
          avBTCm and avMEZOm are not <code>isWhitelistedToken</code> on the pool Voter. Until those
          Mezo actions complete, there are no CL gauge emissions and no bribe recipient to
          incentivise.
        </p>
        <p>
          Do not confuse Id20Gauges (Aurove, already deployed) with Mezo CL gauges (not created).
        </p>
      </>
    ),
  },
  {
    slug: "protocol/roles",
    title: "Upgradeability and roles",
    description:
      "Proxy layout, who can upgrade, vote/swap maintainers, and the ID20 immutability boundary.",
    tags: ["protocol", "upgrade", "owner", "roles", "trust"],
    searchText:
      "upgradeability uups beacon owner proposeFeeConfig vote maintainer swap maintainer id20 immutable",
    Content: () => (
      <>
        <h1>Upgradeability and roles</h1>
        <h2>Upgradeable core</h2>
        <table>
          <thead>
            <tr>
              <th>Contract</th>
              <th>Pattern</th>
              <th>Authority</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ledger</td>
              <td>UUPS + Ownable2Step</td>
              <td>
                Accepted owner <code>0x7B64129635102f7bE831688CF20B4c900fba1653</code>
              </td>
            </tr>
            <tr>
              <td>Vault</td>
              <td>UUPS</td>
              <td>
                <code>msg.sender == Ledger.owner()</code>; candidate must match immutable beacons,
                Ledger, veBTC, and veMEZO
              </td>
            </tr>
            <tr>
              <td>VeNftManager / RewardSink</td>
              <td>Beacon proxies</td>
              <td>
                Beacons owned by the Ledger. Owner calls <code>upgradeManagerBeacon</code> /{" "}
                <code>upgradeRewardSinkBeacon</code>
              </td>
            </tr>
          </tbody>
        </table>
        <h2>Immutable ID20 package</h2>
        <p>
          Id20Factory, AuroveId20, Id20Gauge, AuroveZapRouter, SwapAdapter, and LiquidityAdapter have
          no owner, pause, or proxy. A wrapper snapshots <code>vault.rewardSinkOfTranche</code> at
          creation and does not follow a later vault remapping.
        </p>
        <h2>Permissionless versus restricted</h2>
        <ul>
          <li>
            <strong>Anyone:</strong> deposits, redeem, <code>claimRebases(trancheId, tokenIds)</code>,
            sink claims, ID20 wrap/unwrap/harvest, gauge activate/claim/settle, factory get-or-create,
            zap entrypoints, <code>executeFeeConfig</code>, <code>claimFreeManagedRewards</code>.
          </li>
          <li>
            <strong>Ledger owner:</strong> UUPS upgrades, one-time <code>setLockedVault</code>, fee
            proposals, beacon upgrades, manager maintainer allowlists, <code>createBoostGauge</code>.
          </li>
          <li>
            <strong>Vote maintainers:</strong> <code>vote</code>, <code>claimBribes</code>,{" "}
            <code>claimFees</code>, selected reward claims.
          </li>
          <li>
            <strong>Swap maintainers:</strong> <code>withdrawTokens</code> from a manager.
          </li>
        </ul>
        <p>
          Admin functions are not user integration paths. Addresses:{" "}
          <DocRouteLink href="/docs/developers/deployment">Deployment reference</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "protocol/security",
    title: "Security and limitations",
    description:
      "Trust assumptions, launch-configuration blockers, and known behavioural limits of the deployed system.",
    tags: ["protocol", "security", "limitations", "risks"],
    searchText:
      "security limitations mTokenId canSplit whitelist surplus credit activate grant-backed foreign deposit",
    Content: () => (
      <>
        <h1>Security and limitations</h1>
        <ProductionStatus />
        <h2>Trust assumptions</h2>
        <ul>
          <li>Users trust the Ledger owner not to upgrade core contracts maliciously.</li>
          <li>Users trust Mezo Earn, voters, distributors, and CL infrastructure.</li>
          <li>
            Users trust vote/swap maintainers with operational Mezo actions, not with user ERC-1155
            balances.
          </li>
          <li>ID20 contracts cannot be upgraded; bugs there are permanent.</li>
        </ul>
        <h2>Launch configuration still incomplete</h2>
        <ul>
          <li>Both managers: <code>mTokenId = 0</code> — managed deposits cannot start.</li>
          <li>
            <code>veBTC.canSplit(Vault) = false</code> — exact BTC redeem that needs a split fails.
          </li>
          <li>avBTCm and avMEZOm are not whitelisted on the pool Voter.</li>
          <li>Neither Aurove CL pool has a Mezo gauge.</li>
        </ul>
        <h2>Behavioural limits</h2>
        <ul>
          <li>Managed products only. <code>epochs</code> on deposit is ignored.</li>
          <li>Redeem returns veNFTs, not ERC-20 BTC/MEZO.</li>
          <li>MEZO inventory is indivisible. BTC split depends on Mezo permission.</li>
          <li>Mezo first-hour and one-managed-op-per-epoch rules still apply.</li>
          <li>Grant-backed veNFTs revert until vesting ends.</li>
          <li>Foreign managed deposits into the same mTokenId do not mint Aurove shares.</li>
          <li>Valuation decreases do not burn tranche supply.</li>
          <li>Zero-eligible-supply remainders can sit in reward accounting with no sweep.</li>
          <li>ID20 surplus backing cannot be recovered. Gauge activate is permanent.</li>
          <li>
            Credit-classified ID20 cannot unwrap until settlement. Transfers can revert on gauge
            credit rules.
          </li>
          <li>
            Zap exact-output leftovers are ID20. The router ERC-1155 callback has no in-flight flag.
          </li>
        </ul>
        <h2>Verification coverage</h2>
        <p>
          Verification is listed per address in the{" "}
          <DocRouteLink href="/docs/developers/deployment">deployment reference</DocRouteLink>.
          User-facing ID20 tokens, Id20Gauges, and zap adapters are verified on Sourcify only, not
          on Blockscout. The two CL pool clones are not independently verified. The Ledger owner is
          an EOA.
        </p>
      </>
    ),
  },
];
