import { Callout } from "@/components/docs/callout";
import { DocRouteLink } from "@/components/docs/doc-route-link";
import { DocsCard, DocsCardGrid } from "@/components/docs/docs-card";
import { MEZO_CHAIN_ID, MEZO_EXPLORER, MEZO_RPC_HTTP } from "@/lib/docs/contracts-reference";
import type { DocPageDefinition } from "@/lib/docs/types";
import { AddressTable, ProductionStatus } from "./shared";

export const GUIDE_PAGES: DocPageDefinition[] = [
  {
    slug: "guides/what-is-aurove",
    title: "What is Aurove",
    description:
      "Aurove turns locked Mezo Earn positions into liquid tokens you can hold, swap, or use as liquidity.",
    tags: ["guides", "overview", "avBTCm", "avMEZOm"],
    searchText:
      "what is aurove liquid veBTC veMEZO avBTCm avMEZOm Mezo Earn swap liquidity academy",
    Content: () => (
      <>
        <h1>What is Aurove</h1>
        <p>
          <strong>Aurove</strong> keeps a Mezo Earn lock working in the background and gives you a
          liquid token instead of an illiquid NFT. You can deposit BTC, MEZO, or an existing{" "}
          <strong>veBTC</strong> / <strong>veMEZO</strong> position. Aurove custodies that lock and
          issues you a fungible claim.
        </p>
        <p>
          The production products are <strong>avBTCm</strong> (liquid managed BTC) and{" "}
          <strong>avMEZOm</strong> (liquid managed MEZO). You can hold the claim as an ERC-1155
          tranche unit or as an ERC-20 wrapper of the same unit.
        </p>
        <h2>What the dApp offers</h2>
        <ul>
          <li>
            <strong>Swap</strong> — swap supported assets, including routes that deposit and wrap
            before trading.
          </li>
          <li>
            <strong>Liquidity</strong> — add concentrated liquidity to MUSD / avBTCm or avBTCm /
            avMEZOm.
          </li>
          <li>
            <strong>Earn</strong> — create a liquid position, view balances, claim rewards, unwrap,
            and redeem.
          </li>
          <li>
            <strong>Academy</strong> — points, tasks, a leaderboard, and referrals after Sign In.
          </li>
        </ul>
        <ProductionStatus />
        <h2>Start here</h2>
        <DocsCardGrid>
          <DocsCard
            title="Connect a wallet"
            description="Use Connect Wallet and switch to Mezo Mainnet."
            href="/docs/guides/connect-wallet"
          />
          <DocsCard
            title="Create a position"
            description="Lock BTC or MEZO, or deposit an existing Mezo Earn NFT."
            href="/docs/guides/create-position"
          />
          <DocsCard
            title="How the protocol works"
            description="Custody, wrapping, rewards, and redemption."
            href="/docs/protocol/overview"
          />
          <DocsCard
            title="View positions"
            description="Where Earn shows balances, ID20 holdings, and rewards."
            href="/docs/guides/positions"
          />
          <DocsCard
            title="Risks"
            description="Approvals, irreversible actions, and Mezo dependencies."
            href="/docs/guides/risks"
          />
        </DocsCardGrid>
      </>
    ),
  },
  {
    slug: "guides/prerequisites",
    title: "Prerequisites",
    description:
      "What you need before using Aurove: a Mezo wallet, BTC for gas, and a supported asset.",
    tags: ["guides", "wallet", "assets", "btc", "mezo", "musd"],
    searchText: "prerequisites mezo mainnet 31612 btc gas veBTC veMEZO musd wallet explorer",
    Content: () => (
      <>
        <h1>Prerequisites</h1>
        <p>
          Aurove runs on <strong>Mezo</strong>. The production interface expects chain id{" "}
          <code>{MEZO_CHAIN_ID}</code>. Native gas is <strong>BTC</strong>.
        </p>
        <h2>What you need</h2>
        <ul>
          <li>
            A wallet that can add a custom network (RainbowKit supports injected wallets and
            WalletConnect).
          </li>
          <li>
            <strong>BTC</strong> on Mezo for transaction fees.
          </li>
          <li>
            A supported input asset if you want to create a position or swap: BTC, MEZO, MUSD,
            veBTC, veMEZO, avBTCm, or avMEZOm.
          </li>
        </ul>
        <h2>Wallet network</h2>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Network name</td>
              <td>Mezo Mainnet</td>
            </tr>
            <tr>
              <td>Chain id</td>
              <td>
                <code>{MEZO_CHAIN_ID}</code>
              </td>
            </tr>
            <tr>
              <td>Currency</td>
              <td>BTC</td>
            </tr>
            <tr>
              <td>RPC</td>
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
          The header shows <strong>Network Mezo Mainnet</strong> when you are on the expected chain.
          If you see <strong>Wrong Network</strong>, approve the switch in your wallet.
        </p>
        <h2>Supported assets</h2>
        <AddressTable ids={["btc", "mezo", "musd", "vebtc", "vemezo", "avbtcm", "avmezom"]} />
        <Callout variant="info" title="No faucet">
          Aurove does not include a token faucet. Obtain BTC, MEZO, or MUSD through Mezo itself or
          another mainnet source.
        </Callout>
        <p>
          Next: <DocRouteLink href="/docs/guides/connect-wallet">Connect a wallet</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "guides/connect-wallet",
    title: "Connect a wallet",
    description: "Connect with RainbowKit, switch to Mezo Mainnet, and sign in for Academy.",
    tags: ["guides", "wallet", "connect", "sign-in"],
    searchText: "connect wallet wrong network sign in rainbowkit mezo mainnet academy",
    Content: () => (
      <>
        <h1>Connect a wallet</h1>
        <p>
          Swap, Liquidity, and Earn need a connected wallet on Mezo. Academy personalization also
          needs <strong>Sign In</strong>.
        </p>
        <h2>Before you start</h2>
        <ul>
          <li>
            Complete <DocRouteLink href="/docs/guides/prerequisites">Prerequisites</DocRouteLink>.
          </li>
          <li>Have your wallet extension or mobile WalletConnect session ready.</li>
        </ul>
        <h2>Steps</h2>
        <ol>
          <li>
            Open the app and click <strong>Connect Wallet</strong> in the header.
          </li>
          <li>Choose an installed wallet or scan a WalletConnect QR code.</li>
          <li>Approve the connection in the wallet.</li>
          <li>
            Confirm the header badge reads <strong>Network Mezo Mainnet</strong>. If it reads{" "}
            <strong>Wrong Network</strong>, click that button and approve the switch.
          </li>
          <li>
            For Academy, click <strong>Sign In</strong> and sign the authentication message.
          </li>
        </ol>
        <h2>What you should see</h2>
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Header</th>
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
                <strong>Wrong Network</strong> and a red network badge
              </td>
            </tr>
            <tr>
              <td>Connected</td>
              <td>Shortened address</td>
            </tr>
            <tr>
              <td>Connected, not signed in</td>
              <td>
                <strong>Sign In</strong> next to the address
              </td>
            </tr>
          </tbody>
        </table>
        <h2>If something fails</h2>
        <ul>
          <li>Rejecting the connection returns you to Connect Wallet. Start again.</li>
          <li>
            Rejecting the network switch leaves Wrong Network visible. No Aurove transaction will
            send.
          </li>
          <li>
            You can use Swap, Liquidity, and Earn without Sign In. Academy points stay locked until
            you sign.
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "guides/create-position",
    title: "Create a liquid position",
    description:
      "Use Earn to lock BTC or MEZO, or deposit an existing veBTC or veMEZO position, and receive avBTCm or avMEZOm.",
    tags: ["guides", "earn", "deposit", "lock", "venft"],
    searchText:
      "create liquid position lock tokens deposit position avBTCm avMEZOm earn stake approve",
    Content: () => (
      <>
        <h1>Create a liquid position</h1>
        <p>
          Earn converts BTC, MEZO, or an existing Mezo Earn NFT into a liquid Aurove product. Open{" "}
          <DocRouteLink href="/earn">Earn</DocRouteLink>, choose <strong>avBTCm</strong> or{" "}
          <strong>avMEZOm</strong>, then use <strong>Create position</strong>.
        </p>
        <ProductionStatus />
        <h2>What you receive</h2>
        <p>
          A successful deposit mints ERC-1155 tranche units of <strong>avBTCm</strong> or{" "}
          <strong>avMEZOm</strong> to your wallet, 1:1 with the locked underlying amount (18
          decimals). Earn does not wrap those units into ERC-20 for you. Swap and liquidity zaps can
          wrap them into the ERC-20 of the same symbol. See{" "}
          <DocRouteLink href="/docs/guides/assets">Understand Aurove assets</DocRouteLink>.
        </p>
        <h2>Before you start</h2>
        <ul>
          <li>Connect a wallet on Mezo Mainnet.</li>
          <li>
            For <strong>Lock tokens</strong>: BTC or MEZO in the wallet, plus BTC for gas.
          </li>
          <li>
            For <strong>Deposit position</strong>: a veBTC or veMEZO NFT you own. Grant-backed NFTs
            that are still vesting are rejected. Voted NFTs are reset before custody.
          </li>
        </ul>
        <h2>Lock BTC or MEZO</h2>
        <ol>
          <li>
            Open <DocRouteLink href="/earn">/earn</DocRouteLink>.
          </li>
          <li>
            On the asset card, click <strong>Create position</strong>, or go to{" "}
            <DocRouteLink href="/earn/stake/btc?mode=lock" code>
              /earn/stake/btc?mode=lock
            </DocRouteLink>{" "}
            or{" "}
            <DocRouteLink href="/earn/stake/mezo?mode=lock" code>
              /earn/stake/mezo?mode=lock
            </DocRouteLink>
            .
          </li>
          <li>
            Select the <strong>Lock tokens</strong> tab and the <strong>BTC</strong> or{" "}
            <strong>MEZO</strong> asset.
          </li>
          <li>
            Enter an <strong>Amount</strong>, or use the balance slider.
          </li>
          <li>
            Click <strong>Continue</strong>, then <strong>Create a liquid position</strong>.
          </li>
          <li>
            If needed, first approve the Ledger to spend the token (<strong>Approve BTC</strong> or{" "}
            <strong>Approve MEZO</strong>). That approval is separate from the deposit.
          </li>
          <li>Confirm the deposit in your wallet.</li>
        </ol>
        <p>
          On success the card shows <strong>Transaction complete</strong> and your wallet holds
          ERC-1155 units. The underlying is locked in Mezo Earn under Aurove custody, not returned
          as an ERC-20.
        </p>
        <h2>Deposit an existing Mezo Earn position</h2>
        <ol>
          <li>
            Open{" "}
            <DocRouteLink href="/earn/stake/btc" code>
              /earn/stake/btc
            </DocRouteLink>{" "}
            or{" "}
            <DocRouteLink href="/earn/stake/mezo" code>
              /earn/stake/mezo
            </DocRouteLink>
            .
          </li>
          <li>
            Keep the <strong>Deposit position</strong> tab selected.
          </li>
          <li>
            Under <strong>Existing position</strong>, choose the veNFT. The menu lists{" "}
            <code>veBTC #id</code> or <code>veMEZO #id</code>.
          </li>
          <li>
            Click <strong>Deposit position</strong>.
          </li>
          <li>
            Approve the NFT if prompted (<strong>Approve veNFT</strong>), then confirm the deposit.
          </li>
        </ol>
        <p>
          On success you receive the same product as a token lock. An expired non-permanent lock is
          withdrawn and re-locked for four weeks before custody; share amount follows the withdrawn
          cash, not leftover lock metadata.
        </p>
        <h2>What changes on-chain</h2>
        <ul>
          <li>
            <code>Ledger.depositErc20</code> or <code>Ledger.depositVeNft</code> runs.
          </li>
          <li>
            The Vault takes the veNFT and Mezo records a managed deposit into the Aurove manager.
          </li>
          <li>You receive ERC-1155 units. You do not keep the original veNFT.</li>
        </ul>
        <h2>If the transaction fails</h2>
        <ul>
          <li>
            <strong>Managers not configured.</strong> Deposits revert while each manager&apos;s{" "}
            <code>mTokenId</code> is zero.
          </li>
          <li>
            <strong>Not enough balance</strong> or a missing approval. Fix the amount or complete
            Approve first.
          </li>
          <li>
            <strong>Mezo timing.</strong> Managed deposit and withdraw can be unavailable in the
            first hour of a Mezo epoch, and a child veNFT can only do one managed operation per
            epoch.
          </li>
          <li>
            <strong>Grant-backed NFT.</strong> Wait until vesting ends, or use a different position.
          </li>
        </ul>
        <p>
          Contract detail:{" "}
          <DocRouteLink href="/docs/developers/earn">Earn integration</DocRouteLink>. Design:{" "}
          <DocRouteLink href="/docs/protocol/custody">Custody and redemption</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "guides/assets",
    title: "Understand Aurove assets",
    description: "How avBTCm and avMEZOm exist as ERC-1155 tranche units and ERC-20 ID20 wrappers.",
    tags: ["guides", "avBTCm", "avMEZOm", "erc1155", "id20"],
    searchText: "understand assets tranche id20 wrapper avBTCm avMEZOm fractions backing",
    Content: () => (
      <>
        <h1>Understand Aurove assets</h1>
        <p>
          Each product has one underlying lock and two user-facing representations. They are not
          different yields. They are different token standards for the same claim.
        </p>
        <table>
          <thead>
            <tr>
              <th>You hold</th>
              <th>Standard</th>
              <th>Symbol</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Tranche units</td>
              <td>ERC-1155 on the Ledger</td>
              <td>avBTCm or avMEZOm</td>
              <td>Direct claim on vault-custodied inventory. Used for redemption.</td>
            </tr>
            <tr>
              <td>ID20 wrapper</td>
              <td>ERC-20</td>
              <td>avBTCm or avMEZOm</td>
              <td>1:1 wrapper of those units. Used for Swap and Liquidity.</td>
            </tr>
          </tbody>
        </table>
        <p>
          The Ledger collection itself is named <strong>Liquid locked veNFTs - Aurove</strong> with
          symbol <strong>avNFTs</strong>. Individual products still display as avBTCm and avMEZOm.
        </p>
        <h2>Wrapping and unwrapping</h2>
        <p>
          There is no <code>wrap()</code> function. Transfer the ERC-1155 units to the ID20 contract
          with <code>safeTransferFrom</code>. Empty callback data mints ERC-20 to the sender;
          encoded recipient data mints to that address. Swap and liquidity zaps do this for you.
        </p>
        <p>
          On Earn, <strong>Exit ID20 to tranche</strong> burns ERC-20 and returns ERC-1155. The
          button label is <strong>Exit to tranche</strong>. Backing is 1:1; surplus ERC-1155 left in
          the wrapper is not recoverable.
        </p>
        <h2>What redemption returns</h2>
        <p>
          Redeeming burns tranche units and transfers <strong>veNFT inventory</strong>, not BTC or
          MEZO ERC-20. Details: <DocRouteLink href="/docs/guides/redeem">Redeem</DocRouteLink>.
        </p>
        <p>
          Protocol definitions:{" "}
          <DocRouteLink href="/docs/protocol/assets">Assets and representations</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "guides/positions",
    title: "View positions",
    description: "Where Earn shows balances, ID20 holdings, and claimable rewards.",
    tags: ["guides", "earn", "balances", "positions"],
    searchText: "view positions available balance total balance id20 annualised apr earn",
    Content: () => (
      <>
        <h1>View positions</h1>
        <p>
          Open <DocRouteLink href="/earn">Earn</DocRouteLink> after connecting a wallet. The page
          has three sections: available assets, your positions, and rewards.
        </p>
        <h2>Position cards</h2>
        <p>Each open product shows:</p>
        <ul>
          <li>
            <strong>Available Balance</strong> — ERC-1155 units you can redeem.
          </li>
          <li>
            <strong>Total Balance</strong> — ERC-1155 held, including units that may still be
            inactive for rewards.
          </li>
          <li>
            <strong>ID20 Balance</strong> — ERC-20 wrapper balance.
          </li>
          <li>
            <strong>Annualised APR</strong> — a display estimate from recent funding, not a
            guarantee.
          </li>
          <li>
            <strong>Latest Weekly Rewards Funded</strong> — most recently observed sink funding.
          </li>
        </ul>
        <p>
          Empty wallets show no position cards. Creating a position or buying avBTCm / avMEZOm on
          Swap is how a card appears. See{" "}
          <DocRouteLink href="/docs/guides/create-position">Create a liquid position</DocRouteLink>{" "}
          and <DocRouteLink href="/docs/guides/swap">Swap</DocRouteLink>.
        </p>
        <h2>From here</h2>
        <ul>
          <li>
            <DocRouteLink href="/docs/guides/rewards">Claim rewards</DocRouteLink>
          </li>
          <li>
            <DocRouteLink href="/docs/guides/redeem">Redeem</DocRouteLink> or unwrap ID20
          </li>
          <li>
            <DocRouteLink href="/docs/guides/swap">Swap</DocRouteLink> or{" "}
            <DocRouteLink href="/docs/guides/liquidity">Provide liquidity</DocRouteLink>
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "guides/swap",
    title: "Swap",
    description: "Swap supported assets on the /swap interface, including deposit-and-wrap routes.",
    tags: ["guides", "swap", "review swap", "slippage"],
    searchText: "swap review sell buy slippage deadline aurove route direct pool route",
    Content: () => (
      <>
        <h1>Swap</h1>
        <p>
          Swap lives at{" "}
          <DocRouteLink href="/swap" code>
            /swap
          </DocRouteLink>
          . The app nav label is <strong>Swap</strong>. Legacy <code>/trade</code> redirects here.
        </p>
        <ProductionStatus>
          The Swap UI is live. Deposit-then-swap routes call the same Ledger deposit path as Earn,
          so they currently revert while managers have <code>mTokenId = 0</code>. Direct pool swaps
          also need inventory in the Aurove pools, which currently have zero Aurove token supply.
        </ProductionStatus>
        <h2>Before you start</h2>
        <ul>
          <li>Connect a wallet on Mezo Mainnet.</li>
          <li>Hold the asset you want to sell, plus BTC for gas.</li>
        </ul>
        <h2>Steps</h2>
        <ol>
          <li>
            Open <DocRouteLink href="/swap">Swap</DocRouteLink>.
          </li>
          <li>
            Choose <strong>Sell</strong> and <strong>Buy</strong> assets. Sell groups are{" "}
            <strong>ERC-20 tokens</strong>, <strong>veNFT positions</strong>, and{" "}
            <strong>Ledger tranches</strong>. Buy groups are <strong>ID20 tokens</strong> and{" "}
            <strong>Other ERC-20 tokens</strong>.
          </li>
          <li>Enter an amount. Use Max when you want the full wallet balance.</li>
          <li>
            Optionally open <strong>Swap settings</strong> to change slippage (0.01%–50%) and
            deadline (1–180 minutes).
          </li>
          <li>
            Review the quote: price, inverse price, route, and whether the path is a{" "}
            <strong>Direct pool route</strong> or an <strong>Aurove route</strong>.
          </li>
          <li>
            Click <strong>Review swap</strong>. Approve the token or NFT if asked. Approvals are
            separate from the swap.
          </li>
          <li>
            In <strong>Review swap</strong>, confirm the route, then click <strong>Swap</strong>.
          </li>
        </ol>
        <p>
          Success shows <strong>Swap confirmed</strong>. The bought asset is in your wallet. Some
          routes deposit and wrap into ID20 before the concentrated-liquidity hop; leftover
          exact-output value is refunded as ID20, not as the original BTC, MEZO, veNFT, or ERC-1155.
        </p>
        <h2>If something fails</h2>
        <ul>
          <li>
            <strong>No route</strong> or insufficient liquidity — try another pair or a smaller
            size.
          </li>
          <li>
            <strong>High price impact</strong> — the UI warns at 5% or more. Lower the size or
            accept the impact explicitly.
          </li>
          <li>
            <strong>Simulation failed</strong> — the route cannot execute as quoted. Refresh markets
            and try again.
          </li>
          <li>
            Rejecting the wallet prompt cancels the swap. Approvals already mined stay in place.
          </li>
        </ul>
        <p>
          Integrator detail:{" "}
          <DocRouteLink href="/docs/developers/liquidity">
            Swap and liquidity integration
          </DocRouteLink>
          .
        </p>
      </>
    ),
  },
  {
    slug: "guides/liquidity",
    title: "Provide liquidity",
    description:
      "Add, increase, and remove concentrated liquidity on MUSD / avBTCm and avBTCm / avMEZOm.",
    tags: ["guides", "liquidity", "cl", "zap"],
    searchText:
      "provide liquidity add supply MUSD avBTCm avMEZOm increase remove stake incentivise gauge",
    Content: () => (
      <>
        <h1>Provide liquidity</h1>
        <p>
          Open <DocRouteLink href="/liquidity">Liquidity</DocRouteLink>. The page lists two pools:
        </p>
        <ul>
          <li>
            <strong>MUSD / avBTCm</strong> — “Provide MUSD and liquid BTC Earn exposure.”
          </li>
          <li>
            <strong>avBTCm / avMEZOm</strong> — “Provide liquidity across Aurove BTC and MEZO
            assets.”
          </li>
        </ul>
        <ProductionStatus>
          The Liquidity UI is live. Adding liquidity from BTC, MEZO, or a veNFT uses the zap router
          deposit path, which currently reverts while managers have no managed veNFT. Neither pool
          has a Mezo CL gauge, so <strong>Incentivise gauge</strong> and position staking are not
          available.
        </ProductionStatus>
        <h2>Add liquidity</h2>
        <ol>
          <li>
            Click <strong>Add liquidity</strong> on a pool card, or open{" "}
            <DocRouteLink href="/liquidity/add/btc" code>
              /liquidity/add/btc
            </DocRouteLink>{" "}
            or{" "}
            <DocRouteLink href="/liquidity/add/mezo" code>
              /liquidity/add/mezo
            </DocRouteLink>
            .
          </li>
          <li>
            Choose funding sources for each side. The zap can take ERC-20, veNFT, or tranche units
            and wrap to ID20 as needed.
          </li>
          <li>
            Set the price range with <strong>Focused</strong>, <strong>Balanced</strong>,{" "}
            <strong>Full range</strong>, or <strong>Custom</strong>. See{" "}
            <DocRouteLink href="/docs/guides/price-range">Price ranges and fees</DocRouteLink>.
          </li>
          <li>
            If the flow uses ID20 that is not yet activated, confirm{" "}
            <strong>Activate avBTCm rewards</strong> or <strong>Activate avMEZOm rewards</strong>.
            Activation is permanent.
          </li>
          <li>
            Approve each input token or NFT, then click <strong>Supply liquidity</strong> /{" "}
            <strong>Add liquidity</strong>.
          </li>
        </ol>
        <p>
          On success you receive a Mezo CL position NFT from the NonfungiblePositionManager. Unused
          input is refunded. The position appears under your liquidity positions.
        </p>
        <h2>Increase or remove</h2>
        <p>
          Open a position card. You can increase liquidity, <strong>Remove liquidity</strong> or{" "}
          <strong>Remove all liquidity</strong>, and <strong>Collect fees</strong> when the position
          is not staked in a gauge.
        </p>
        <h2>Gauges</h2>
        <p>
          The UI includes <strong>Stake</strong>, <strong>Claim gauge rewards</strong>, and{" "}
          <strong>Incentivise gauge</strong>. Those controls require a live Mezo pool gauge. None is
          configured for the two Aurove pools today. Protocol background:{" "}
          <DocRouteLink href="/docs/protocol/liquidity">Concentrated liquidity</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "guides/price-range",
    title: "Price ranges and fees",
    description:
      "Choose a concentrated-liquidity price range, understand out-of-range liquidity, and collect swap fees.",
    tags: ["guides", "liquidity", "range", "fees"],
    searchText: "price range out of range collect fees tick spacing 200 current pool price",
    Content: () => (
      <>
        <h1>Price ranges and fees</h1>
        <p>
          Aurove pools are concentrated-liquidity pools with tick spacing <strong>200</strong>. Your
          liquidity earns swap fees only while the pool price is inside the range you set.
        </p>
        <h2>Select a range</h2>
        <ol>
          <li>
            Open the add-liquidity form for{" "}
            <DocRouteLink href="/liquidity/add/btc">MUSD / avBTCm</DocRouteLink> or{" "}
            <DocRouteLink href="/liquidity/add/mezo">avBTCm / avMEZOm</DocRouteLink>.
          </li>
          <li>
            Read <strong>Current pool price</strong> on the pool card.
          </li>
          <li>
            Choose <strong>Focused</strong>, <strong>Balanced</strong>, <strong>Full range</strong>,
            or <strong>Custom</strong>. Custom lets you set lower and upper ticks. Ticks must align
            with spacing 200.
          </li>
        </ol>
        <h2>In range versus out of range</h2>
        <ul>
          <li>
            <strong>In range</strong> — both assets are active in the pool. Swaps that cross your
            range pay you fees.
          </li>
          <li>
            <strong>Out of range</strong> — the position holds only one asset and earns no swap fees
            until price returns.
          </li>
        </ul>
        <p>
          Range selection does not create a Mezo Earn reward. Swap fees and Mezo Earn rewards are
          different. See{" "}
          <DocRouteLink href="/docs/protocol/rewards">Rewards and epochs</DocRouteLink>.
        </p>
        <h2>Collect swap fees</h2>
        <ol>
          <li>
            Open <DocRouteLink href="/liquidity">Liquidity</DocRouteLink> and select the position.
          </li>
          <li>
            Click <strong>Collect fees</strong>. This calls the position manager{" "}
            <code>collect</code> and sends owed tokens to your wallet.
          </li>
        </ol>
        <p>
          Collect is unavailable while a position is staked in a Mezo gauge. No Aurove pool gauge
          exists yet, so unstaked positions can collect when they have owed fees.
        </p>
      </>
    ),
  },
  {
    slug: "guides/rewards",
    title: "Claim rewards",
    description: "Claim ERC-1155 tranche rewards and ID20 gauge rewards from Earn.",
    tags: ["guides", "rewards", "claim", "gauge", "activate"],
    searchText: "claim rewards claimables id20 gauge activate claim all currently claimable earn",
    Content: () => (
      <>
        <h1>Claim rewards</h1>
        <p>
          Earn shows two claim surfaces: <strong>Claimables</strong> for ERC-1155 tranche units, and{" "}
          <strong>ID20 gauge rewards</strong> for wrapper holders who have activated.
        </p>
        <Callout variant="info" title="Rewards are not guaranteed">
          Displayed APR and “latest weekly rewards funded” are observations, not promises. Time
          passing does not accrue rewards by itself. Rewards appear when inventory growth is claimed
          and notified.
        </Callout>
        <h2>Claim tranche units</h2>
        <ol>
          <li>
            Open <DocRouteLink href="/earn">Earn</DocRouteLink>.
          </li>
          <li>
            Under <strong>Claimables</strong>, click <strong>Claim avBTCm</strong> or{" "}
            <strong>Claim avMEZOm</strong>.
          </li>
        </ol>
        <p>
          That calls the tranche RewardSink. You receive additional ERC-1155 units of the same
          product. Anyone may also harvest inventory growth with{" "}
          <code>Ledger.claimRebases(trancheId, tokenIds)</code> before claims have something to pay.
        </p>
        <h2>Activate and claim ID20 rewards</h2>
        <ol>
          <li>Hold avBTCm or avMEZOm ERC-20.</li>
          <li>
            Complete <strong>Activate avBTCm rewards</strong> or{" "}
            <strong>Activate avMEZOm rewards</strong> when the UI offers it. Activation is permanent
            and does not transfer tokens.
          </li>
          <li>
            Under <strong>ID20 gauge rewards</strong>, click <strong>Claim avBTCm</strong>,{" "}
            <strong>Claim avMEZOm</strong>, or <strong>Claim all</strong>.
          </li>
        </ol>
        <p>
          ID20 gauge rewards are paid in the same ID20 token. Newly received units stay inactive
          until the next weekly epoch. Details:{" "}
          <DocRouteLink href="/docs/protocol/rewards">Rewards and epochs</DocRouteLink>.
        </p>
        <h2>What these rewards are not</h2>
        <ul>
          <li>Not swap fees from a CL position.</li>
          <li>Not Mezo voting incentives or CL gauge emissions — those gauges are not created.</li>
          <li>
            Not free managed bribes or fees sitting on the VeNftManager. Those do not auto-pay
            fraction holders.
          </li>
        </ul>
      </>
    ),
  },
  {
    slug: "guides/redeem",
    title: "Redeem",
    description:
      "Burn avBTCm or avMEZOm tranche units and receive veNFT inventory, not BTC or MEZO ERC-20.",
    tags: ["guides", "redeem", "unwrap", "exit"],
    searchText: "redeem redemption amount select veNFTs exit to tranche unwrap irreversible",
    Content: () => (
      <>
        <h1>Redeem</h1>
        <p>
          Redemption burns ERC-1155 tranche units and sends you{" "}
          <strong>veBTC or veMEZO inventory</strong>. It does not withdraw BTC or MEZO ERC-20 to
          your wallet.
        </p>
        <Callout variant="important" title="No Aurove settlement window">
          Aurove does not add a weekly redemption window. Mezo still decides when a managed position
          can be withdrawn. The Earn card says redemptions are “Available whenever Mezo permits the
          selected managed inventory to withdraw.”
        </Callout>
        <h2>Unwrap ID20 first if needed</h2>
        <p>
          Redeem uses ERC-1155 units. If you only hold the ERC-20 wrapper, open{" "}
          <strong>Exit ID20 to tranche</strong> on the position card, enter an amount, and confirm.
          The button label is <strong>Exit to tranche</strong>, or{" "}
          <strong>Claim rewards &amp; exit</strong> / <strong>Settle credit &amp; exit</strong> /{" "}
          <strong>Claim, settle credit &amp; exit</strong> when those extra steps are required. With
          no wrapper balance it reads <strong>No ID20 balance</strong>.
        </p>
        <h2>Redeem tranche units</h2>
        <ol>
          <li>
            Open the Earn position card and expand <strong>Redemption</strong>.
          </li>
          <li>
            Under <strong>Select veNFTs to redeem</strong>, choose one or more vault-held NFTs.
          </li>
          <li>
            For BTC, enter a <strong>Redemption amount</strong>. For MEZO, the amount is the full
            selected inventory; MEZO ids are not split.
          </li>
          <li>
            Click <strong>Redeem</strong> and confirm.
          </li>
        </ol>
        <p>
          On success the selected veNFTs (or a BTC split piece) arrive in your wallet. Your ERC-1155
          balance decreases by the redeemed amount.
        </p>
        <h2>BTC versus MEZO</h2>
        <ul>
          <li>
            <strong>BTC</strong> can split an oversized vault NFT if Mezo has granted the Vault{" "}
            <code>canSplit</code>. That permission is currently false, so exact-amount BTC redeem
            can fail.
          </li>
          <li>
            <strong>MEZO</strong> redeems whole selected NFTs. You may need to combine sink or
            fee-collector units so the burn amount matches the inventory.
          </li>
        </ul>
        <h2>If redeem reverts</h2>
        <ul>
          <li>
            Mezo first-hour distribution window or a second managed operation in the same epoch.
          </li>
          <li>Selected inventory larger than your redeemable ERC-1155 balance.</li>
          <li>
            BTC split required while Vault <code>canSplit</code> is false.
          </li>
        </ul>
        <p>
          This action is irreversible once mined: units are burned and the veNFT leaves Aurove
          custody. Protocol:{" "}
          <DocRouteLink href="/docs/protocol/custody">Custody and redemption</DocRouteLink>.
        </p>
      </>
    ),
  },
  {
    slug: "guides/academy",
    title: "Academy",
    description: "Points, tasks, leaderboard, and referrals after wallet Sign In.",
    tags: ["guides", "academy", "points", "quests", "referrals"],
    searchText: "academy points quests tasks leaderboard referrals sign in visible after wallet",
    Content: () => (
      <>
        <h1>Academy</h1>
        <p>
          <DocRouteLink href="/academy">Academy</DocRouteLink> tracks points, tasks, a leaderboard,
          and a referral link. It is an application layer on top of the protocol, not an on-chain
          yield contract.
        </p>
        <h2>Sign in</h2>
        <ol>
          <li>Connect a wallet on Mezo Mainnet.</li>
          <li>
            Click <strong>Sign In</strong> and sign the message.
          </li>
        </ol>
        <p>
          Without a session, personalized stats stay behind “Visible after wallet authentication.”
        </p>
        <h2>What you can do</h2>
        <ul>
          <li>
            Read <strong>Current points</strong>, <strong>Current rank</strong>, and{" "}
            <strong>Season</strong>. Unauthenticated points show{" "}
            <strong>Visible after wallet authentication.</strong>
          </li>
          <li>
            Complete the task carousel. Today it lists:
            <ul>
              <li>
                <strong>Liquidity provider task</strong> —{" "}
                <strong>Collect fees, earn points</strong>. Copy says{" "}
                <strong>3.6 points per MUSD</strong> of collected fee value. CTA{" "}
                <strong>Go to liquidity</strong>.
              </li>
              <li>
                <strong>Swapper task</strong> — <strong>Swap through Aurove</strong>. Copy says{" "}
                <strong>0.12% of the input token&apos;s MUSD value</strong>. CTA{" "}
                <strong>Open swap</strong> (the app link is{" "}
                <DocRouteLink href="/swap" code>
                  /swap
                </DocRouteLink>
                ).
              </li>
            </ul>
          </li>
          <li>
            Browse the <strong>Leaderboard</strong> and <strong>Your position</strong>.
          </li>
          <li>
            Copy your <strong>Referral link</strong> (<strong>Copy</strong> /{" "}
            <strong>Copied</strong>
            ).
          </li>
        </ul>
        <Callout variant="info">
          Academy points are an application score, not avBTCm, avMEZOm, on-chain swap fees, or Mezo
          gauge emissions. The rates above are what the current Academy carousel shows; they are not
          on-chain guarantees.
        </Callout>
      </>
    ),
  },
  {
    slug: "guides/risks",
    title: "Risks",
    description:
      "Approvals, slippage, irreversible actions, custody, upgradeability, and Mezo dependencies.",
    tags: ["guides", "risks", "approvals", "slippage"],
    searchText:
      "risks approvals slippage irreversible redeem upgrade owner mezo epoch grant-backed",
    Content: () => (
      <>
        <h1>Risks</h1>
        <p>
          Aurove is an on-chain protocol with upgradeable core contracts and external Mezo
          dependencies. Read this before signing.
        </p>
        <h2>Approvals</h2>
        <p>
          Token and NFT approvals are separate from the final action. Approving the Ledger, zap
          router, or position manager lets that contract move the approved asset until you revoke
          the allowance. Review the spender address in your wallet.
        </p>
        <h2>Slippage and quotes</h2>
        <p>
          Swap and liquidity quotes can change before confirmation. Settings default to a slippage
          bound; a high-impact swap shows an explicit warning. Failed simulation means the quoted
          path is no longer executable.
        </p>
        <h2>Irreversible actions</h2>
        <ul>
          <li>Deposits send your BTC, MEZO, or veNFT into Aurove/Mezo custody.</li>
          <li>
            Redeems burn tranche units and return veNFTs, not the original ERC-20 in the general
            case.
          </li>
          <li>ID20 gauge activation cannot be undone.</li>
          <li>Expired locks may be re-locked for four weeks before custody.</li>
        </ul>
        <h2>Smart-contract and custody risk</h2>
        <ul>
          <li>The Ledger and Vault are UUPS-upgradeable by the Ledger owner.</li>
          <li>Managers and sinks follow beacons also controlled by the Ledger owner.</li>
          <li>ID20 wrappers, gauges, the factory, and the zap router are not upgradeable.</li>
          <li>
            Mezo Earn, voters, and CL contracts are external. When they revert, Aurove reverts.
          </li>
        </ul>
        <h2>Market and inventory risk</h2>
        <ul>
          <li>Out-of-range liquidity earns no swap fees.</li>
          <li>Displayed APR is not a rate you are owed.</li>
          <li>Foreign deposits into the same managed NFT do not mint you Aurove shares.</li>
          <li>
            Inventory valuation decreases do not burn supply; they lower the growth checkpoint.
          </li>
        </ul>
        <p>
          Fuller list:{" "}
          <DocRouteLink href="/docs/protocol/security">Security and limitations</DocRouteLink>.
        </p>
      </>
    ),
  },
];
